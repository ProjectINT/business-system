// Types of the data layer (PLAN.md 4.2 and 10): a source gives a snapshot — the source rows, the DQ
// run over them and the calculator input built from both. Pages ask the snapshot for figures under
// filters; neither the checks nor the calculator know where the rows came from.
import type { CalcPolicies, CalendarDate, Money, OverviewInput, Period } from "../calc";
import type { Action, Dataset, Entity, RowEntity, RuleId, RunReport, Status } from "../dq";

export interface PropertyInfo {
  readonly propertyId: string;
  readonly name: string | null;
  readonly cluster: string | null;
  readonly status: Status;
}

export interface RuleInfo {
  readonly id: RuleId;
  readonly title: string;
  readonly action: Action;
  /** The rule's area: source entities, or `file` (DQ-90). */
  readonly entities: readonly Entity[];
  readonly engine: "ts" | "sql";
}

export interface FailedRule {
  readonly ruleId: RuleId;
  /** The result's own action when it has one (DQ-05: exclude or hold), otherwise the rule's. */
  readonly action: Action;
}

/** A source row with its final status: for /raw-data, the amounts outside the figures and the flags. */
export interface RecordInfo {
  readonly unitId: string;
  readonly entity: RowEntity;
  readonly lineNo: number;
  readonly recordKey: string | null;
  readonly propertyId: string | null;
  readonly status: Status;
  /** Rules that set the status; empty for `clean`. */
  readonly ruleIds: readonly RuleId[];
  /** Every rule that failed on the row, `info` included. */
  readonly failed: readonly FailedRule[];
  /** Reservation: GBV; payment and expense: amount. `null` when it did not parse or the currency is unknown. */
  readonly amount: Money | null;
  /**
   * The date that places the row in a period outside the calculator: check-out for a reservation
   * (as reconciliation does), payment_date, expense_date. `null` for other entities or when it did not parse.
   */
  readonly date: CalendarDate | null;
}

/** A row the checks admitted that still cannot reach the calculator (an unknown currency). */
export interface DataFailure {
  readonly entity: "reservation" | "payment" | "expense";
  readonly recordId: string;
  readonly propertyId: string;
  readonly code: string;
  readonly message: string;
}

export interface SourceInfo {
  readonly kind: "csv";
  /** What the user sees: the directory of the files. */
  readonly label: string;
}

export interface Snapshot {
  readonly source: SourceInfo;
  readonly dataset: Dataset;
  readonly report: RunReport;
  /** Rules of the run, in run order. */
  readonly rules: readonly RuleInfo[];
  readonly policies: CalcPolicies;
  readonly asOf: CalendarDate;
  /** `true`: no as-of date was given, the largest `updated_at` was taken. */
  readonly asOfDefaulted: boolean;
  /** Properties of the source, sorted by id. */
  readonly properties: readonly PropertyInfo[];
  /** Clusters of the properties, sorted. */
  readonly clusters: readonly string[];
  /** First and last date found in the data: stays, payments, expenses. */
  readonly range: Period;
  /** Every source row, sorted by unit id. */
  readonly records: readonly RecordInfo[];
  /** `clean` → clean; `review` and `pending` → review (level 1 has no decisions); the rest stay out. */
  readonly input: OverviewInput;
  readonly failures: readonly DataFailure[];
}

/** Where the rows come from: CSV at level 1, Supabase at level 2 (phase 7c). */
export interface DataSource {
  readonly kind: SourceInfo["kind"];
  snapshot(): Promise<Snapshot>;
}
