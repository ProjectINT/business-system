import { inPeriod } from "./primitives/calendar";
import { add, sub, zero } from "./primitives/money";
import { assertExpenseStatus, assertScope, inScope } from "./scope";
import type { CashFlow, ExpenseInput, PaymentInput, Scope } from "./types";

/** Cash view: payments by payment_date; only paid expenses, by expense_date. */
export function calculateCashFlow(
  payments: readonly PaymentInput[],
  expenses: readonly ExpenseInput[],
  scope: Scope,
): CashFlow {
  assertScope(scope);
  let received = zero(scope.baseCurrency);
  let paidExpenses = zero(scope.baseCurrency);
  for (const p of payments) {
    if (inScope(p, scope, p.paymentId) && inPeriod(scope.period, p.paymentDate)) received = add(received, p.amount);
  }
  for (const e of expenses) {
    assertExpenseStatus(e.paymentStatus, e.expenseId);
    if (e.paymentStatus === "paid" && inScope(e, scope, e.expenseId) && inPeriod(scope.period, e.expenseDate)) {
      paidExpenses = add(paidExpenses, e.amount);
    }
  }
  return { received, paidExpenses, netCashFlow: sub(received, paidExpenses) };
}
