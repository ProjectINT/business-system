// Server side: the data-quality page as plain text and numbers for the client components. Every figure
// comes from qualityOf (lib/data/quality.ts); here amounts are written out and facts put into words.
import { toView, type Money } from "@/lib/calc";
import { qualityOf, rawTablesOf, type Snapshot } from "@/lib/data";
import type { Action, Entity, Outcome, RowEntity, RuleId, Status } from "@/lib/dq";
import { idrCompact, idrFull, moneyDigits, moneyFull } from "@/lib/format";
import { describe } from "./describe";

/** A rule's result on a row; a pass carries nothing else (about 3,400 of the 4,300 results). */
export interface CheckView {
  ruleId: RuleId;
  outcome: Outcome;
  /** What a fail means for the row. */
  action?: Action;
  /** The facts of a fail in words, the reason of a skip or an error. */
  text?: string;
  /** Record keys a fail points to: the other booking of an overlap, the reservation of a payment. */
  related?: string[];
}

/** The card of a source row: the row as received, its status and every rule's result on it. */
export interface RecordView {
  unitId: string;
  /** Natural key, or file and line when the row has none. */
  key: string;
  entity: RowEntity;
  fileName: string;
  lineNo: number;
  propertyId: string | null;
  status: Status;
  /** Rules that set the status. */
  statusRules: RuleId[];
  amount: string | null;
  fields: [string, string][];
  checks: CheckView[];
}

export interface RuleView {
  id: RuleId;
  title: string;
  action: Action;
  entities: Entity[];
  engine: "ts" | "sql";
  outcomes: Record<Outcome, number>;
  failsByAction: Partial<Record<Action, number>>;
  /** Σ of the amounts in question, whole IDR. */
  amount: number;
}

export interface FileAmountView {
  currency: string;
  source: string;
  inFigures: string;
  excluded: string;
  duplicate: string;
}

export interface FileView {
  entity: RowEntity;
  fileName: string;
  rowCount: number;
  rows: Record<Status, number>;
  rowsInFigures: number;
  amountColumn: string | null;
  amounts: FileAmountView[];
  unsummed: number;
  control: Outcome | null;
  balanced: boolean;
}

export interface IssueView {
  ruleId: RuleId;
  action: Action;
  unitId: string;
  key: string;
  entity: RowEntity;
  propertyId: string | null;
  /** Final status of the row. */
  status: Status;
  text: string;
  /** Amount in question, whole IDR as text. */
  amount: string | null;
}

export interface ExcludedView {
  unitId: string;
  key: string;
  fileName: string;
  lineNo: number;
  propertyId: string | null;
  status: Status;
  rules: RuleId[];
  reason: string;
  amount: string | null;
}

export interface CaseRowView {
  unitId: string;
  key: string;
  reservationStatus: string | null;
  channel: string | null;
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  gross: string | null;
  paid: string | null;
  paymentIds: string[];
  flags: RuleId[];
  overlaps: { with: string; nights: number; kind: string }[];
}

export interface CaseCardView {
  caseKey: string;
  type: "conflict" | "modification" | "version";
  kinds: string[];
  hasModified: boolean;
  from: string | null;
  to: string | null;
  pairs: number;
  maxPerNight: number;
  gross: string | null;
  rows: CaseRowView[];
}

export interface VillaView {
  propertyId: string;
  name: string | null;
  cluster: string | null;
  cases: CaseCardView[];
}

export interface DataQualityModel {
  asOf: string;
  asOfDefaulted: boolean;
  sourceLabel: string;
  runStatus: "succeeded" | "failed";
  runFailures: string[];
  counts: Record<Status, number>;
  rules: RuleView[];
  files: FileView[];
  issues: IssueView[];
  excluded: ExcludedView[];
  villas: VillaView[];
  caseCount: number;
  caseReservations: number;
  heldPayments: number;
  heldAmount: string;
  records: RecordView[];
}

const money = (m: Money | null): string | null => (m === null ? null : moneyFull(m));

function keyOf(r: { recordKey: string | null; lineNo: number }, fileName: string): string {
  return r.recordKey ?? `${fileName}:${r.lineNo}`;
}

export function dataQualityOf(snapshot: Snapshot): DataQualityModel {
  const q = qualityOf(snapshot);
  const fileOf = (entity: RowEntity) => snapshot.dataset.files[entity].fileName;

  const tables = new Map(rawTablesOf(snapshot).map((t) => [t.entity, t]));
  const cellsOf = new Map(
    [...tables.values()].flatMap((t) => t.rows.map((r) => [r.unitId, t.header.map((h, i): [string, string] => [h, r.cells[i]!])])),
  );

  const records: RecordView[] = snapshot.records.map((r) => ({
    unitId: r.unitId,
    key: keyOf(r, fileOf(r.entity)),
    entity: r.entity,
    fileName: fileOf(r.entity),
    lineNo: r.lineNo,
    propertyId: r.propertyId,
    status: r.status,
    statusRules: [...r.ruleIds],
    amount: money(r.amount),
    fields: cellsOf.get(r.unitId)!,
    checks: q.checks.get(r.unitId)!.map((c): CheckView => {
      const { outcome } = c.result;
      if (outcome === "pass") return { ruleId: c.ruleId, outcome };
      const text = describe(c.ruleId, c.result) ?? "";
      if (outcome !== "fail") return { ruleId: c.ruleId, outcome, text };
      return { ruleId: c.ruleId, outcome, action: c.action, text, related: [...(c.result.relatedKeys ?? [])] };
    }),
  }));

  const held = q.held.reduce((s, p) => s + (p.amount?.currency === "IDR" ? p.amount.amount : 0n), 0n);

  return {
    asOf: snapshot.asOf,
    asOfDefaulted: snapshot.asOfDefaulted,
    sourceLabel: snapshot.source.label,
    runStatus: snapshot.report.status,
    runFailures: snapshot.report.summary.failures.map((f) => `${f.ruleId}: ${f.message}`),
    counts: { ...q.counts },
    rules: q.rules.map((r) => ({
      id: r.id,
      title: r.title,
      action: r.action,
      entities: [...r.entities],
      engine: r.engine,
      outcomes: { ...r.outcomes },
      failsByAction: { ...r.failsByAction },
      amount: toView(r.amount),
    })),
    files: q.files.map((f) => ({
      entity: f.entity,
      fileName: f.fileName,
      rowCount: f.rowCount,
      rows: { ...f.rows },
      rowsInFigures: f.rowsInFigures,
      amountColumn: f.amountColumn,
      amounts: f.amounts.map((a) => ({
        currency: a.currency,
        source: moneyDigits(a.source),
        inFigures: moneyDigits(a.inFigures),
        excluded: moneyDigits(a.byStatus.excluded),
        duplicate: moneyDigits(a.byStatus.duplicate),
      })),
      unsummed: f.unsummed,
      control: f.control,
      balanced: f.balanced,
    })),
    issues: q.issues.map((i) => ({
      ruleId: i.ruleId,
      action: i.action,
      unitId: i.record.unitId,
      key: keyOf(i.record, fileOf(i.record.entity)),
      entity: i.record.entity,
      propertyId: i.record.propertyId,
      status: i.record.status,
      text: describe(i.ruleId, i.result)!,
      amount: i.result.amountIdr === undefined ? null : idrFull(i.result.amountIdr),
    })),
    excluded: q.excluded.map((e) => ({
      unitId: e.record.unitId,
      key: keyOf(e.record, e.fileName),
      fileName: e.fileName,
      lineNo: e.record.lineNo,
      propertyId: e.record.propertyId,
      status: e.record.status,
      rules: e.causes.map((c) => c.ruleId),
      reason: e.causes.map((c) => describe(c.ruleId, c.result)).join("; "),
      amount: money(e.record.amount),
    })),
    villas: q.villas.map((v) => ({
      propertyId: v.propertyId,
      name: v.name,
      cluster: v.cluster,
      cases: v.cases.map((c) => ({
        caseKey: c.caseKey,
        type: c.type,
        kinds: [...c.kinds],
        hasModified: c.hasModified,
        from: c.from,
        to: c.to,
        pairs: c.pairs,
        maxPerNight: c.maxPerNight,
        gross: c.gross === null ? null : c.gross.currency === "IDR" ? idrCompact(toView(c.gross)) : moneyFull(c.gross),
        rows: c.rows.map((r) => ({
          unitId: r.record.unitId,
          key: keyOf(r.record, fileOf(r.record.entity)),
          reservationStatus: r.reservationStatus,
          channel: r.channel,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          nights: r.nights,
          gross: money(r.record.amount),
          paid: money(r.paid),
          paymentIds: [...r.paymentIds],
          flags: [...r.flags],
          overlaps: r.overlaps.map((o) => ({ with: o.with, nights: o.nights, kind: o.kind })),
        })),
      })),
    })),
    caseCount: q.caseCount,
    caseReservations: q.villas.reduce((n, v) => n + v.cases.reduce((m, c) => m + c.rows.length, 0), 0),
    heldPayments: q.held.length,
    heldAmount: idrFull(held),
    records,
  };
}
