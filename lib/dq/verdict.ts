// Final status of a row from its results and the decision in force (VALIDATION_PLAN.md 4):
//   0. displaced pending row                        → superseded
//   1. fail with duplicate                          → duplicate
//   2. fail with exclude, or decision exclude       → excluded
//   3. fail with decide and no decision, or hold    → pending
//   4. fail with review, or decision finance_only   → review
//   5. otherwise (also after accept/keep_published) → clean; info never changes the status
// `ruleIds` are the rules that set the status, `decisionId` the decision that did; the journal
// shows where a rule decided and where a human did. The action of a `fail` is the result's own
// when it has one (DQ-05: exclude or hold), otherwise the rule's.
import type { Action, Check, CheckResult, Decision, RowUnit, RuleId, Verdict } from "./types";

export interface RuleResult {
  readonly check: Check;
  readonly result: CheckResult;
}

export function actionOf(r: RuleResult): Action {
  return r.result.action ?? r.check.action;
}

export function verdictFor(unit: RowUnit, results: readonly RuleResult[], decision: Decision | null): Verdict {
  const fails = (action: Action): RuleId[] =>
    results.filter((r) => r.result.outcome === "fail" && actionOf(r) === action).map((r) => r.check.id);
  const base = { unitId: unit.unitId, entity: unit.entity, recordKey: unit.recordKey };

  const duplicate = fails("duplicate");
  if (duplicate.length > 0) return { ...base, status: "duplicate", ruleIds: duplicate, decisionId: null };

  const exclude = fails("exclude");
  if (exclude.length > 0 || decision?.kind === "exclude") {
    return {
      ...base,
      status: "excluded",
      ruleIds: exclude,
      decisionId: decision?.kind === "exclude" ? decision.decisionId : null,
    };
  }

  const decide = decision === null ? fails("decide") : [];
  const hold = fails("hold");
  if (decide.length > 0 || hold.length > 0) {
    return { ...base, status: "pending", ruleIds: [...decide, ...hold], decisionId: null };
  }

  const review = fails("review");
  if (review.length > 0 || decision?.kind === "finance_only") {
    return {
      ...base,
      status: "review",
      ruleIds: review,
      decisionId: decision?.kind === "finance_only" ? decision.decisionId : null,
    };
  }

  return { ...base, status: "clean", ruleIds: [], decisionId: decision?.decisionId ?? null };
}

export function supersededVerdict(unit: RowUnit): Verdict {
  return {
    unitId: unit.unitId,
    entity: unit.entity,
    recordKey: unit.recordKey,
    status: "superseded",
    ruleIds: [],
    decisionId: null,
  };
}
