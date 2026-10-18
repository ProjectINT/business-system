import { describe, expect, it } from "vitest";
import { calculateAccruals } from "./accrual";
import { DEFAULT_POLICIES } from "./policies";
import { idr, money } from "./primitives/money";
import { calculateReservation } from "./reservation";
import { expectCode } from "./testing/expect";
import { date, EXP, NOVEMBER, OCTOBER, RES, RULES, scope, SEPTEMBER, synthetic } from "./testing/fixtures";
import type { ExpenseInput, ReservationInput } from "./types";

const calcs = (...rs: ReservationInput[]) => rs.map((r) => calculateReservation(r, RULES, DEFAULT_POLICIES));

describe("calculateAccruals", () => {
  it("R0018 across the month boundary", () => {
    const [sep, oct] = [SEPTEMBER, OCTOBER].map((period) => calculateAccruals(calcs(RES.R0018), [], scope({ period })));
    expect(sep).toMatchObject({ nights: 3, gross: idr(7494830n), otaFee: idr(1124226n), managementFee: idr(1274121n) });
    expect(oct).toMatchObject({ nights: 3, gross: idr(7494828n), otaFee: idr(1124223n), managementFee: idr(1274121n) });
  });

  it("R0003 (25.10–01.11): all 7 nights in October, none in November", () => {
    expect(calculateAccruals(calcs(RES.R0003), [], scope({ period: OCTOBER })).nights).toBe(7);
    expect(calculateAccruals(calcs(RES.R0003), [], scope({ period: NOVEMBER }))).toMatchObject({
      nights: 0,
      gross: idr(0n),
    });
  });

  it("'checkout' recognition moves R0003 to November", () => {
    const c = [calculateReservation(RES.R0003, RULES, { ...DEFAULT_POLICIES, revenueRecognition: "checkout" })];
    expect(calculateAccruals(c, [], scope({ period: OCTOBER })).nights).toBe(0);
    expect(calculateAccruals(c, [], scope({ period: NOVEMBER }))).toMatchObject({ nights: 7, gross: idr(12170856n) });
  });

  it("empty input gives zeros in the base currency", () => {
    expect(calculateAccruals([], [], scope())).toEqual({
      nights: 0,
      gross: idr(0n),
      refund: idr(0n),
      otaFee: idr(0n),
      otaFeeByChannel: { OTA: idr(0n), Direct: idr(0n) },
      netRental: idr(0n),
      managementFee: idr(0n),
      operatingExpenses: idr(0n),
      cancellations: { count: 0, gross: idr(0n), refund: idr(0n), retained: idr(0n) },
    });
  });

  it("OTA fees split by the booking's channel: R0018 via OTA, R0020 direct (marketing fee, DQ-11)", () => {
    const a = calculateAccruals(calcs(RES.R0018, RES.R0020), [], scope({ period: SEPTEMBER }));
    expect(a.otaFeeByChannel).toEqual({ OTA: idr(1124226n), Direct: idr(612470n) });
    expect(a.otaFee).toEqual(idr(1124226n + 612470n));
  });

  it("includeReview=false drops review records; property filter", () => {
    const all = calcs(RES.R0143, RES.R0067, RES.R0018);
    expect(calculateAccruals(all, [], scope({ includeReview: false })).gross).toEqual(idr(7924759n + 7494830n));
    expect(calculateAccruals(all, [], scope({ propertyIds: new Set(["V013"]) })).gross).toEqual(idr(7494830n));
  });

  it("cancellations are reported by check-in, not recognised", () => {
    const a = calculateAccruals(calcs(RES.R0131, synthetic({ status: "cancelled", refund: idr(1n) })), [], scope());
    expect(a.gross).toEqual(idr(0n));
    expect(a.cancellations).toEqual({
      count: 2,
      gross: idr(6699678n + 7924759n),
      refund: idr(6699678n + 1n),
      retained: idr(7924758n),
    });
    expect(calculateAccruals(calcs(RES.R0131), [], scope({ period: OCTOBER })).cancellations.count).toBe(0);
  });

  it("expenses: paid and pending by expense_date; period bounds are inclusive", () => {
    const lastDay: ExpenseInput = { ...EXP.E0057, expenseId: "X1", expenseDate: date("2026-09-30") };
    const nextDay: ExpenseInput = { ...EXP.E0057, expenseId: "X2", expenseDate: date("2026-10-01") };
    const a = calculateAccruals([], [EXP.E0018, EXP.E0057, EXP.E0016, lastDay, nextDay], scope());
    expect(a.operatingExpenses).toEqual(idr(778388n + 325200n + 325200n));
  });

  it("rejects amounts in another currency and unknown expense status", () => {
    expectCode(
      () => calculateAccruals([], [{ ...EXP.E0057, amount: money(1n, "USD") }], scope()),
      "CURRENCY_MISMATCH",
    );
    expectCode(
      () => calculateAccruals([], [{ ...EXP.E0057, paymentStatus: "void" as ExpenseInput["paymentStatus"] }], scope()),
      "UNKNOWN_STATUS",
    );
    expectCode(() => calculateAccruals(calcs(RES.R0020), [], scope({ baseCurrency: "USD" })), "CURRENCY_MISMATCH");
    expectCode(
      () => calculateAccruals([], [], scope({ period: { from: date("2026-10-01"), to: date("2026-09-01") } })),
      "INVALID_PERIOD",
    );
    expectCode(
      () => calculateAccruals([], [{ ...EXP.E0057, dqStatus: "duplicate" as ExpenseInput["dqStatus"] }], scope()),
      "RECORD_NOT_ADMITTED",
    );
  });
});
