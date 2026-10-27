import { describe, expect, it } from "vitest";
import { RULE_META } from "@/components/rules/rule-meta";
import type { ExceptionCode } from "@/lib/nightly";
import { actionOf, CODE_META, CODE_ORDER, KIND_META, ruleOfCode } from "./exception-meta";

// VALIDATION_PLAN.md 6.1: the code, the rule it maps to, the action in the system.
const TABLE: [ExceptionCode, string | null, string][] = [
  ["AMBIGUOUS_VERSION", "DQ-02", "decide"],
  ["CONFLICTING_EVENT", "DQ-02", "decide"],
  ["CONFLICTING_PAYMENT", "DQ-02", "decide"],
  ["UNKNOWN_PROPERTY", "DQ-04", "exclude"],
  ["CURRENCY_MISMATCH", "DQ-06", "exclude"],
  ["INVALID_STAY", "DQ-07", "exclude"],
  ["NO_COMMISSION_RULE", "DQ-17", "exclude"],
  ["AMBIGUOUS_COMMISSION_RULE", "DQ-17", "exclude"],
  ["UNKNOWN_STATUS", "DQ-03", "exclude"],
  ["UNMATCHED_PAYMENT", "DQ-05", "exclude"],
  ["PENDING_PAYMENT", "DQ-25", "info"],
  ["PAYMENT_HELD", "DQ-05", "exclude"],
  ["OUTSIDE_REPORT_MONTHS", null, "info"],
];

describe("exception meta", () => {
  it("covers the 13 codes of the report", () => {
    expect(CODE_ORDER).toHaveLength(13);
    expect(new Set(CODE_ORDER)).toEqual(new Set(TABLE.map(([c]) => c)));
  });

  it.each(TABLE)("%s: rule %s, action %s as in VALIDATION_PLAN.md 6.1", (code, rule, action) => {
    expect(ruleOfCode(code, "reservation")).toBe(rule);
    expect(actionOf(code)).toBe(action);
  });

  it("every code has a mark — a known rule's icon or tag, or its own tag — a label and a fix", () => {
    for (const code of CODE_ORDER) {
      const m = CODE_META[code];
      if (m.rule === null) expect(m.tag).toMatch(/^[A-Z]{2,4}$/);
      else expect(RULE_META[m.rule]).toBeDefined();
      expect(m.label).not.toBe("");
      expect(m.fix).not.toBe("");
      expect(KIND_META[m.kind]).toBeDefined();
    }
  });

  it("an unknown payment status takes the payment-status rule; a held payment waits with a booking in dispute", () => {
    expect(ruleOfCode("UNKNOWN_STATUS", "payment")).toBe("DQ-25");
    expect(actionOf("PAYMENT_HELD", true)).toBe("hold");
  });
});
