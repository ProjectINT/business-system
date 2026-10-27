// Money the villas do not get (PLAN.md 7.4), shown next to cash received and never added to it:
// held — not money yet (`pending`), an unknown status, or real money for a reservation out of the
// figures; unallocated — its reservation is not in the data. Both by payment date in the period and
// the selected villas, as received is; a payment whose date did not parse cannot be placed and is always listed.
import { add, inPeriod, zero, type CalendarDate, type Money } from "../calc";
import type { RuleId } from "../dq";
import { BASE_CURRENCY, selectedProperties, type Filters } from "./filters";
import type { RecordInfo, Snapshot } from "./types";

/** pending — status `pending`; unknown_status — DQ-25; reservation_excluded — DQ-05, its reservation is out; missing — DQ-05, no reservation. */
export type ApartReason = "pending" | "unknown_status" | "reservation_excluded" | "missing";

export interface ApartPayment {
  readonly paymentId: string; // a row without a key is DQ-03's: excluded, never held or unallocated
  readonly reservationId: string | null;
  readonly propertyId: string | null;
  readonly paymentDate: CalendarDate | null;
  /** `null` when it did not parse or the currency is unknown. */
  readonly amount: Money | null;
  readonly reason: ApartReason;
  /** Rules that failed on the payment, `info` included. */
  readonly ruleIds: readonly RuleId[];
}

export interface Apart {
  readonly held: readonly ApartPayment[];
  readonly unallocated: readonly ApartPayment[];
  /** Sums in the base currency; payments in another currency are listed, not summed. */
  readonly heldAmount: Money;
  readonly unallocatedAmount: Money;
}

function inBase(list: readonly ApartPayment[]): Money {
  return list.reduce((m, p) => (p.amount !== null && p.amount.currency === BASE_CURRENCY ? add(m, p.amount) : m), zero(BASE_CURRENCY));
}

function reasonOf(r: RecordInfo): ApartReason {
  if (r.money === "unallocated") return "missing";
  if (r.status !== "excluded") return "pending";
  return r.ruleIds.includes("DQ-25") ? "unknown_status" : "reservation_excluded";
}

/**
 * Held and unallocated payments of the selection. A held payment the checks admitted (`pending`)
 * follows the review switch, as the calculator's `pending` does: their sum in the base currency is
 * CashFlow.pending plus the held payments the checks excluded.
 */
export function apartOf(snapshot: Snapshot, filters: Filters): Apart {
  const selected = selectedProperties(filters, snapshot);
  const rowOf = new Map(snapshot.dataset.rows.payment.map((p) => [p.unitId, p]));
  const held: ApartPayment[] = [];
  const unallocated: ApartPayment[] = [];
  const inFileOrder = snapshot.records.filter((r) => r.entity === "payment").sort((a, b) => a.lineNo - b.lineNo);
  for (const r of inFileOrder) {
    if (r.money !== "held" && r.money !== "unallocated") continue;
    if (selected !== "all" && (r.propertyId === null || !selected.has(r.propertyId))) continue;
    if (r.date !== null && !inPeriod(filters.period, r.date)) continue;
    if (r.status !== "clean" && r.status !== "excluded" && !filters.includeReview) continue; // admitted under review
    const item: ApartPayment = {
      paymentId: r.recordKey!,
      reservationId: rowOf.get(r.unitId)!.values.reservation_id,
      propertyId: r.propertyId,
      paymentDate: r.date,
      amount: r.amount,
      reason: reasonOf(r),
      ruleIds: r.failed.map((f) => f.ruleId),
    };
    (r.money === "held" ? held : unallocated).push(item);
  }
  return { held, unallocated, heldAmount: inBase(held), unallocatedAmount: inBase(unallocated) };
}
