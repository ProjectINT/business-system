import { describe, expect, it } from "vitest";
import { datasetSource } from "./sources/dataset";
import { datasetFrom, RESERVATION } from "./testing/fixture";
import { failAlways, passAlways } from "./testing/stubs";
import type { Action, Decision, DecisionKind, RuleId } from "./types";
import { supersededVerdict, verdictFor, type RuleResult } from "./verdict";

const unit = datasetSource(datasetFrom({ reservation: [RESERVATION] })).units("reservation")[0]!;

function fail(id: RuleId, action: Action): RuleResult {
  return { check: failAlways({ id, action }), result: { unitId: unit.unitId, recordKey: "R0001", outcome: "fail" } };
}
function pass(id: RuleId, action: Action = "exclude"): RuleResult {
  return { check: passAlways({ id, action }), result: { unitId: unit.unitId, recordKey: "R0001", outcome: "pass" } };
}
function skip(id: RuleId, action: Action = "exclude"): RuleResult {
  return {
    check: passAlways({ id, action }),
    result: { unitId: unit.unitId, recordKey: "R0001", outcome: "skip", reason: "n/a" },
  };
}
function decision(kind: DecisionKind): Decision {
  return { decisionId: "d1", kind, caseKey: "C1", recordKey: "R0001", rowHash: unit.rowHash, payload: {} };
}

const base = { unitId: unit.unitId, entity: "reservation", recordKey: "R0001" };

describe("verdictFor without decisions", () => {
  it("clean with no results, with only passes and skips, and with info fails", () => {
    expect(verdictFor(unit, [], null)).toEqual({ ...base, status: "clean", ruleIds: [], decisionId: null });
    expect(verdictFor(unit, [pass("DQ-01"), skip("DQ-02"), fail("DQ-15", "info")], null)).toEqual({
      ...base,
      status: "clean",
      ruleIds: [],
      decisionId: null,
    });
  });

  it("review lists the review rules only", () => {
    const v = verdictFor(unit, [fail("DQ-08", "review"), fail("DQ-15", "info"), fail("DQ-11", "review")], null);
    expect(v).toEqual({ ...base, status: "review", ruleIds: ["DQ-08", "DQ-11"], decisionId: null });
  });

  it("decide without a decision is pending; hold is pending", () => {
    expect(verdictFor(unit, [fail("DQ-08", "review"), fail("DQ-12", "decide")], null).status).toBe("pending");
    const v = verdictFor(unit, [fail("DQ-12", "decide"), fail("DQ-05", "hold"), fail("DQ-13", "decide")], null);
    expect(v).toEqual({ ...base, status: "pending", ruleIds: ["DQ-12", "DQ-13", "DQ-05"], decisionId: null });
  });

  it("exclude beats decide, hold and review", () => {
    const v = verdictFor(unit, [fail("DQ-12", "decide"), fail("DQ-04", "exclude"), fail("DQ-08", "review")], null);
    expect(v).toEqual({ ...base, status: "excluded", ruleIds: ["DQ-04"], decisionId: null });
  });

  it("duplicate beats everything", () => {
    const v = verdictFor(unit, [fail("DQ-04", "exclude"), fail("DQ-01", "duplicate"), fail("DQ-12", "decide")], null);
    expect(v).toEqual({ ...base, status: "duplicate", ruleIds: ["DQ-01"], decisionId: null });
  });

  it("an error outcome is not a fail", () => {
    const err: RuleResult = {
      check: failAlways({ id: "DQ-04", action: "exclude" }),
      result: { unitId: unit.unitId, recordKey: "R0001", outcome: "error", reason: "threw" },
    };
    expect(verdictFor(unit, [err], null).status).toBe("clean");
  });
});

describe("verdictFor with a decision in force", () => {
  const conflict = [fail("DQ-12", "decide")];

  it("accept and keep_published make a decide row clean and name the decision", () => {
    for (const kind of ["accept", "keep_published"] as const) {
      expect(verdictFor(unit, conflict, decision(kind))).toEqual({ ...base, status: "clean", ruleIds: [], decisionId: "d1" });
    }
  });

  it("finance_only makes it review, together with review rules", () => {
    expect(verdictFor(unit, conflict, decision("finance_only"))).toEqual({
      ...base,
      status: "review",
      ruleIds: [],
      decisionId: "d1",
    });
    expect(verdictFor(unit, [...conflict, fail("DQ-08", "review")], decision("finance_only")).ruleIds).toEqual(["DQ-08"]);
  });

  it("exclude makes it excluded even with no exclude rule", () => {
    expect(verdictFor(unit, conflict, decision("exclude"))).toEqual({
      ...base,
      status: "excluded",
      ruleIds: [],
      decisionId: "d1",
    });
  });

  it("a rule's exclude names the rule, not the decision, unless the decision is exclude too", () => {
    const results = [...conflict, fail("DQ-04", "exclude")];
    expect(verdictFor(unit, results, decision("accept"))).toEqual({ ...base, status: "excluded", ruleIds: ["DQ-04"], decisionId: null });
    expect(verdictFor(unit, results, decision("exclude")).decisionId).toBe("d1");
  });

  it("a decision does not release a hold, and never touches duplicate", () => {
    expect(verdictFor(unit, [...conflict, fail("DQ-05", "hold")], decision("accept"))).toEqual({
      ...base,
      status: "pending",
      ruleIds: ["DQ-05"],
      decisionId: null,
    });
    expect(verdictFor(unit, [fail("DQ-01", "duplicate")], decision("accept")).decisionId).toBeNull();
  });

  it("a review decision on a row with review rules keeps the rules as reasons", () => {
    const v = verdictFor(unit, [fail("DQ-08", "review")], decision("accept"));
    expect(v).toEqual({ ...base, status: "review", ruleIds: ["DQ-08"], decisionId: null });
  });
});

describe("supersededVerdict", () => {
  it("has neither rules nor a decision", () => {
    expect(supersededVerdict(unit)).toEqual({ ...base, status: "superseded", ruleIds: [], decisionId: null });
  });
});
