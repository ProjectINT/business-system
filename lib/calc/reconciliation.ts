import { assertNever } from "./errors";
import { compareText } from "./order";
import type { CalcPolicies } from "./policies";
import { addDays, inPeriod, type CalendarDate } from "./primitives/calendar";
import { add, compare, isZero, sub, sum, zero } from "./primitives/money";
import { assertAdmitted } from "./reservation";
import { assertScope, inScope } from "./scope";
import type {
  PaymentInput,
  Reconciliation,
  ReconciliationLine,
  ReconciliationStatus,
  ReservationCalc,
  Scope,
} from "./types";

/** The day the payout is due (policy `paymentDue`): check-in, or check-out. */
function paymentDueDate(calc: ReservationCalc, policies: CalcPolicies): CalendarDate {
  switch (policies.paymentDue) {
    case "check_in":
      return calc.checkIn;
    case "check_out":
      return calc.checkOut;
    default:
      return assertNever(policies.paymentDue, "INVALID_POLICY", "paymentDue");
  }
}

/**
 * Expected payout vs all payments of the reservation, whatever their date. Exact comparison, no
 * tolerance. A shortfall is `not_due` only while the due date (policy) is after today.
 */
export function reconcileReservation(
  calc: ReservationCalc,
  payments: readonly PaymentInput[],
  today: CalendarDate,
  policies: CalcPolicies,
): ReconciliationLine {
  const expected = calc.expectedPayout;
  const received = sum(
    payments.filter((p) => p.reservationId === calc.reservationId).map((p) => p.amount),
    expected.currency,
  );
  const cmp = compare(received, expected);
  const due = paymentDueDate(calc, policies) <= today;
  let status: ReconciliationStatus;
  if (cmp === 0) status = "matched";
  else if (cmp > 0) status = "overpaid";
  else if (!due) status = "not_due";
  else status = isZero(received) ? "not_received" : "underpaid";
  return {
    reservationId: calc.reservationId,
    propertyId: calc.propertyId,
    checkOut: calc.checkOut,
    expected,
    received,
    difference: sub(received, expected),
    status,
  };
}

function reconciliationDate(calc: ReservationCalc, policies: CalcPolicies): CalendarDate {
  switch (policies.reconciliationDate) {
    case "check_out":
      return calc.checkOut;
    case "last_night":
      return addDays(calc.checkOut, -1);
    default:
      return assertNever(policies.reconciliationDate, "INVALID_POLICY", "reconciliationDate");
  }
}

/** Reservations whose reconciliation date (policy) falls in the period. */
export function reconcile(
  calcs: readonly ReservationCalc[],
  payments: readonly PaymentInput[],
  scope: Scope,
  policies: CalcPolicies,
): Reconciliation {
  assertScope(scope);
  const byReservation = new Map<string, PaymentInput[]>();
  for (const p of payments) {
    assertAdmitted(p, p.paymentId);
    if (p.dqStatus === "review" && !scope.includeReview) continue;
    const list = byReservation.get(p.reservationId) ?? [];
    list.push(p);
    byReservation.set(p.reservationId, list);
  }

  const lines = calcs
    .filter((c) => inScope(c, scope, c.reservationId) && inPeriod(scope.period, reconciliationDate(c, policies)))
    .map((c) => reconcileReservation(c, byReservation.get(c.reservationId) ?? [], scope.today, policies))
    .sort((a, b) => compareText(a.reservationId, b.reservationId));

  const byStatus: Record<ReconciliationStatus, number> = {
    matched: 0,
    not_received: 0,
    underpaid: 0,
    overpaid: 0,
    not_due: 0,
  };
  let expected = zero(scope.baseCurrency);
  let received = zero(scope.baseCurrency);
  for (const l of lines) {
    byStatus[l.status] += 1;
    expected = add(expected, l.expected);
    received = add(received, l.received);
  }
  return { lines, expected, received, difference: sub(received, expected), byStatus };
}
