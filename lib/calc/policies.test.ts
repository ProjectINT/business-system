import { describe, expect, it } from "vitest";
import { assertPolicies, DEFAULT_POLICIES, type CalcPolicies } from "./policies";
import { expectCode } from "./testing/expect";

describe("policies", () => {
  it("defaults are frozen and valid", () => {
    expect(Object.isFrozen(DEFAULT_POLICIES)).toBe(true);
    expect(DEFAULT_POLICIES).toEqual({
      revenueRecognition: "nights",
      rounding: "half-up",
      reconciliationDate: "check_out",
      paymentDue: "check_in",
      commissionRuleOverlap: "ambiguous",
    });
    expect(() => assertPolicies(DEFAULT_POLICIES)).not.toThrow();
  });

  it.each<Partial<Record<keyof CalcPolicies, string>>>([
    { revenueRecognition: "payment" },
    { rounding: "up" },
    { reconciliationDate: "check_in" },
    { paymentDue: "last_night" },
    { commissionRuleOverlap: "earliest-start" },
  ])("%j → INVALID_POLICY", (bad) => {
    expectCode(() => assertPolicies({ ...DEFAULT_POLICIES, ...bad } as CalcPolicies), "INVALID_POLICY");
  });
});
