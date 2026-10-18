import { inPeriod } from "./primitives/calendar";
import { add, sub, zero } from "./primitives/money";
import { assertExpenseStatus, assertScope, inScope } from "./scope";
import type { Accruals, ExpenseInput, ReservationCalc, Scope } from "./types";

/** Accrual view: night lines dated in the period; expenses (paid + pending) by expense_date. */
export function calculateAccruals(
  calcs: readonly ReservationCalc[],
  expenses: readonly ExpenseInput[],
  scope: Scope,
): Accruals {
  assertScope(scope);
  const z = zero(scope.baseCurrency);
  let nights = 0;
  let [gross, refund, otaFee, managementFee, operatingExpenses] = [z, z, z, z, z];
  const otaFeeByChannel = { OTA: z, Direct: z };
  const cancellations = { count: 0, gross: z, refund: z, retained: z };

  for (const c of calcs) {
    if (!inScope(c, scope, c.reservationId)) continue;
    for (const line of c.lines) {
      if (!inPeriod(scope.period, line.date)) continue;
      nights += line.nights;
      gross = add(gross, line.gross);
      refund = add(refund, line.refund);
      otaFee = add(otaFee, line.otaFee);
      otaFeeByChannel[c.channel] = add(otaFeeByChannel[c.channel], line.otaFee);
      managementFee = add(managementFee, line.managementFee);
    }
    if (c.cancelled && inPeriod(scope.period, c.checkIn)) {
      cancellations.count += 1;
      cancellations.gross = add(cancellations.gross, c.cancelled.gross);
      cancellations.refund = add(cancellations.refund, c.cancelled.refund);
      cancellations.retained = add(cancellations.retained, c.cancelled.retained);
    }
  }

  for (const e of expenses) {
    assertExpenseStatus(e.paymentStatus, e.expenseId);
    if (!inScope(e, scope, e.expenseId) || !inPeriod(scope.period, e.expenseDate)) continue;
    operatingExpenses = add(operatingExpenses, e.amount);
  }

  return {
    nights,
    gross,
    refund,
    otaFee,
    otaFeeByChannel,
    netRental: sub(sub(gross, refund), otaFee),
    managementFee,
    operatingExpenses,
    cancellations,
  };
}
