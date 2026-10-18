import { describe, expect, it } from "vitest";
import { calculateManagementFee, resolveCommissionRule } from "./commission";
import { idr } from "./primitives/money";
import { parseRate } from "./primitives/rate";
import { date, RULES, synthetic } from "./testing/fixtures";
import { expectCode } from "./testing/expect";
import type { CommissionRuleInput } from "./types";

const v011 = RULES.find((r) => r.propertyId === "V011") as CommissionRuleInput;

describe("resolveCommissionRule", () => {
  it("bounds are inclusive", () => {
    expect(resolveCommissionRule(RULES, "V011", date("2026-09-01"))).toBe(v011);
    expect(resolveCommissionRule(RULES, "V011", date("2026-12-31")).rate).toEqual(parseRate("0.17"));
  });

  it.each(["2026-08-31", "2027-01-01"])("%s → NO_COMMISSION_RULE", (day) =>
    expectCode(() => resolveCommissionRule(RULES, "V011", date(day)), "NO_COMMISSION_RULE"),
  );

  it("ignores rules of other properties", () =>
    expectCode(() => resolveCommissionRule(RULES, "V999", date("2026-09-10")), "NO_COMMISSION_RULE"));

  it("open-ended rule has no end date", () => {
    const open = { ...v011, effectiveTo: null };
    expect(resolveCommissionRule([open], "V011", date("2099-01-01"))).toBe(open);
  });

  it("two rules on one date → AMBIGUOUS_COMMISSION_RULE", () => {
    const second = { ...v011, effectiveFrom: date("2026-10-01"), rate: parseRate("0.2") };
    expectCode(() => resolveCommissionRule([v011, second], "V011", date("2026-10-05")), "AMBIGUOUS_COMMISSION_RULE");
  });

  it("rate change inside a stay: the check-in date decides", () => {
    const rules = [
      { ...v011, effectiveTo: date("2026-09-30") },
      { ...v011, effectiveFrom: date("2026-10-01"), rate: parseRate("0.2") },
    ];
    const r = synthetic({ checkIn: date("2026-09-28"), checkOut: date("2026-10-04") });
    expect(resolveCommissionRule(rules, r.propertyId, r.checkIn).rate).toEqual(parseRate("0.17"));
  });
});

describe("calculateManagementFee", () => {
  it("gross_booking_value × rate with one rounding", () => {
    expect(calculateManagementFee({ gross: idr(3602767n) }, v011, "half-up")).toEqual(idr(612470n));
  });

  it("unknown fee basis → UNSUPPORTED_FEE_BASIS", () => {
    const rule = { ...v011, feeBasis: "net_revenue" as CommissionRuleInput["feeBasis"] };
    expectCode(() => calculateManagementFee({ gross: idr(1n) }, rule, "half-up"), "UNSUPPORTED_FEE_BASIS");
  });
});
