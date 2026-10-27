import { describe, expect, it } from "vitest";
import { distinctRates, managementFeeForNight, resolveCommissionRule } from "./commission";
import { eachNight } from "./primitives/calendar";
import { idr } from "./primitives/money";
import { parseRate, rateToString } from "./primitives/rate";
import { date, RULES, synthetic } from "./testing/fixtures";
import { expectCode } from "./testing/expect";
import type { CommissionRuleInput } from "./types";

const v011 = RULES.find((r) => r.propertyId === "V011") as CommissionRuleInput;

describe("resolveCommissionRule", () => {
  it("bounds are inclusive", () => {
    expect(resolveCommissionRule(RULES, "V011", date("2026-09-01"), "ambiguous")).toBe(v011);
    expect(resolveCommissionRule(RULES, "V011", date("2026-12-31"), "ambiguous").rate).toEqual(parseRate("0.17"));
  });

  it.each(["2026-08-31", "2027-01-01"])("%s → NO_COMMISSION_RULE", (day) =>
    expectCode(() => resolveCommissionRule(RULES, "V011", date(day), "latest-start"), "NO_COMMISSION_RULE"),
  );

  it("ignores rules of other properties", () =>
    expectCode(() => resolveCommissionRule(RULES, "V999", date("2026-09-10"), "ambiguous"), "NO_COMMISSION_RULE"));

  it("open-ended rule has no end date", () => {
    const open = { ...v011, effectiveTo: null };
    expect(resolveCommissionRule([open], "V011", date("2099-01-01"), "ambiguous")).toBe(open);
  });

  // 0.17 from 01.09 and 0.20 from 01.11, both until 31.12
  const later = { ...v011, effectiveFrom: date("2026-11-01"), rate: parseRate("0.2") };

  it("'latest-start': on overlapping periods the rule with the later effective_from wins, in any order", () => {
    expect(resolveCommissionRule([v011, later], "V011", date("2026-10-15"), "latest-start")).toBe(v011);
    expect(resolveCommissionRule([v011, later], "V011", date("2026-11-15"), "latest-start")).toBe(later);
    expect(resolveCommissionRule([later, v011], "V011", date("2026-11-15"), "latest-start")).toBe(later);
  });

  it("'ambiguous': any two rules on the date → AMBIGUOUS_COMMISSION_RULE, in any order; one rule is fine", () => {
    expect(resolveCommissionRule([v011, later], "V011", date("2026-10-15"), "ambiguous")).toBe(v011);
    expectCode(() => resolveCommissionRule([v011, later], "V011", date("2026-11-15"), "ambiguous"), "AMBIGUOUS_COMMISSION_RULE");
    expectCode(() => resolveCommissionRule([later, v011], "V011", date("2026-11-15"), "ambiguous"), "AMBIGUOUS_COMMISSION_RULE");
  });

  it.each(["latest-start", "ambiguous"] as const)("two rules with the same effective_from → AMBIGUOUS_COMMISSION_RULE (%s)", (overlap) => {
    const twin = { ...v011, rate: parseRate("0.2") };
    expectCode(() => resolveCommissionRule([v011, twin], "V011", date("2026-10-05"), overlap), "AMBIGUOUS_COMMISSION_RULE");
  });

  it.each(["latest-start", "ambiguous"] as const)("same effective_from twice but only one still in force is not ambiguous (%s)", (overlap) => {
    const expired = { ...v011, effectiveTo: date("2026-09-30"), rate: parseRate("0.2") };
    expect(resolveCommissionRule([v011, expired], "V011", date("2026-10-05"), overlap)).toBe(v011);
  });

  it("rate change inside a stay: every night takes its own rule", () => {
    const rules = [
      { ...v011, effectiveTo: date("2026-09-30") },
      { ...v011, effectiveFrom: date("2026-10-01"), rate: parseRate("0.2") },
    ];
    const r = synthetic({ checkIn: date("2026-09-28"), checkOut: date("2026-10-04") });
    const rates = eachNight(r.checkIn, r.checkOut).map((d) => rateToString(resolveCommissionRule(rules, r.propertyId, d, "ambiguous").rate));
    expect(rates).toEqual(["0.17", "0.17", "0.17", "0.2", "0.2", "0.2"]);
  });
});

describe("managementFeeForNight", () => {
  it("gross_booking_value × rate, rounded per night", () => {
    expect(managementFeeForNight(idr(1200923n), v011, "half-up")).toEqual(idr(204157n)); // 204 156.91
    expect(managementFeeForNight(idr(1000001n), v011, "half-up")).toEqual(idr(170000n)); // 170 000.17
  });

  it("unknown fee basis → UNSUPPORTED_FEE_BASIS", () => {
    const rule = { ...v011, feeBasis: "net_revenue" as CommissionRuleInput["feeBasis"] };
    expectCode(() => managementFeeForNight(idr(1n), rule, "half-up"), "UNSUPPORTED_FEE_BASIS");
  });
});

describe("distinctRates", () => {
  it("keeps the first of equal fractions, in order", () => {
    const [a, b] = [parseRate("0.17"), parseRate("0.2")];
    expect(distinctRates([a, a, b, { num: 1700n, den: 10000n }, b])).toEqual([a, b]);
    expect(distinctRates([])).toEqual([]);
  });
});
