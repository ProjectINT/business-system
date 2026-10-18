// Figures of the reconciliation page (PLAN.md 8, page 2): reservations reconciled in the period —
// expected, received, difference, status — and, apart, payments that reached no reservation.
import {
  add,
  inPeriod,
  sub,
  zero,
  type CalendarDate,
  type Money,
  type ReconciliationStatus,
  type ReservationInput,
} from "../calc";
import type { RuleId, Status } from "../dq";
import { overviewOf, type Dashboard } from "./dashboard";
import { BASE_CURRENCY, selectedProperties, type Filters } from "./filters";
import type { Snapshot } from "./types";

export interface ReconciliationRow {
  readonly reservationId: string;
  readonly propertyId: string;
  readonly checkIn: CalendarDate;
  readonly checkOut: CalendarDate;
  readonly reservationStatus: ReservationInput["status"];
  readonly expected: Money;
  readonly received: Money;
  readonly difference: Money;
  readonly status: ReconciliationStatus;
  /** Status of the reservation row after the checks. */
  readonly dqStatus: Status;
  /** Rules that failed on the reservation, `info` included. */
  readonly ruleIds: readonly RuleId[];
  /** Payments counted in `received`, by id. */
  readonly paymentIds: readonly string[];
}

export interface UnallocatedPayment {
  readonly paymentId: string | null;
  readonly reservationId: string | null;
  readonly propertyId: string | null;
  readonly paymentDate: CalendarDate | null;
  readonly amount: Money | null;
  /** Rules that excluded the payment: DQ-04 unknown villa, DQ-05 missing or excluded reservation. */
  readonly ruleIds: readonly RuleId[];
}

export interface ReconciliationView {
  readonly filters: Filters;
  readonly expected: Money;
  readonly received: Money;
  readonly difference: Money;
  readonly byStatus: Readonly<Record<ReconciliationStatus, number>>;
  /** with − without records under review, as on the overview. */
  readonly underReview: { readonly expected: Money; readonly received: Money; readonly difference: Money };
  readonly rows: readonly ReconciliationRow[];
  readonly unallocated: readonly UnallocatedPayment[];
  /** Sum of the unallocated payments in the base currency. */
  readonly unallocatedAmount: Money;
  readonly failures: Dashboard["failures"];
}

export function reconciliationOf(snapshot: Snapshot, filters: Filters): ReconciliationView {
  const on = overviewOf(snapshot, filters, true);
  const off = overviewOf(snapshot, filters, false);
  const withReview = on.portfolio.reconciliation;
  const withoutReview = off.portfolio.reconciliation;
  const rec = filters.includeReview ? withReview : withoutReview;

  const reservations = new Map(snapshot.input.reservations.map((r) => [r.reservationId, r]));
  const admitted = snapshot.records.filter(
    (r) => r.entity === "reservation" && r.status !== "excluded" && r.status !== "duplicate" && r.status !== "superseded",
  );
  const recordOf = new Map(admitted.map((r) => [r.recordKey, r]));
  const payments = new Map<string, string[]>();
  for (const p of snapshot.input.payments) {
    if (p.dqStatus === "review" && !filters.includeReview) continue;
    payments.set(p.reservationId, [...(payments.get(p.reservationId) ?? []), p.paymentId]);
  }

  const rows: ReconciliationRow[] = rec.lines.map((l) => {
    const r = reservations.get(l.reservationId)!;
    const record = recordOf.get(l.reservationId)!;
    return {
      reservationId: l.reservationId,
      propertyId: l.propertyId,
      checkIn: r.checkIn,
      checkOut: l.checkOut,
      reservationStatus: r.status,
      expected: l.expected,
      received: l.received,
      difference: l.difference,
      status: l.status,
      dqStatus: record.status,
      ruleIds: record.failed.map((f) => f.ruleId),
      paymentIds: (payments.get(l.reservationId) ?? []).sort(),
    };
  });

  const selected = selectedProperties(filters, snapshot);
  const unallocated: UnallocatedPayment[] = [];
  let unallocatedAmount = zero(BASE_CURRENCY);
  for (const r of snapshot.records) {
    if (r.entity !== "payment" || r.status !== "excluded") continue;
    if (selected !== "all" && (r.propertyId === null || !selected.has(r.propertyId))) continue;
    if (r.date !== null && !inPeriod(filters.period, r.date)) continue;
    const row = snapshot.dataset.rows.payment.find((p) => p.unitId === r.unitId)!;
    unallocated.push({
      paymentId: r.recordKey,
      reservationId: row.values.reservation_id,
      propertyId: r.propertyId,
      paymentDate: r.date,
      amount: r.amount,
      ruleIds: r.ruleIds,
    });
    if (r.amount !== null && r.amount.currency === BASE_CURRENCY) unallocatedAmount = add(unallocatedAmount, r.amount);
  }

  return {
    filters,
    expected: rec.expected,
    received: rec.received,
    difference: rec.difference,
    byStatus: rec.byStatus,
    underReview: {
      expected: sub(withReview.expected, withoutReview.expected),
      received: sub(withReview.received, withoutReview.received),
      difference: sub(withReview.difference, withoutReview.difference),
    },
    rows,
    unallocated,
    unallocatedAmount,
    failures: {
      calc: (filters.includeReview ? on : off).failures,
      data: snapshot.failures.filter((f) => selected === "all" || selected.has(f.propertyId)),
    },
  };
}
