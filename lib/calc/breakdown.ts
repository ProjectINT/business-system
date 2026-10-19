import { invariant } from "./errors";
import { compareText } from "./order";
import { inPeriod } from "./primitives/calendar";
import { add, zero } from "./primitives/money";
import { assertExpenseStatus, assertScope, inScope } from "./scope";
import type { Breakdown, ExpenseInput, PaymentInput, ReservationCalc, Scope, StayPart } from "./types";

/**
 * The records behind the totals, with the filters of calculateAccruals and calculateCashFlow:
 * reservations with night lines in the period, expenses (paid + pending) by expense_date, payments by
 * payment_date. Σ stays = the accrual totals, Σ expenses = operatingExpenses, Σ payments = received.
 */
export function itemize(
  calcs: readonly ReservationCalc[],
  payments: readonly PaymentInput[],
  expenses: readonly ExpenseInput[],
  scope: Scope,
): Breakdown {
  assertScope(scope);
  const z = zero(scope.baseCurrency);

  const stays: StayPart[] = [];
  for (const c of calcs) {
    if (!inScope(c, scope, c.reservationId)) continue;
    let nights = 0;
    let [gross, refund, otaFee, managementFee] = [z, z, z, z];
    for (const line of c.lines) {
      if (!inPeriod(scope.period, line.date)) continue;
      nights += line.nights;
      gross = add(gross, line.gross);
      refund = add(refund, line.refund);
      otaFee = add(otaFee, line.otaFee);
      managementFee = add(managementFee, line.managementFee);
    }
    if (nights === 0) continue; // no line in the period; a line is at least one night
    invariant(c.rate !== null, `Reservation ${c.reservationId} has night lines but no rate`);
    stays.push({
      reservationId: c.reservationId,
      propertyId: c.propertyId,
      checkIn: c.checkIn,
      checkOut: c.checkOut,
      channel: c.channel,
      dqStatus: c.dqStatus,
      rate: c.rate,
      stayNights: c.nights,
      nights,
      gross,
      refund,
      otaFee,
      managementFee,
    });
  }

  const inExpenses = expenses.filter((e) => {
    assertExpenseStatus(e.paymentStatus, e.expenseId);
    return inScope(e, scope, e.expenseId) && inPeriod(scope.period, e.expenseDate);
  });
  const inPayments = payments.filter((p) => inScope(p, scope, p.paymentId) && inPeriod(scope.period, p.paymentDate));

  return {
    stays: stays.sort((a, b) => compareText(a.checkIn, b.checkIn) || compareText(a.reservationId, b.reservationId)),
    expenses: inExpenses.sort((a, b) => compareText(a.expenseDate, b.expenseDate) || compareText(a.expenseId, b.expenseId)),
    payments: inPayments.sort((a, b) => compareText(a.paymentDate, b.paymentDate) || compareText(a.paymentId, b.paymentId)),
  };
}
