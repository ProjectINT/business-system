// Shared pieces of the rules: result builders, skip reasons, and lookups over the effective set
// that several rules need (properties in force, a reservation by id, payments by reservation).
// Rules read rows only through `ctx.units()` and statuses only through `ctx.statusSoFar()`.
import { nightsBetween, type CommissionRuleInput } from "../../calc";
import type { Entity as RowEntity } from "../../ingest";
import type { Action, AnyUnit, CheckContext, CheckResult, RowUnit, Status } from "../types";

export type Rows<E extends RowEntity> = readonly RowUnit<E>[];

// ── results ─────────────────────────────────────────────────────────────────

export function pass(u: AnyUnit): CheckResult {
  return { unitId: u.unitId, recordKey: u.recordKey, outcome: "pass" };
}

export function skip(u: AnyUnit, reason: string): CheckResult {
  return { unitId: u.unitId, recordKey: u.recordKey, outcome: "skip", reason };
}

export interface FailExtra {
  readonly action?: Action;
  /** Every `fail` carries its facts (VALIDATION_PLAN.md 3: details are facts, the UI builds the text). */
  readonly details: Readonly<Record<string, unknown>>;
  readonly relatedKeys?: readonly string[];
  readonly amountIdr?: bigint | undefined;
}

export function fail(u: AnyUnit, extra: FailExtra): CheckResult {
  const r: { -readonly [K in keyof CheckResult]: CheckResult[K] } = { unitId: u.unitId, recordKey: u.recordKey, outcome: "fail", details: extra.details };
  if (extra.action !== undefined) r.action = extra.action;
  if (extra.relatedKeys !== undefined) r.relatedKeys = extra.relatedKeys;
  if (extra.amountIdr !== undefined) r.amountIdr = extra.amountIdr;
  return r;
}

/** Reasons for `skip`, worded once so that the journal and the tests agree. */
export const SKIP = {
  notParsed: (field: string) => `${field} not parsed (DQ-03)`,
  out: "row excluded or duplicate by an earlier rule",
  cancelled: "cancelled reservation",
  notCancelled: "not a cancellation",
  notModified: "status is not modified",
  notConfirmed: "status is not confirmed",
  otaChannel: "channel is OTA",
  propertyUnknown: "property not found (DQ-04)",
  reservationUnknown: "reservation missing or excluded (DQ-05)",
  reservationAmbiguous: "reservation has several versions (DQ-02)",
  noStay: "no stay: check-out is not after check-in (DQ-07)",
  noGross: "gross booking value is not positive (DQ-07)",
  otaOutOfBounds: "OTA fee out of bounds (DQ-08)",
  zeroPayment: "zero payment (DQ-15)",
  exactDuplicate: "exact duplicate of an earlier row (DQ-01)",
  noKey: "row has no natural key (DQ-03)",
  checkInAhead: "check-in is still ahead",
  notReceived: "payment status is not received",
  notPaid: "expense not paid yet",
} as const;

// ── statuses ────────────────────────────────────────────────────────────────

/** `duplicate` or `excluded`: the row is out of the data, later rules skip it. */
export function isOut(status: Status): boolean {
  return status === "duplicate" || status === "excluded";
}

export function isOutUnit(ctx: CheckContext, u: RowUnit): boolean {
  return isOut(ctx.statusSoFar(u.unitId));
}

// ── values ──────────────────────────────────────────────────────────────────

/** The row's amount in whole IDR for `amountIdr`; undefined when it is not IDR or did not parse. */
export function amountIdrOf(u: RowUnit): bigint | undefined {
  const v = u.values as { currency?: string | null; amount?: bigint | null; gross_booking_value?: bigint | null };
  if (v.currency !== "IDR") return undefined;
  const amount = u.entity === "reservation" ? v.gross_booking_value : v.amount;
  return amount ?? undefined;
}

/** Nights of a reservation; null when a date did not parse. May be zero or negative (DQ-07). */
export function nightsOf(r: RowUnit<"reservation">): number | null {
  const { check_in, check_out } = r.values;
  return check_in === null || check_out === null ? null : nightsBetween(check_in, check_out);
}

export function isActive(r: RowUnit<"reservation">): boolean {
  return r.values.status === "confirmed" || r.values.status === "modified";
}

/** GBV − OTA − refund: what the channel should pay out (PLAN.md 7.4); zero for a cancellation. */
export function expectedPayout(r: RowUnit<"reservation">): bigint | null {
  const { gross_booking_value, ota_fee, refund_amount, status } = r.values;
  if (status === null || gross_booking_value === null || ota_fee === null || refund_amount === null) return null;
  if (status === "cancelled") return 0n;
  return gross_booking_value - ota_fee - refund_amount;
}

// ── lookups over the effective set ──────────────────────────────────────────

/** Properties in force by id: rows not excluded or duplicate; the first row by order when several. */
export function propertyIndex(ctx: CheckContext): ReadonlyMap<string, RowUnit<"property">> {
  const index = new Map<string, RowUnit<"property">>();
  for (const p of ctx.units("property")) {
    const id = p.values.property_id;
    if (id === null || isOutUnit(ctx, p) || index.has(id)) continue;
    index.set(id, p);
  }
  return index;
}

/** Commission rules in force as lib/calc wants them: parsed rows, not excluded or duplicate. */
export function commissionRulesInForce(ctx: CheckContext): readonly CommissionRuleInput[] {
  const rules: CommissionRuleInput[] = [];
  for (const u of ctx.units("commission_rule")) {
    const { property_id, effective_from, effective_to, management_fee_rate, fee_basis } = u.values;
    if (property_id === null || effective_from === null || management_fee_rate === null || fee_basis === null) continue;
    if (isOutUnit(ctx, u)) continue;
    rules.push({ propertyId: property_id, effectiveFrom: effective_from, effectiveTo: effective_to, rate: management_fee_rate, feeBasis: fee_basis });
  }
  return rules;
}

export type ReservationLookup =
  | { readonly kind: "missing" }
  | { readonly kind: "excluded"; readonly rows: Rows<"reservation"> }
  /** Several versions of the key are in play (DQ-02): no single row to read amounts from. */
  | { readonly kind: "ambiguous"; readonly rows: Rows<"reservation"> }
  | { readonly kind: "found"; readonly row: RowUnit<"reservation">; readonly status: Status };

/**
 * Reservations by id, as a payment sees them: exact duplicates do not count, excluded rows are
 * reported as such, several live versions are ambiguous, otherwise the one live row with its status.
 */
export function reservationLookup(ctx: CheckContext): (reservationId: string) => ReservationLookup {
  const byKey = new Map<string, RowUnit<"reservation">[]>();
  for (const r of ctx.units("reservation")) {
    if (r.recordKey === null) continue;
    const list = byKey.get(r.recordKey) ?? [];
    list.push(r);
    byKey.set(r.recordKey, list);
  }
  const cache = new Map<string, ReservationLookup>();
  return (id) => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const rows = (byKey.get(id) ?? []).filter((r) => ctx.statusSoFar(r.unitId) !== "duplicate");
    let found: ReservationLookup;
    if (rows.length === 0) found = { kind: "missing" };
    else {
      const live = rows.filter((r) => ctx.statusSoFar(r.unitId) !== "excluded");
      if (live.length === 0) found = { kind: "excluded", rows };
      else if (live.length > 1) found = { kind: "ambiguous", rows: live };
      else found = { kind: "found", row: live[0]!, status: ctx.statusSoFar(live[0]!.unitId) };
    }
    cache.set(id, found);
    return found;
  };
}

/** Payments that count, by reservation id: parsed, not excluded or duplicate. A held payment counts: it is real money. */
export function paymentsByReservation(ctx: CheckContext): ReadonlyMap<string, Rows<"payment">> {
  const index = new Map<string, RowUnit<"payment">[]>();
  for (const p of ctx.units("payment")) {
    const id = p.values.reservation_id;
    if (id === null || p.values.amount === null || p.values.payment_date === null || isOutUnit(ctx, p)) continue;
    const list = index.get(id) ?? [];
    list.push(p);
    index.set(id, list);
  }
  return index;
}
