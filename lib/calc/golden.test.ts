// Golden test: V011, September 2026 (docs/CALCULATION_MODULE.md, 10.5).
// The numbers below were computed by hand from the source rows; they are not a snapshot.
import { describe, expect, it } from "vitest";
import { idr } from "./primitives/money";
import { calculateOverview, DEFAULT_POLICIES } from "./index";
import { EXP, PAY, RES, RULES, scope } from "./testing/fixtures";

const input = {
  reservations: [RES.R0143, RES.R0020, RES.R0110, RES.R0067],
  commissionRules: RULES,
  payments: [PAY.P0010, PAY.P0055],
  expenses: [EXP.E0018, EXP.E0057, EXP.E0016, EXP.E0072],
};

describe("golden: V011, September 2026", () => {
  const overview = calculateOverview(input, scope({ propertyIds: new Set(["V011"]) }), DEFAULT_POLICIES);
  const [v011] = overview.properties;

  it("has no failures and one property equal to the portfolio", () => {
    expect(overview.failures).toEqual([]);
    expect(overview.properties).toHaveLength(1);
    expect(v011?.propertyId).toBe("V011");
    expect(v011).toEqual({ propertyId: "V011", ...overview.portfolio });
  });

  it("accruals", () => {
    expect(overview.portfolio.accruals).toEqual({
      nights: 15,
      gross: idr(26791884n),
      refund: idr(0n),
      otaFee: idr(3603816n),
      otaFeeByChannel: { OTA: idr(1994230n), Direct: idr(1609586n), unknown: idr(0n) }, // R0143 + R0067; R0020 + R0110
      pbjt: idr(0n), // the CSV has no PBJT
      netRental: idr(23188068n),
      managementFee: idr(4554621n), // per night: 1 182 360 + 612 471 + 1 412 582 + 1 347 208; v1 4 554 620
      ownerEstimate: idr(18633447n), // 23 188 068 − 4 554 621
      operatingExpenses: idr(1103588n),
      cancellations: { count: 0, gross: idr(0n), refund: idr(0n), retained: idr(0n) },
    });
    expect(overview.portfolio.ownerBalance.amount).toEqual(idr(17529859n)); // v1: 17 529 860
    expect(overview.portfolio.ownerBalance.isEstimate).toBe(true);
    expect(overview.portfolio.ownerEstimate).toMatchObject({ amount: idr(18633447n), isEstimate: true });
  });

  it("cash flow", () => {
    expect(overview.portfolio.cashFlow).toEqual({
      received: idr(10302481n),
      pending: idr(0n),
      paidExpenses: idr(325200n),
      netCashFlow: idr(9977281n),
    });
  });

  it("reconciliation", () => {
    const r = overview.portfolio.reconciliation;
    expect(r.expected).toEqual(idr(23188068n));
    expect(r.received).toEqual(idr(10302481n));
    expect(r.difference).toEqual(idr(-12885587n));
    expect(Object.fromEntries(r.lines.map((l) => [l.reservationId, [l.status, l.difference.amount]]))).toEqual({
      R0020: ["matched", 0n],
      R0067: ["not_received", -6973788n],
      R0110: ["matched", 0n],
      R0143: ["not_received", -5911799n],
    });
  });
});
