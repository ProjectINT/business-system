import { calculateAccruals } from "./accrual";
import { calculateCashFlow } from "./cash";
import { compareText } from "./order";
import { estimateOwnerBalance } from "./owner-balance";
import { assertPolicies, type CalcPolicies } from "./policies";
import { assertSameCurrency, zero, type Money } from "./primitives/money";
import { reconcile } from "./reconciliation";
import { assertAdmitted, calculateReservations, collect } from "./reservation";
import { assertExpenseStatus, assertScope } from "./scope";
import type {
  ExpenseInput,
  Overview,
  OverviewInput,
  PaymentInput,
  ReservationCalc,
  Scope,
  Summary,
} from "./types";

function assertBaseCurrency(amount: Money, scope: Scope): void {
  assertSameCurrency(zero(scope.baseCurrency), amount);
}

function summarize(
  calcs: readonly ReservationCalc[],
  payments: readonly PaymentInput[],
  expenses: readonly ExpenseInput[],
  scope: Scope,
  policies: CalcPolicies,
): Summary {
  const accruals = calculateAccruals(calcs, expenses, scope);
  return {
    accruals,
    cashFlow: calculateCashFlow(payments, expenses, scope),
    reconciliation: reconcile(calcs, payments, scope, policies),
    ownerBalance: estimateOwnerBalance(accruals),
  };
}

/**
 * Everything the dashboard needs, per property and for the portfolio.
 * The portfolio is computed from the rows directly, not by adding up properties.
 * Records that cannot be calculated are returned in `failures` with their amounts.
 */
export function calculateOverview(input: OverviewInput, scope: Scope, policies: CalcPolicies): Overview {
  assertPolicies(policies);
  assertScope(scope);

  const reservations = calculateReservations(input.reservations, input.commissionRules, policies);
  const calcs = collect(
    reservations.results,
    (c) => {
      assertBaseCurrency(c.cancelled?.gross ?? c.gross, scope);
      return c;
    },
    (c) => ({ entity: "reservation", recordId: c.reservationId, propertyId: c.propertyId, amount: c.cancelled?.gross ?? c.gross }),
  );
  const payments = collect(
    input.payments,
    (p) => {
      assertAdmitted(p, p.paymentId);
      assertBaseCurrency(p.amount, scope);
      return p;
    },
    (p) => ({ entity: "payment", recordId: p.paymentId, propertyId: p.propertyId, amount: p.amount }),
  );
  const expenses = collect(
    input.expenses,
    (e) => {
      assertAdmitted(e, e.expenseId);
      assertExpenseStatus(e.paymentStatus, e.expenseId);
      assertBaseCurrency(e.amount, scope);
      return e;
    },
    (e) => ({ entity: "expense", recordId: e.expenseId, propertyId: e.propertyId, amount: e.amount }),
  );

  const selected = (id: string) => scope.propertyIds === "all" || scope.propertyIds.has(id);
  const failures = [...reservations.failures, ...calcs.failures, ...payments.failures, ...expenses.failures].filter(
    (f) => selected(f.propertyId),
  );
  const propertyIds = [
    ...new Set([...calcs.results, ...payments.results, ...expenses.results].map((r) => r.propertyId)),
  ]
    .filter(selected)
    .sort(compareText);

  const args = [calcs.results, payments.results, expenses.results] as const;
  return {
    scope: {
      period: scope.period,
      includeReview: scope.includeReview,
      baseCurrency: scope.baseCurrency,
      asOf: scope.asOf,
    },
    portfolio: summarize(...args, scope, policies),
    properties: propertyIds.map((propertyId) => ({
      propertyId,
      ...summarize(...args, { ...scope, propertyIds: new Set([propertyId]) }, policies),
    })),
    failures: failures.sort(
      (a, b) => compareText(a.entity, b.entity) || compareText(a.recordId, b.recordId),
    ),
  };
}

