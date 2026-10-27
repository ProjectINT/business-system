// A snapshot: the source rows, the DQ run over them and what pages derive from both once —
// properties and clusters for the filters, the data range, every row with its status, the calculator input.
import { parseDate, period, type CalcPolicies, type CalendarDate, type Money } from "../calc";
import { ENTITIES } from "../ingest";
import { entitiesOf, type Check, type Dataset, type JournalResult, type RowEntity, type RunReport, type Verdict } from "../dq";
import { admit, calcStatus, toMoney } from "./admit";
import type { FailedRule, MoneyKind, PropertyInfo, RecordInfo, RuleInfo, Snapshot, SourceInfo } from "./types";

export interface SnapshotParts {
  readonly source: SourceInfo;
  readonly dataset: Dataset;
  readonly report: RunReport;
  /** The registry's checks: titles and actions of the rules. */
  readonly checks: readonly Check[];
  readonly policies: CalcPolicies;
}

type AnyRow = Dataset["rows"][RowEntity][number];

interface Facts {
  readonly propertyId: string | null;
  readonly amount: Money | null;
  readonly date: CalendarDate | null;
}

function moneyOf(units: bigint | null, currency: string | null): Money | null {
  return units === null || currency === null ? null : toMoney(units, currency);
}

function factsOf(entity: RowEntity, row: AnyRow): Facts {
  switch (entity) {
    case "reservation": {
      const v = (row as Dataset["rows"]["reservation"][number]).values;
      return { propertyId: v.property_id, amount: moneyOf(v.gross_booking_value, v.currency), date: v.check_out };
    }
    case "payment": {
      const v = (row as Dataset["rows"]["payment"][number]).values;
      return { propertyId: v.property_id, amount: moneyOf(v.amount, v.currency), date: v.payment_date };
    }
    case "expense": {
      const v = (row as Dataset["rows"]["expense"][number]).values;
      return { propertyId: v.property_id, amount: moneyOf(v.amount, v.currency), date: v.expense_date };
    }
    default:
      return { propertyId: (row.values as { property_id: string | null }).property_id, amount: null, date: null };
  }
}

/** Every date that places a row in time: stays, payments, expenses. */
function datesOf(dataset: Dataset): CalendarDate[] {
  const out: (CalendarDate | null)[] = [];
  for (const r of dataset.rows.reservation) out.push(r.values.check_in, r.values.check_out);
  for (const r of dataset.rows.payment) out.push(r.values.payment_date);
  for (const r of dataset.rows.expense) out.push(r.values.expense_date);
  return out.filter((d): d is CalendarDate => d !== null);
}

function failedRules(report: RunReport, checks: readonly Check[]): Map<string, FailedRule[]> {
  const actionOf = new Map(checks.map((c) => [c.id, c.action]));
  const out = new Map<string, FailedRule[]>();
  for (const [ruleId, results] of report.results) {
    for (const r of results as readonly JournalResult[]) {
      if (r.outcome !== "fail" || r.entity === "file") continue;
      const action = r.action ?? actionOf.get(ruleId);
      if (action === undefined) throw new Error(`${ruleId} ran but is not among the checks`);
      const list = out.get(r.unitId) ?? [];
      list.push({ ruleId, action });
      out.set(r.unitId, list);
    }
  }
  return out;
}

/** Why DQ-05 failed a payment, by unit id: `missing`, `reservation_excluded`, … */
function paymentProblems(report: RunReport): Map<string, string> {
  const out = new Map<string, string>();
  for (const [ruleId, results] of report.results) {
    if (ruleId !== "DQ-05") continue;
    for (const r of results) if (r.outcome === "fail") out.set(r.unitId, (r.details as { problem: string }).problem);
  }
  return out;
}

/** PLAN.md 7.4: one kind of money per payment, from its verdict, the reason DQ-05 gives and its own status. */
function moneyKindOf(row: Dataset["rows"]["payment"][number], verdict: Verdict, problem: string | undefined): MoneyKind {
  switch (verdict.status) {
    case "duplicate":
    case "superseded": // an older version: the newer row carries the money
      return "duplicate";
    case "excluded":
      if (verdict.ruleIds.includes("DQ-25")) return "held"; // an unknown status: real money or not, not the villa's yet
      if (verdict.ruleIds.includes("DQ-05")) return problem === "missing" ? "unallocated" : "held";
      return "excluded";
    default:
      return row.values.status === "pending" ? "held" : "received";
  }
}

export function buildSnapshot(parts: SnapshotParts): Snapshot {
  const { source, dataset, report, checks, policies } = parts;
  const verdictOf = new Map<string, Verdict>(report.verdicts.map((v) => [v.unitId, v]));
  const failed = failedRules(report, checks);
  const problems = paymentProblems(report);

  const records: RecordInfo[] = [];
  for (const entity of ENTITIES) {
    for (const row of dataset.rows[entity] as readonly AnyRow[]) {
      const verdict = verdictOf.get(row.unitId);
      if (verdict === undefined) throw new Error(`${row.unitId} has no verdict`);
      records.push({
        unitId: row.unitId,
        entity,
        lineNo: row.lineNo,
        recordKey: row.recordKey,
        ...factsOf(entity, row),
        status: verdict.status,
        ruleIds: verdict.ruleIds,
        failed: failed.get(row.unitId) ?? [],
        money: entity === "payment" ? moneyKindOf(row as Dataset["rows"]["payment"][number], verdict, problems.get(row.unitId)) : null,
      });
    }
  }
  records.sort((a, b) => (a.unitId < b.unitId ? -1 : 1)); // unit ids are unique

  const properties: PropertyInfo[] = [];
  const seen = new Set<string>();
  for (const row of dataset.rows.property) {
    const status = verdictOf.get(row.unitId)!.status;
    const id = row.values.property_id;
    if (id === null || calcStatus(status) === null || seen.has(id)) continue;
    seen.add(id);
    properties.push({ propertyId: id, name: row.values.property_name, cluster: row.values.cluster, status });
  }
  properties.sort((a, b) => (a.propertyId < b.propertyId ? -1 : 1));
  const clusters = [...new Set(properties.map((p) => p.cluster).filter((c): c is string => c !== null))].sort();

  const dates = datesOf(dataset).sort();
  const today = parseDate(report.meta.today);
  const range = dates.length === 0 ? period(today, today) : period(dates[0]!, dates[dates.length - 1]!);

  const ruleOrder = new Map(report.meta.rules.map((r, i) => [r.id, i]));
  const rules: RuleInfo[] = checks
    .filter((c) => ruleOrder.has(c.id))
    .sort((a, b) => ruleOrder.get(a.id)! - ruleOrder.get(b.id)!)
    .map((c) => ({ id: c.id, title: c.title, action: c.action, entities: entitiesOf(c), engine: c.engine }));

  const { input, failures } = admit(dataset, report.verdicts);
  return {
    source,
    dataset,
    report,
    rules,
    policies,
    today,
    properties,
    clusters,
    range,
    records,
    input,
    failures,
  };
}
