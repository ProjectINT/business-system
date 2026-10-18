// The data-quality page (PLAN.md 8, page 3; ROADMAP.md phase 5): the run's journal read per rule,
// per file, per row and per case. Facts only — counts, amounts, dates, keys; the words are the UI's,
// as for every rule result (VALIDATION_PLAN.md 3: details are facts, the UI builds the message).
//
// Level 1 has no decisions: a case is listed with its reservations, nobody resolves it here
// (VALIDATION_PLAN.md 7.5, «Уровень 1»). `duplicate` and `excluded` are the system's final say and
// are reported as «excluded automatically» (VALIDATION_PLAN.md 2, «Кто решает»).
import { add, eachNight, nightsBetween, SCALE, zero, type CalendarDate, type Currency, type Money } from "../calc";
import { buildCases, type Action, type Case, type JournalResult, type Outcome, type RowEntity, type RuleId, type Status } from "../dq";
import { ENTITIES } from "../ingest";
import { calcStatus } from "./admit";
import { BASE_CURRENCY } from "./filters";
import type { RecordInfo, RuleInfo, Snapshot } from "./types";

const STATUSES: readonly Status[] = ["clean", "review", "pending", "excluded", "duplicate", "superseded"];

/** In the figures at level 1: clean, and with a flag review and pending (admit.ts). */
export const IN_FIGURES: readonly Status[] = ["clean", "review", "pending"];

const OUTCOMES: readonly Outcome[] = ["pass", "fail", "skip", "error"];

/** Rules that make a case; the other failed rules of a case row are its flags. */
const CASE_RULES: ReadonlySet<RuleId> = new Set(["DQ-02", "DQ-12", "DQ-13"]);

// ── per rule ────────────────────────────────────────────────────────────────

export interface RuleSummary extends RuleInfo {
  readonly outcomes: Readonly<Record<Outcome, number>>;
  /** Failed units by the action each fail carried: DQ-05 excludes some payments and holds others. */
  readonly failsByAction: Readonly<Partial<Record<Action, number>>>;
  /** Σ `amountIdr` of the fails: what is in question, in the rule's own terms (GBV, payment, OTA fee, shortfall). */
  readonly amount: Money;
}

// ── per file ────────────────────────────────────────────────────────────────

export interface AmountTotals {
  readonly currency: Currency;
  /** The file's amount column over every row. */
  readonly source: Money;
  readonly byStatus: Readonly<Record<Status, Money>>;
  readonly inFigures: Money;
}

/** Control totals of a file (PLAN.md 5.2): source = in the figures + excluded + duplicates, by rows and by amount. */
export interface FileTotals {
  readonly entity: RowEntity;
  readonly fileName: string;
  /** Data rows the loader read from the file. */
  readonly rowCount: number;
  readonly rows: Readonly<Record<Status, number>>;
  readonly rowsInFigures: number;
  /** GBV, payment or expense amount; `null` for the reference files. */
  readonly amountColumn: string | null;
  /** Per currency, the base currency first. */
  readonly amounts: readonly AmountTotals[];
  /** Rows whose amount did not parse or is in an unknown currency: counted above, not summed. */
  readonly unsummed: number;
  /** DQ-90 on the file; `null` when it did not run. */
  readonly control: Outcome | null;
  /**
   * Rows by status add up to the rows the loader read and DQ-90 passed. Amounts add up by
   * construction — each row is summed once, under its status; the test recomputes them from the files.
   */
  readonly balanced: boolean;
}

// ── per row ─────────────────────────────────────────────────────────────────

/** A rule's result on a row, with the action of a `fail` resolved (the result's own, else the rule's). */
export interface RecordCheck {
  readonly ruleId: RuleId;
  readonly action: Action;
  readonly result: JournalResult;
}

/** A failed check: one row of the list of problems. */
export interface Issue extends RecordCheck {
  readonly record: RecordInfo;
}

export interface ExcludedRow {
  readonly record: RecordInfo;
  readonly fileName: string;
  /** Results of the rules that set the status. */
  readonly causes: readonly RecordCheck[];
}

// ── per case ────────────────────────────────────────────────────────────────

export interface CaseOverlap {
  readonly with: string;
  readonly from: CalendarDate;
  readonly to: CalendarDate;
  readonly nights: number;
  readonly kind: "same_dates" | "modified_version" | "partial";
}

export interface CaseRow {
  readonly record: RecordInfo;
  /** Reservation fields; `null` on a version case of another entity. */
  readonly reservationStatus: string | null;
  readonly channel: string | null;
  readonly checkIn: CalendarDate | null;
  readonly checkOut: CalendarDate | null;
  readonly nights: number | null;
  /** Payments of the reservation that count (not excluded or duplicate): they wait with it. */
  readonly paymentIds: readonly string[];
  /** Their sum; `null` without payments. */
  readonly paid: Money | null;
  readonly overlaps: readonly CaseOverlap[];
  /** Other rules that failed on the row: DQ-08, DQ-16… */
  readonly flags: readonly RuleId[];
}

export interface CaseView extends Omit<Case, "propertyId"> {
  /** A version case has no villa of its own: the villa of its rows. */
  readonly propertyId: string;
  /** Stays of the case: first check-in, last check-out; `null` when no row has both dates. */
  readonly from: CalendarDate | null;
  readonly to: CalendarDate | null;
  readonly pairs: number;
  /** Most reservations on one night. */
  readonly maxPerNight: number;
  /** Σ GBV of the rows (one villa, one currency); `null` for a case without amounts. */
  readonly gross: Money | null;
  /** By check-in, then key. */
  readonly rows: readonly CaseRow[];
}

export interface VillaCases {
  readonly propertyId: string;
  readonly name: string | null;
  readonly cluster: string | null;
  readonly cases: readonly CaseView[];
}

export interface Quality {
  readonly counts: Readonly<Record<Status, number>>;
  readonly rules: readonly RuleSummary[];
  readonly files: readonly FileTotals[];
  readonly excluded: readonly ExcludedRow[];
  /** Every failed check on a row, in run order of the rules, then by unit id. */
  readonly issues: readonly Issue[];
  readonly villas: readonly VillaCases[];
  readonly caseCount: number;
  /** Payments waiting for the decision on their reservation (DQ-05 `hold`). */
  readonly held: readonly RecordInfo[];
  /** Every result of every rule, by unit id, in run order. */
  readonly checks: ReadonlyMap<string, readonly RecordCheck[]>;
}

// ── building ────────────────────────────────────────────────────────────────

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byStatus<T>(value: () => T): Record<Status, T> {
  return Object.fromEntries(STATUSES.map((s) => [s, value()])) as Record<Status, T>;
}

/** Σ of amounts in one currency; `null` for none. */
function sumOf(list: readonly Money[]): Money | null {
  return list.length === 0 ? null : list.slice(1).reduce(add, list[0]!);
}

function present(list: readonly (Money | null)[]): Money[] {
  return list.filter((m): m is Money => m !== null);
}

function checksOf(snapshot: Snapshot): Map<string, RecordCheck[]> {
  const out = new Map<string, RecordCheck[]>();
  for (const rule of snapshot.rules) {
    for (const result of snapshot.report.results.get(rule.id)!) {
      const list = out.get(result.unitId) ?? [];
      list.push({ ruleId: rule.id, action: result.action ?? rule.action, result });
      out.set(result.unitId, list);
    }
  }
  return out;
}

function ruleSummaries(snapshot: Snapshot, checks: ReadonlyMap<string, readonly RecordCheck[]>): RuleSummary[] {
  const summaries = new Map(
    snapshot.rules.map((r) => [
      r.id,
      {
        ...r,
        outcomes: Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>,
        failsByAction: {} as Partial<Record<Action, number>>,
        amount: zero(BASE_CURRENCY),
      },
    ]),
  );
  for (const list of checks.values()) {
    for (const c of list) {
      const s = summaries.get(c.ruleId)!;
      s.outcomes[c.result.outcome] += 1;
      if (c.result.outcome !== "fail") continue;
      s.failsByAction[c.action] = (s.failsByAction[c.action] ?? 0) + 1;
      if (c.result.amountIdr !== undefined) s.amount = add(s.amount, { amount: c.result.amountIdr, currency: BASE_CURRENCY });
    }
  }
  return [...summaries.values()];
}

const AMOUNT_COLUMN: Readonly<Partial<Record<RowEntity, string>>> = {
  reservation: "gross_booking_value",
  payment: "amount",
  expense: "amount",
};

/** Currencies in the order the page lists them: the base one first. */
const CURRENCIES: readonly Currency[] = [BASE_CURRENCY, ...(Object.keys(SCALE) as Currency[]).filter((c) => c !== BASE_CURRENCY)];

function fileTotals(snapshot: Snapshot, checks: ReadonlyMap<string, readonly RecordCheck[]>): FileTotals[] {
  return ENTITIES.map((entity) => {
    const file = snapshot.dataset.files[entity];
    const records = snapshot.records.filter((r) => r.entity === entity);
    const rows = byStatus(() => 0);
    for (const r of records) rows[r.status] += 1;

    const amountColumn = AMOUNT_COLUMN[entity] ?? null;
    const summed = amountColumn === null ? [] : records.filter((r) => r.amount !== null);
    const amounts: AmountTotals[] = CURRENCIES.flatMap((currency) => {
      const mine = summed.filter((r) => r.amount!.currency === currency);
      if (mine.length === 0) return [];
      const total = byStatus(() => zero(currency));
      for (const r of mine) total[r.status] = add(total[r.status], r.amount!);
      return [
        {
          currency,
          source: mine.reduce((m, r) => add(m, r.amount!), zero(currency)),
          byStatus: total,
          inFigures: IN_FIGURES.reduce((m, s) => add(m, total[s]), zero(currency)),
        },
      ];
    });

    const dq90 = (checks.get(file.fileName) ?? []).find((c) => c.ruleId === "DQ-90");
    const control = dq90 === undefined ? null : dq90.result.outcome;
    return {
      entity,
      fileName: file.fileName,
      rowCount: file.rowCount,
      rows,
      rowsInFigures: IN_FIGURES.reduce((n, s) => n + rows[s], 0),
      amountColumn,
      amounts,
      unsummed: amountColumn === null ? 0 : records.length - summed.length,
      control,
      balanced: STATUSES.reduce((n, s) => n + rows[s], 0) === file.rowCount && control === "pass",
    };
  });
}

const PRIORITY = (c: Case): number =>
  c.type === "conflict" ? (c.kinds.includes("same_dates") ? 0 : c.hasModified ? 1 : 2) : c.type === "modification" ? 3 : 4;

/** Review order (VALIDATION_PLAN.md 7.5): same dates → with a modified booking → partial → lone modified → versions; then by date. */
function compareCases(a: CaseView, b: CaseView): number {
  return PRIORITY(a) - PRIORITY(b) || byText(a.from ?? "", b.from ?? "") || byText(a.caseKey, b.caseKey);
}

/** Most stays on one night. */
function busiestNight(stays: readonly { readonly checkIn: CalendarDate; readonly checkOut: CalendarDate }[]): number {
  const perNight = new Map<CalendarDate, number>();
  for (const s of stays) for (const night of eachNight(s.checkIn, s.checkOut)) perNight.set(night, (perNight.get(night) ?? 0) + 1);
  return Math.max(0, ...perNight.values());
}

function villaCases(snapshot: Snapshot, checks: ReadonlyMap<string, readonly RecordCheck[]>): VillaCases[] {
  const recordOf = new Map(snapshot.records.map((r) => [r.unitId, r]));
  const reservationOf = new Map(snapshot.dataset.rows.reservation.map((r) => [r.unitId, r.values]));

  const payments = new Map<string, RecordInfo[]>();
  for (const p of snapshot.dataset.rows.payment) {
    const record = recordOf.get(p.unitId)!;
    const id = p.values.reservation_id;
    if (id === null || calcStatus(record.status) === null) continue;
    payments.set(id, [...(payments.get(id) ?? []), record]);
  }

  const cases: CaseView[] = buildCases(snapshot.report).map((c) => {
    const rows: CaseRow[] = c.unitIds.map((unitId) => {
      const record = recordOf.get(unitId)!;
      const v = reservationOf.get(unitId);
      const overlap = checks.get(unitId)!.find((x) => x.ruleId === "DQ-12" && x.result.outcome === "fail");
      const mine = v === undefined ? [] : (payments.get(v.reservation_id!) ?? []);
      // A row waiting for a decision passed DQ-03: every value of a reservation parsed.
      return {
        record,
        reservationStatus: v === undefined ? null : v.status,
        channel: v === undefined ? null : v.channel,
        checkIn: v === undefined ? null : v.check_in,
        checkOut: v === undefined ? null : v.check_out,
        nights: v === undefined ? null : nightsBetween(v.check_in!, v.check_out!),
        paymentIds: mine.map((p) => p.recordKey!).sort(),
        paid: sumOf(present(mine.map((p) => p.amount))),
        overlaps: overlap === undefined ? [] : (overlap.result.details as { pairs: readonly CaseOverlap[] }).pairs,
        flags: record.failed.map((f) => f.ruleId).filter((id) => !CASE_RULES.has(id)),
      };
    });
    rows.sort((a, b) => byText(a.checkIn ?? "", b.checkIn ?? "") || byText(a.record.unitId, b.record.unitId));
    const stays = rows.flatMap((r) => (r.checkIn === null ? [] : [{ checkIn: r.checkIn, checkOut: r.checkOut! }]));
    return {
      ...c,
      // Every row of a case passed DQ-03, so its villa parsed.
      propertyId: c.propertyId ?? rows[0]!.record.propertyId!,
      from: stays.map((s) => s.checkIn).sort()[0] ?? null,
      to: stays.map((s) => s.checkOut).sort().at(-1) ?? null,
      pairs: rows.reduce((n, r) => n + r.overlaps.length, 0) / 2,
      maxPerNight: busiestNight(stays),
      gross: sumOf(present(rows.map((r) => r.record.amount))),
      rows,
    };
  });

  const info = new Map(snapshot.properties.map((p) => [p.propertyId, p]));
  const villas = new Map<string, CaseView[]>();
  for (const c of cases) villas.set(c.propertyId, [...(villas.get(c.propertyId) ?? []), c]);
  return [...villas.entries()]
    .sort(([a], [b]) => byText(a, b))
    .map(([propertyId, list]) => {
      // A row of a case passed DQ-04, so its villa is among the properties in force.
      const { name, cluster } = info.get(propertyId)!;
      return { propertyId, name, cluster, cases: list.sort(compareCases) };
    });
}

const cache = new WeakMap<Snapshot, Quality>();

/** Built once per snapshot: the page and the overview card read the same object. */
export function qualityOf(snapshot: Snapshot): Quality {
  const cached = cache.get(snapshot);
  if (cached !== undefined) return cached;

  const checks = checksOf(snapshot);
  const { records } = snapshot;
  const order = new Map(snapshot.rules.map((r, i) => [r.id, i]));
  const issues: Issue[] = records
    .flatMap((record) => checks.get(record.unitId)!.filter((c) => c.result.outcome === "fail").map((c) => ({ ...c, record })))
    .sort((a, b) => order.get(a.ruleId)! - order.get(b.ruleId)! || byText(a.record.unitId, b.record.unitId));

  const excluded: ExcludedRow[] = records
    .filter((r) => r.status === "excluded" || r.status === "duplicate")
    .map((record) => ({
      record,
      fileName: snapshot.dataset.files[record.entity].fileName,
      causes: checks.get(record.unitId)!.filter((c) => record.ruleIds.includes(c.ruleId)),
    }));

  const villas = villaCases(snapshot, checks);
  const quality: Quality = {
    counts: snapshot.report.summary.counts,
    rules: ruleSummaries(snapshot, checks),
    files: fileTotals(snapshot, checks),
    excluded,
    issues,
    villas,
    caseCount: villas.reduce((n, v) => n + v.cases.length, 0),
    held: records.filter((r) => r.failed.some((f) => f.ruleId === "DQ-05" && f.action === "hold")),
    checks,
  };
  cache.set(snapshot, quality);
  return quality;
}
