// Helpers for rule tests: run the default registry (or a part of it) on a small dataset and read
// the results of one rule; build the context a rule sees, i.e. after the rules ordered before it.
import { DEFAULT_POLICIES, type CalcPolicies } from "../../calc";
import { CHECKS, defaultRegistry } from "../checks";
import { createRegistry } from "../registry";
import { NO_DECISIONS, runChecks } from "../runner";
import { MemorySink } from "../sinks/memory";
import { datasetSource } from "../sources/dataset";
import type { Check, CheckContext, CheckResult, Dataset, JournalResult, RuleId, RunReport, Status } from "../types";

export const TODAY = "2026-10-15";

export interface RunOn {
  readonly today?: string;
  readonly checks?: readonly Check[];
  readonly policies?: CalcPolicies;
}

export async function runOn(dataset: Dataset, opts: RunOn = {}): Promise<RunReport> {
  const registry = opts.checks === undefined ? defaultRegistry() : createRegistry(opts.checks);
  return runChecks({
    source: datasetSource(dataset),
    registry,
    sink: new MemorySink(),
    today: opts.today ?? TODAY,
    ...(opts.policies === undefined ? {} : { policies: opts.policies }),
  });
}

/** The context a rule sees in a full run: statuses after every rule ordered before it. */
export function contextBefore(check: Check, dataset: Dataset, today: string = TODAY): () => Promise<CheckContext> {
  return async () => {
    const ordered = defaultRegistry().checks;
    const index = ordered.findIndex((c) => c.id === check.id);
    const before = index < 0 ? ordered : ordered.slice(0, index);
    const report = await runOn(dataset, { today, checks: before });
    const status = new Map(report.verdicts.map((v) => [v.unitId, v.status]));
    const source = datasetSource(dataset);
    return {
      batchId: source.batchId,
      today,
      units: (e) => source.units(e),
      statusSoFar: (unitId) => {
        const s = status.get(unitId);
        if (s === undefined) throw new Error(`No row with unit id ${unitId}`);
        return s;
      },
      decisions: NO_DECISIONS,
      policies: DEFAULT_POLICIES,
    };
  };
}

/** The rule alone, every status `clean`: reaches the branches a full run never does (a blank value is DQ-03's first). */
export async function runAlone(check: Check, dataset: Dataset, today: string = TODAY): Promise<readonly CheckResult[]> {
  const source = datasetSource(dataset);
  const ctx: CheckContext = {
    batchId: source.batchId,
    today,
    units: (e) => source.units(e),
    statusSoFar: () => "clean",
    decisions: NO_DECISIONS,
    policies: DEFAULT_POLICIES,
  };
  const run = check.engine === "sql" ? check.runTs! : check.run;
  return run.call(check, ctx);
}

/** Skip reasons of a rule run alone, by record key (unit id when there is no key). */
export async function skipsAlone(check: Check, dataset: Dataset, today: string = TODAY): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const r of await runAlone(check, dataset, today)) if (r.outcome === "skip") out[r.recordKey ?? r.unitId] = r.reason!;
  return out;
}

export function resultsOf(report: RunReport, ruleId: RuleId): readonly JournalResult[] {
  const results = report.results.get(ruleId);
  if (results === undefined) throw new Error(`${ruleId} did not run`);
  return results;
}

/** The one result of a rule on a record key; throws when the key has several rows. */
export function resultFor(report: RunReport, ruleId: RuleId, recordKey: string): JournalResult {
  const matches = resultsOf(report, ruleId).filter((r) => r.recordKey === recordKey);
  if (matches.length !== 1) throw new Error(`${ruleId}: ${matches.length} results for ${recordKey}`);
  return matches[0]!;
}

export function outcomeOf(report: RunReport, ruleId: RuleId, recordKey: string): string {
  return resultFor(report, ruleId, recordKey).outcome;
}

/** Record keys of the rule's `fail` results, sorted; a key with several failing rows appears once per row. */
export function failedKeys(report: RunReport, ruleId: RuleId): string[] {
  return resultsOf(report, ruleId)
    .filter((r) => r.outcome === "fail")
    .map((r) => r.recordKey ?? "<no key>")
    .sort();
}

export function statusOf(report: RunReport, recordKey: string): Status | undefined {
  const matches = report.verdicts.filter((v) => v.recordKey === recordKey);
  if (matches.length > 1) throw new Error(`${matches.length} verdicts for ${recordKey}`);
  return matches[0]?.status;
}

export { CHECKS };
