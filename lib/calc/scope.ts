import { CalcError } from "./errors";
import { period } from "./primitives/calendar";
import { parseCurrency } from "./primitives/money";
import { assertAdmitted } from "./reservation";
import type { DqStatus, ExpenseStatus, Scope } from "./types";

export function assertScope(scope: Scope): void {
  period(scope.period.from, scope.period.to);
  parseCurrency(scope.baseCurrency);
}

/** Property filter and the "include records under review" switch. */
export function inScope(
  record: { readonly propertyId: string; readonly dqStatus: DqStatus },
  scope: Scope,
  id: string,
): boolean {
  assertAdmitted(record, id);
  if (record.dqStatus === "review" && !scope.includeReview) return false;
  return scope.propertyIds === "all" || scope.propertyIds.has(record.propertyId);
}

const EXPENSE_STATUSES: readonly string[] = ["paid", "pending"] satisfies ExpenseStatus[];

export function assertExpenseStatus(status: string, expenseId: string): void {
  if (!EXPENSE_STATUSES.includes(status)) {
    throw new CalcError("UNKNOWN_STATUS", `Expense ${expenseId} has unknown payment status ${status}`, {
      expenseId,
      paymentStatus: status,
    });
  }
}
