// Reservation events → one snapshot per reservation (latest updated_at) with its night lines,
// payments without duplicates, dedup counters and exceptions (docs/FINAL_TEST_PLAN.md, 3.1).
//
// The night lines (fees.ts) are built here, right after the checks of the snapshot: a night without
// a rule holds the reservation, and payments are placed only after every hold is known, so such a
// reservation's payment is held (PAYMENT_HELD), not counted as the villa's cash.
//
// Only the input decides the result: records are grouped by their ids, a tie between equal versions
// goes to the smaller source_event_id, and every list is sorted by its key — a reordered input gives
// the same output. Content is compared on the parsed record, so an unknown extra field or another
// spelling of the same instant does not make two copies differ.
import { nightLines, type NightLine } from "./fees";
import type { CaseInput, CommissionRule, Payment, Property, ReservationEvent } from "./schema";
import type { Dedup, Exception, ExceptionCode } from "./types";

/** The latest version of a reservation, or why none can be used. `hold` — nothing of it enters the confirmed totals. */
export type ReservationDecision =
  | {
      readonly hold: false;
      readonly reservation_id: string;
      readonly snapshot: ReservationEvent;
      /** source_event_ids of the versions the snapshot replaced, sorted. */
      readonly superseded: readonly string[];
      /** One line per night of the stay, chronological (fees.ts). */
      readonly nights: readonly NightLine[];
    }
  | {
      readonly hold: true;
      readonly reservation_id: string;
      /** null — no version could be chosen (CONFLICTING_EVENT, AMBIGUOUS_VERSION). */
      readonly snapshot: ReservationEvent | null;
      readonly superseded: readonly string[];
    };

/**
 * Where the money of a payment goes. `received` — the villa's cash of the month of payment_date;
 * `held` — money we know of but do not attribute yet (pending, received for a reservation on hold,
 * a status we do not know); `unmatched` — received for a reservation nobody sent (ТЗ 13).
 * A conflicting payment (one id, different content) has no amount to place: exception only.
 */
export type PaymentDecision =
  | { readonly bucket: "received"; readonly payment: Payment; readonly property_id: string }
  | { readonly bucket: "held" | "unmatched"; readonly payment: Payment };

export interface Snapshots {
  /** By reservation_id. */
  readonly reservations: readonly ReservationDecision[];
  /** By payment_id. */
  readonly payments: readonly PaymentDecision[];
  readonly dedup: Dedup;
  /** Reservations first, then payments, each by id; codes in the order they were checked. */
  readonly exceptions: readonly Exception[];
}

const ACCEPTED_STATUSES: ReadonlySet<string> = new Set(["confirmed", "modified"]);

/** Code-unit order, the same in every locale. Callers sort distinct keys, so equal strings never meet. */
function compareStrings(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/** Stable JSON of a parsed record without its identifier: what copies and versions are compared by. */
function contentKey(record: object, idField: string): string {
  const entries = Object.entries(record)
    .filter(([k]) => k !== idField)
    .sort(([a], [b]) => compareStrings(a, b));
  return JSON.stringify(entries, (_key, value: unknown) => (typeof value === "bigint" ? `${value}n` : value));
}

function distinctContents(copies: readonly object[], idField: string): number {
  return new Set(copies.map((c) => contentKey(c, idField))).size;
}

function sourceEventIds(events: readonly ReservationEvent[]): string[] {
  return events.map((e) => e.source_event_id).sort(compareStrings);
}

function exception(record_type: Exception["record_type"], record_id: string, code: ExceptionCode): Exception {
  return { record_type, record_id, code, action: "hold" };
}

/** Checks of the chosen snapshot (plan 3.1, item 3); any code holds the whole reservation. */
function checkSnapshot(s: ReservationEvent, properties: ReadonlyMap<string, Property>): ExceptionCode[] {
  const codes: ExceptionCode[] = [];
  const property = properties.get(s.property_id);
  if (property === undefined) codes.push("UNKNOWN_PROPERTY");
  // The report is in rupiah: the booking must be in the villa's base currency, and that must be IDR (ТЗ 12).
  else if (s.currency !== property.base_currency || s.currency !== "IDR") codes.push("CURRENCY_MISMATCH");
  if (s.check_out <= s.check_in) codes.push("INVALID_STAY");
  if (!ACCEPTED_STATUSES.has(s.status)) codes.push("UNKNOWN_STATUS");
  return codes;
}

function decideReservation(
  reservation_id: string,
  versions: readonly ReservationEvent[],
  conflicted: boolean,
  properties: ReadonlyMap<string, Property>,
  rules: readonly CommissionRule[],
): { decision: ReservationDecision; codes: readonly ExceptionCode[] } {
  if (conflicted) {
    return { decision: { hold: true, reservation_id, snapshot: null, superseded: [] }, codes: ["CONFLICTING_EVENT"] };
  }
  const latestAt = versions.reduce((max, v) => (v.updated_at > max ? v.updated_at : max), versions[0]!.updated_at);
  const latest = versions.filter((v) => v.updated_at === latestAt);
  const older = versions.filter((v) => v.updated_at !== latestAt);
  if (distinctContents(latest, "source_event_id") > 1) {
    const superseded = sourceEventIds(older);
    return { decision: { hold: true, reservation_id, snapshot: null, superseded }, codes: ["AMBIGUOUS_VERSION"] };
  }
  // The same content under several source_event_ids at the same instant is one version; the smaller id names it (plan 4.6).
  const sorted = [...latest].sort((a, b) => compareStrings(a.source_event_id, b.source_event_id));
  const snapshot = sorted[0]!;
  const superseded = sourceEventIds([...older, ...sorted.slice(1)]);
  const codes = checkSnapshot(snapshot, properties);
  if (codes.length > 0) return { decision: { hold: true, reservation_id, snapshot, superseded }, codes };
  // The snapshot is sound; now every night needs exactly one rule (plan 3.2).
  const fees = nightLines(snapshot, rules);
  if (fees.hold) return { decision: { hold: true, reservation_id, snapshot, superseded }, codes: fees.codes };
  return { decision: { hold: false, reservation_id, snapshot, superseded, nights: fees.nights }, codes: [] };
}

function decidePayment(
  payment: Payment,
  reservations: ReadonlyMap<string, ReservationDecision>,
): { decision: PaymentDecision; code: ExceptionCode | null } {
  if (payment.status === "pending") return { decision: { bucket: "held", payment }, code: "PENDING_PAYMENT" };
  if (payment.status !== "received") return { decision: { bucket: "held", payment }, code: "UNKNOWN_STATUS" };
  const reservation = reservations.get(payment.reservation_id);
  if (reservation === undefined) return { decision: { bucket: "unmatched", payment }, code: "UNMATCHED_PAYMENT" };
  if (reservation.hold) return { decision: { bucket: "held", payment }, code: "PAYMENT_HELD" };
  return { decision: { bucket: "received", payment, property_id: reservation.snapshot.property_id }, code: null };
}

export function selectSnapshots(input: CaseInput): Snapshots {
  const exceptions: Exception[] = [];
  const dedup = { reservation_event_duplicates: 0, superseded_reservation_versions: 0, payment_duplicates: 0 };

  // 1. Exact copies of an event count once (ТЗ 9); different content under one source_event_id is a feed error.
  const versions: ReservationEvent[] = []; // one per source_event_id
  const conflicted = new Set<string>(); // reservation_ids named by a conflicting event
  for (const copies of groupBy(input.reservation_events, (e) => e.source_event_id).values()) {
    if (distinctContents(copies, "source_event_id") === 1) {
      dedup.reservation_event_duplicates += copies.length - 1;
      versions.push(copies[0]!);
    } else {
      for (const copy of copies) conflicted.add(copy.reservation_id);
    }
  }

  // 2. The latest version of each reservation (ТЗ 10), the checks of that snapshot, its night lines.
  const properties = new Map(input.properties.map((p) => [p.property_id, p]));
  const byReservation = groupBy(versions, (e) => e.reservation_id);
  const reservationIds = [...new Set([...byReservation.keys(), ...conflicted])].sort(compareStrings);
  const reservations: ReservationDecision[] = [];
  for (const reservation_id of reservationIds) {
    const { decision, codes } = decideReservation(
      reservation_id,
      byReservation.get(reservation_id) ?? [],
      conflicted.has(reservation_id),
      properties,
      input.commission_rules,
    );
    reservations.push(decision);
    dedup.superseded_reservation_versions += decision.superseded.length;
    for (const code of codes) exceptions.push(exception("reservation", reservation_id, code));
  }

  // 3. Payments: exact copies count once (ТЗ 11), then each goes to one bucket.
  const decided = new Map(reservations.map((r) => [r.reservation_id, r]));
  const payments: PaymentDecision[] = [];
  const paymentGroups = [...groupBy(input.payments, (p) => p.payment_id)].sort(([a], [b]) => compareStrings(a, b));
  for (const [payment_id, copies] of paymentGroups) {
    if (distinctContents(copies, "payment_id") > 1) {
      exceptions.push(exception("payment", payment_id, "CONFLICTING_PAYMENT"));
      continue;
    }
    dedup.payment_duplicates += copies.length - 1;
    const { decision, code } = decidePayment(copies[0]!, decided);
    payments.push(decision);
    if (code !== null) exceptions.push(exception("payment", payment_id, code));
  }

  return { reservations, payments, dedup, exceptions };
}
