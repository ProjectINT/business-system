// The contract every rule must keep (VALIDATION_PLAN.md 3): exactly one result per unit of its
// area, no result outside it, a reason on every `skip`, the unit's own record key. The runner
// applies this check after each rule; the contract test applies the same function to each rule
// of the registry, so "a row without a verdict is impossible by construction" holds in both.
import type { AnyUnit, CheckResult } from "./types";

/** Outcomes a rule may return. `error` is the runner's: a rule that failed or broke the contract. */
const RULE_OUTCOMES: ReadonlySet<string> = new Set(["pass", "fail", "skip"]);

/** Violations of the contract, in the order found; empty when the results cover the area exactly. */
export function contractViolations(area: readonly AnyUnit[], results: readonly CheckResult[]): string[] {
  const violations: string[] = [];
  const byId = new Map(area.map((u) => [u.unitId, u]));
  const seen = new Set<string>();

  for (const r of results) {
    const unit = byId.get(r.unitId);
    if (unit === undefined) {
      violations.push(`result for a unit outside the area: ${r.unitId}`);
      continue;
    }
    if (seen.has(r.unitId)) violations.push(`more than one result for ${r.unitId}`);
    seen.add(r.unitId);
    if (!RULE_OUTCOMES.has(r.outcome)) violations.push(`outcome ${r.outcome} is reserved for the runner: ${r.unitId}`);
    if (r.outcome === "skip" && !r.reason) violations.push(`skip without a reason: ${r.unitId}`);
    if (r.recordKey !== unit.recordKey) {
      violations.push(`record key ${String(r.recordKey)} differs from the unit's ${String(unit.recordKey)}: ${r.unitId}`);
    }
  }
  for (const u of area) if (!seen.has(u.unitId)) violations.push(`no result for ${u.unitId}`);
  return violations;
}

/** Results in journal order: by `unitId`, byte-wise, so two runs on the same data agree. */
export function sortResults(results: readonly CheckResult[]): CheckResult[] {
  return [...results].sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
}
