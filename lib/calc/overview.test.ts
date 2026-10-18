import { describe, expect, it } from "vitest";
import { calculateOverview } from "./overview";
import { DEFAULT_POLICIES, type CalcPolicies } from "./policies";
import { idr, money } from "./primitives/money";
import { expectCode } from "./testing/expect";
import { date, EXP, PAY, RES, RULES, scope, synthetic } from "./testing/fixtures";
import type { ExpenseInput, OverviewInput, PaymentInput } from "./types";

const base: OverviewInput = {
  reservations: Object.values(RES),
  commissionRules: RULES,
  payments: Object.values(PAY),
  expenses: Object.values(EXP),
};

describe("calculateOverview", () => {
  it("lists properties in order and echoes the scope", () => {
    const o = calculateOverview(base, scope(), DEFAULT_POLICIES);
    expect(o.properties.map((p) => p.propertyId)).toEqual(["V003", "V011", "V013", "V015"]);
    expect(o.scope).toEqual({ period: scope().period, includeReview: true, baseCurrency: "IDR", asOf: "2026-10-15" });
    expect(o.failures).toEqual([]);
  });

  it("collects failures of every entity with their amounts, filtered by property", () => {
    const input: OverviewInput = {
      ...base,
      reservations: [
        ...base.reservations,
        synthetic({ reservationId: "X1", checkIn: date("2027-01-05"), checkOut: date("2027-01-06") }),
        synthetic({
          reservationId: "X2",
          gross: money(100n, "USD"),
          otaFee: money(0n, "USD"),
          refund: money(0n, "USD"),
        }),
        synthetic({
          reservationId: "X3",
          status: "cancelled",
          gross: money(5n, "USD"),
          otaFee: money(0n, "USD"),
          refund: money(0n, "USD"),
        }),
      ],
      commissionRules: [...RULES, { ...RULES[0]!, propertyId: "V011", effectiveFrom: date("2027-02-01") }],
      payments: [
        ...base.payments,
        { ...PAY.P0010, paymentId: "X4", amount: money(1n, "USD") },
        { ...PAY.P0010, paymentId: "X5", dqStatus: "excluded" as PaymentInput["dqStatus"] },
      ],
      expenses: [
        ...base.expenses,
        { ...EXP.E0057, expenseId: "X6", paymentStatus: "x" as ExpenseInput["paymentStatus"] },
        { ...EXP.E0057, expenseId: "X7", propertyId: "V013", amount: money(1n, "USD") },
      ],
    };
    const o = calculateOverview(input, scope(), DEFAULT_POLICIES);
    expect(o.failures.map((f) => [f.entity, f.recordId, f.code, f.amount])).toEqual([
      ["expense", "X6", "UNKNOWN_STATUS", EXP.E0057.amount],
      ["expense", "X7", "CURRENCY_MISMATCH", money(1n, "USD")],
      ["payment", "X4", "CURRENCY_MISMATCH", money(1n, "USD")],
      ["payment", "X5", "RECORD_NOT_ADMITTED", PAY.P0010.amount],
      ["reservation", "X1", "NO_COMMISSION_RULE", RES.R0067.gross],
      ["reservation", "X2", "CURRENCY_MISMATCH", money(100n, "USD")],
      ["reservation", "X3", "CURRENCY_MISMATCH", money(5n, "USD")],
    ]);
    // the rest of the numbers are unaffected
    expect(o.portfolio).toEqual(calculateOverview(base, scope(), DEFAULT_POLICIES).portfolio);

    const onlyV013 = calculateOverview(input, scope({ propertyIds: new Set(["V013"]) }), DEFAULT_POLICIES);
    expect(onlyV013.failures.map((f) => f.recordId)).toEqual(["X7"]);
    expect(onlyV013.properties.map((p) => p.propertyId)).toEqual(["V013"]);
  });

  it("portfolio equals the sum of properties", () => {
    const o = calculateOverview(base, scope(), DEFAULT_POLICIES);
    const total = o.properties.reduce((a, p) => a + p.accruals.gross.amount, 0n);
    expect(idr(total)).toEqual(o.portfolio.accruals.gross);
  });

  it("rejects bad policies and scope for the whole call", () => {
    expectCode(
      () => calculateOverview(base, scope(), { ...DEFAULT_POLICIES, rounding: "x" as CalcPolicies["rounding"] }),
      "INVALID_POLICY",
    );
    expectCode(() => calculateOverview(base, scope({ baseCurrency: "EUR" as "IDR" }), DEFAULT_POLICIES), "UNKNOWN_CURRENCY");
  });
});
