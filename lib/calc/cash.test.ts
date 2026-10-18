import { describe, expect, it } from "vitest";
import { calculateCashFlow } from "./cash";
import { idr } from "./primitives/money";
import { expectCode } from "./testing/expect";
import { date, EXP, OCTOBER, PAY, scope } from "./testing/fixtures";
import type { ExpenseInput, PaymentInput } from "./types";

describe("calculateCashFlow", () => {
  const sep30: PaymentInput = { ...PAY.P0010, paymentId: "X1", paymentDate: date("2026-09-30") };
  const oct01: PaymentInput = { ...PAY.P0010, paymentId: "X2", paymentDate: date("2026-10-01") };

  it("payments by payment_date: 30.09 is September, 01.10 is October", () => {
    expect(calculateCashFlow([sep30, oct01], [], scope()).received).toEqual(PAY.P0010.amount);
    expect(calculateCashFlow([sep30, oct01], [], scope({ period: OCTOBER })).received).toEqual(PAY.P0010.amount);
  });

  it("only paid expenses leave cash", () => {
    expect(calculateCashFlow([PAY.P0010, PAY.P0055], [EXP.E0018, EXP.E0057], scope())).toEqual({
      received: idr(2990297n + 7312184n),
      paidExpenses: idr(325200n),
      netCashFlow: idr(2990297n + 7312184n - 325200n),
    });
  });

  it("respects the review switch and the property filter", () => {
    const review: PaymentInput = { ...PAY.P0010, dqStatus: "review" };
    expect(calculateCashFlow([review], [], scope({ includeReview: false })).received).toEqual(idr(0n));
    expect(calculateCashFlow([PAY.P0010], [], scope({ propertyIds: new Set(["V013"]) })).received).toEqual(idr(0n));
    expect(calculateCashFlow([], [], scope()).netCashFlow).toEqual(idr(0n));
  });

  it("rejects an unknown expense status", () =>
    expectCode(
      () => calculateCashFlow([], [{ ...EXP.E0057, paymentStatus: "x" as ExpenseInput["paymentStatus"] }], scope()),
      "UNKNOWN_STATUS",
    ));
});
