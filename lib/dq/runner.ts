// Runs the rules of a registry over a source and writes the journal (VALIDATION_PLAN.md 5, steps 1–5).
// Publication (step 6) and the gate (step 7) belong to level 2 and sit on top of the report.
//
// A rule that throws, or returns results that break the contract, gets `error` on every unit of its
// area and the run ends `failed`; the other rules still run, so the journal shows the whole picture.
// A `fail` of a file-level rule (DQ-90, control totals) also fails the run: the data cannot be trusted.
import { DEFAULT_POLICIES, parseDate, type CalcPolicies } from "../calc";
import { ENTITIES } from "../ingest";
import { areaOf, contractViolations, sortResults } from "./contract";
import { DqError } from "./errors";
import type { Registry } from "./registry";
import type {
  AnyUnit,
  Check,
  CheckContext,
  CheckResult,
  Decisions,
  Entity,
  JournalResult,
  RowUnit,
  RuleFailure,
  RuleId,
  RunMeta,
  RunReport,
  RunSummary,
  Sink,
  Source,
  Status,
  Unit,
  Verdict,
} from "./types";
import { supersededVerdict, verdictFor, type RuleResult } from "./verdict";

export const NO_DECISIONS: Decisions = Object.freeze({ forUnit: () => null });

export interface RunOptions {
  readonly source: Source;
  readonly registry: Registry;
  readonly sink: Sink;
  /** As-of date; without it, the largest `updated_at` of the set, marked as defaulted. */
  readonly asOf?: string;
  readonly policies?: CalcPolicies;
  readonly decisions?: Decisions;
  /** Git sha or alike, recorded with the run. */
  readonly codeVersion?: string;
  readonly db?: unknown;
}

const STATUSES: readonly Status[] = ["clean", "review", "pending", "excluded", "duplicate", "superseded"];

export async function runChecks(options: RunOptions): Promise<RunReport> {
  const { source, registry, sink } = options;
  const decisions = options.decisions ?? NO_DECISIONS;
  const policies = options.policies ?? DEFAULT_POLICIES;

  const defaulted = options.asOf === undefined;
  const asOf = options.asOf ?? source.defaultAsOf();
  if (asOf === null) throw new DqError("NO_AS_OF", "No as-of date given and the set has no dates to default to");
  parseDate(asOf); // a calendar date or a CalcError

  const meta: RunMeta = {
    batchId: source.batchId,
    asOf,
    asOfDefaulted: defaulted,
    codeVersion: options.codeVersion ?? "dev",
    rules: registry.checks.map((c) => ({ id: c.id, version: c.version })),
  };
  const runId = await sink.startRun(meta);

  // The effective set, read once: the same arrays on every call within the run.
  const areas = new Map<Entity, readonly AnyUnit[]>();
  const units = <E extends Entity>(entity: E): readonly Unit<E>[] => {
    let area = areas.get(entity);
    if (area === undefined) {
      area = source.units(entity);
      areas.set(entity, area);
    }
    return area as readonly Unit<E>[];
  };
  const rowUnits = new Map<string, RowUnit>();
  for (const entity of ENTITIES) for (const u of units(entity)) rowUnits.set(u.unitId, u);

  const resultsSoFar = new Map<string, RuleResult[]>();
  const statusSoFar = (unitId: string): Status => {
    const unit = rowUnits.get(unitId);
    if (unit === undefined) throw new DqError("UNKNOWN_UNIT", `No row with unit id ${unitId}`, { unitId });
    return verdictFor(unit, resultsSoFar.get(unitId) ?? [], decisions.forUnit(unit)).status;
  };

  const ctx: CheckContext = {
    batchId: source.batchId,
    asOf,
    units,
    statusSoFar,
    decisions,
    policies,
    ...(options.db === undefined ? {} : { db: options.db }),
  };

  const failures: RuleFailure[] = [];
  const results = new Map<RuleId, readonly JournalResult[]>();

  for (const check of registry.checks) {
    const area = areaOf(check, units);
    const { results: checked, failure } = await runOne(check, ctx, area);
    if (failure !== null) failures.push(failure);
    else if (check.entity === "file") {
      const failed = checked.filter((r) => r.outcome === "fail");
      if (failed.length > 0) {
        failures.push({ ruleId: check.id, message: `control totals differ: ${failed.map((r) => r.unitId).join(", ")}` });
      }
    }
    results.set(check.id, checked);
    await sink.writeResults(runId, check, checked);
    for (const r of checked) {
      if (r.entity === "file") continue;
      const list = resultsSoFar.get(r.unitId) ?? [];
      list.push({ check, result: r });
      resultsSoFar.set(r.unitId, list);
    }
  }

  const verdicts: Verdict[] = [];
  for (const unit of rowUnits.values()) verdicts.push(verdictFor(unit, resultsSoFar.get(unit.unitId) ?? [], decisions.forUnit(unit)));
  for (const unit of source.superseded()) verdicts.push(supersededVerdict(unit));
  verdicts.sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
  await sink.writeVerdicts(runId, verdicts);

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const v of verdicts) counts[v.status]++;
  const summary: RunSummary = { counts, failures };
  const status = failures.length === 0 ? "succeeded" : "failed";
  const error = failures.length === 0 ? null : failures.map((f) => `${f.ruleId}: ${f.message}`).join("; ");
  await sink.finishRun(runId, { status, error, summary });

  return { runId, status, meta, results, verdicts, summary };
}

async function runOne(
  check: Check,
  ctx: CheckContext,
  area: readonly AnyUnit[],
): Promise<{ results: readonly JournalResult[]; failure: RuleFailure | null }> {
  const run = check.engine === "sql" && ctx.db === undefined ? check.runTs : check.run.bind(check);
  if (run === undefined) {
    return errored(check, area, "an SQL rule without a TS twin cannot run without a database");
  }
  let returned: readonly CheckResult[];
  try {
    returned = await run.call(check, ctx);
  } catch (e) {
    return errored(check, area, `threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  const violations = contractViolations(area, returned);
  if (violations.length > 0) {
    return errored(check, area, `broke the contract: ${violations.join("; ")}`);
  }
  const entityOf = new Map(area.map((u) => [u.unitId, u.entity]));
  return { results: sortResults(returned.map((r) => ({ ...r, entity: entityOf.get(r.unitId)! }))), failure: null };
}

function errored(check: Check, area: readonly AnyUnit[], message: string) {
  const results = sortResults(
    area.map(
      (u): JournalResult => ({ unitId: u.unitId, recordKey: u.recordKey, entity: u.entity, outcome: "error", reason: message }),
    ),
  );
  return { results, failure: { ruleId: check.id, message } };
}
