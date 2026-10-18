// Contract of the data-quality module (docs/VALIDATION_PLAN.md 3 and 4). Rules return results,
// the runner checks coverage and writes the journal; rows and the journal come through interfaces
// so that level 2 (Postgres) replaces two adapters and keeps every rule and its tests.
import type { CalcPolicies } from "../calc";
import type { Dataset, Entity as RowEntity, IngestedFile, IngestedRow, Values } from "../ingest";

export type { RowEntity };

/** Area of a rule: one of the five source entities, or a file as a whole (DQ-90). */
export type Entity = RowEntity | "file";

export type Outcome = "pass" | "fail" | "skip" | "error";

/**
 * What `fail` means for the row's status. `decide` — the row waits for a human decision;
 * `hold` — it waits for a decision on another row (a payment of a reservation under review).
 */
export type Action = "duplicate" | "exclude" | "decide" | "hold" | "review" | "info";

export type Status = "clean" | "review" | "pending" | "excluded" | "duplicate" | "superseded";

/** Where a row of the effective set comes from (VALIDATION_PLAN.md 2). Level 1 has only `batch`. */
export type Origin = "batch" | "pending" | "published";

/** Rule ids are `DQ-` and two digits: `app.dq_check_result.rule_id ~ '^DQ-\d{2}$'`. */
export type RuleId = `DQ-${string}`;

export interface RowUnit<E extends RowEntity = RowEntity> extends IngestedRow<Values<E>> {
  readonly origin: Origin;
  /** Batch that brought the row; `null` for a published record without one. */
  readonly batchId: string | null;
}

export interface FileUnit {
  /** File name at level 1; `import_file.file_id` at level 2. */
  readonly unitId: string;
  readonly entity: "file";
  readonly fileEntity: RowEntity;
  /** A file has no natural key. */
  readonly recordKey: null;
  readonly file: IngestedFile;
  /** Rows loaded from this file, for control totals. */
  readonly rowUnitIds: readonly string[];
}

export type Unit<E extends Entity = Entity> = E extends "file" ? FileUnit : E extends RowEntity ? RowUnit<E> : never;

export type AnyUnit = RowUnit | FileUnit;

export interface CheckResult {
  /** `unitId` of a row or file of the rule's area. */
  readonly unitId: string;
  /** Natural key of the row (R0015, P0075); `null` for a file or a row without a key. */
  readonly recordKey: string | null;
  readonly outcome: Outcome;
  /** Mandatory for `skip`: "not checked" must differ from "checked, fine". */
  readonly reason?: string;
  /** Facts, not text: amounts, rate, overlap interval. The UI builds the message. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** The other reservation of a pair, a candidate origin, a payment. */
  readonly relatedKeys?: readonly string[];
  /** Amount in question, whole IDR as in lib/calc. */
  readonly amountIdr?: bigint;
}

export interface Check<E extends Entity = Entity> {
  readonly id: RuleId;
  /** Bumped when the logic changes. */
  readonly version: number;
  readonly title: string;
  readonly entity: E;
  readonly action: Action;
  readonly engine: "ts" | "sql";
  /** Rules whose verdicts this one reads through `statusSoFar`. */
  readonly dependsOn: readonly RuleId[];
  run(ctx: CheckContext): Promise<readonly CheckResult[]>;
  /** For `engine: 'sql'`: the same logic on TS, used when there is no database. */
  runTs?(ctx: CheckContext): Promise<readonly CheckResult[]>;
}

export type DecisionKind = "accept" | "finance_only" | "exclude" | "keep_published";

/** A human decision on a reservation of a case (VALIDATION_PLAN.md 7.5), in force for this run. */
export interface Decision {
  readonly decisionId: string;
  readonly kind: DecisionKind;
  readonly caseKey: string;
  readonly recordKey: string;
  /** Hash of the row the decision was taken on; a different row voids it. */
  readonly rowHash: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Decisions in force. Level 1 has none; phase 8 binds them to `case_key` and `row_hash`. */
export interface Decisions {
  forUnit(unit: RowUnit): Decision | null;
}

export interface CheckContext {
  /** `null` — a run with decisions and no new batch (VALIDATION_PLAN.md 7.5). */
  readonly batchId: string | null;
  /** As-of date of the run, ISO date; the only "today" a rule may use. */
  readonly asOf: string;
  /** The effective set (VALIDATION_PLAN.md 2); the same array on every call within a run. */
  units<E extends Entity>(entity: E): readonly Unit<E>[];
  /** Status of a row after the rules executed so far and the decisions in force. */
  statusSoFar(unitId: string): Status;
  readonly decisions: Decisions;
  readonly policies: CalcPolicies;
  /** Database handle; present only in the mode with a database (level 2). */
  readonly db?: unknown;
}

/** Rows and files a run checks. Level 1: `datasetSource` over lib/ingest; level 2: `app.eff_*`. */
export interface Source {
  readonly batchId: string | null;
  units<E extends Entity>(entity: E): readonly Unit<E>[];
  /** Rows `pending` of earlier batches displaced by a newer version of the same key (priority 0). */
  superseded(): readonly RowUnit[];
  /** Largest `updated_at` over the set: the as-of date when the batch sets none. `null` — no dates. */
  defaultAsOf(): string | null;
}

export interface Verdict {
  readonly unitId: string;
  readonly entity: RowEntity;
  readonly recordKey: string | null;
  readonly status: Status;
  /** Rules that set the status; empty for `clean` and `superseded`. */
  readonly ruleIds: readonly RuleId[];
  /** Decision that set the status; `null` — a rule did. */
  readonly decisionId: string | null;
}

export interface RuleRef {
  readonly id: RuleId;
  readonly version: number;
}

export interface RunMeta {
  readonly batchId: string | null;
  readonly asOf: string;
  /** `true`: the batch had no as-of date, the largest `updated_at` of the set was taken. */
  readonly asOfDefaulted: boolean;
  readonly codeVersion: string;
  readonly rules: readonly RuleRef[];
}

export type RunStatus = "running" | "succeeded" | "failed";

/** A rule that could not be trusted in this run: it threw, or broke the contract. */
export interface RuleFailure {
  readonly ruleId: RuleId;
  readonly message: string;
}

export interface RunSummary {
  readonly counts: Readonly<Record<Status, number>>;
  readonly failures: readonly RuleFailure[];
}

export interface RunClose {
  readonly status: Exclude<RunStatus, "running">;
  readonly error: string | null;
  readonly summary: RunSummary;
}

/** Journal of runs: memory at level 1, Postgres at level 2 (VALIDATION_PLAN.md 4). */
export interface Sink {
  startRun(meta: RunMeta): Promise<string>;
  writeResults(runId: string, check: Check, results: readonly CheckResult[]): Promise<void>;
  writeVerdicts(runId: string, verdicts: readonly Verdict[]): Promise<void>;
  finishRun(runId: string, close: RunClose): Promise<void>;
}

export interface RunReport {
  readonly runId: string;
  readonly status: Exclude<RunStatus, "running">;
  readonly meta: RunMeta;
  readonly results: ReadonlyMap<RuleId, readonly CheckResult[]>;
  readonly verdicts: readonly Verdict[];
  readonly summary: RunSummary;
}

export type { Dataset };
