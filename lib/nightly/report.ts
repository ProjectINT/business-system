// Night lines + payments → the report in the shape of final-test/output_schema.json
// (docs/FINAL_TEST_PLAN.md, 3.3).
//
// Six figures per month. Accommodation, PBJT, OTA fee and management fee are the sums of the night
// lines whose night falls in the month (ТЗ 7); owner_estimate = accommodation − ota_fee −
// management_fee (ТЗ 8), an estimate before expenses and payouts, not a payable; cash_received is
// the received payments of accepted reservations by the month of payment_date (ТЗ 7). The grid
// villa × month is the base: `monthly` is its sum over the villas and `total` the sum over the
// months, so by_property, monthly and total agree by construction.
//
// The period is report_months (plan 4.2). A night or a received payment outside it enters no figure
// and is reported once per record as OUTSIDE_REPORT_MONTHS; the nights still show in trace.
// cash_held_idr and cash_unmatched_idr are not period figures: every held or unmatched payment is in
// them whatever its date, so money we know of is not hidden (ТЗ 4 D).
//
// trace has a row for every reservation, held or not: the chosen source_event_id, the versions it
// replaced and, for an accepted one, the nights by month with the rates of those nights — more than
// one rate in a month when a rule changes inside it.
//
// Only the input decides the result: months and villas are iterated in sorted order, exceptions are
// one list by record, and formatReport sorts the keys at every level of the JSON.
import { idr, type Money, type View } from "../calc";
import type { NightLine } from "./fees";
import type { CaseInput } from "./schema";
import { compareStrings, type ReservationDecision, type Snapshots } from "./snapshots";
import type { Dedup, Exception } from "./types";

/** The six figures of a month, of the period or of a villa's month. */
export interface Metrics {
  readonly accommodation_gross_idr: Money;
  readonly pbjt_liability_idr: Money;
  readonly ota_fee_idr: Money;
  readonly management_fee_idr: Money;
  /** accommodation − ota_fee − management_fee (ТЗ 8); negative when the OTA fee exceeds the rest, nothing is clamped. */
  readonly owner_estimate_idr: Money;
  readonly cash_received_idr: Money;
}

export interface TraceMonth {
  readonly nights: number;
  /** The distinct rates of the month's nights, in night order: one unless a rule changes inside the month. */
  readonly rate_bps: readonly number[];
  readonly accommodation_gross_idr: Money;
  readonly management_fee_idr: Money;
}

export interface TraceEntry {
  /** The version used, or the one that failed the checks; null when none could be chosen. */
  readonly selected_source_event_id: string | null;
  readonly superseded_source_event_ids: readonly string[];
  readonly hold: boolean;
  /** Nights accrued: 0 for a reservation on hold. */
  readonly nights: number;
  /** Every month of the accrued nights, inside the report window or not. */
  readonly monthly: Readonly<Record<string, TraceMonth>>;
}

export interface Report {
  readonly schema_version: 1;
  readonly case_id: string;
  /** By month of report_months. */
  readonly monthly: Readonly<Record<string, Metrics>>;
  /** The sum of `monthly`. */
  readonly total: Metrics;
  /** By villa of `properties`, then by month of report_months; a villa without activity has zeros. */
  readonly by_property: Readonly<Record<string, Readonly<Record<string, Metrics>>>>;
  readonly cash_unmatched_idr: Money;
  readonly cash_held_idr: Money;
  readonly dedup: Dedup;
  /** Reservations by id, then payments by id; a record's codes in the order they were checked. */
  readonly exceptions: readonly Exception[];
  /** By reservation_id, every reservation of the input. */
  readonly trace: Readonly<Record<string, TraceEntry>>;
}

/** The report with Money → number: what runCase returns and the CLI writes. */
export type ReportView = View<Report>;

/** Running sums of one villa-month; owner_estimate is derived when the figures are read out. */
interface Cell {
  accommodation: bigint;
  pbjt: bigint;
  ota: bigint;
  fee: bigint;
  cash: bigint;
}

function emptyCell(): Cell {
  return { accommodation: 0n, pbjt: 0n, ota: 0n, fee: 0n, cash: 0n };
}

function addNight(cell: Cell, n: NightLine): void {
  cell.accommodation += n.accommodation_gross_idr;
  cell.pbjt += n.pbjt_idr;
  cell.ota += n.ota_fee_idr;
  cell.fee += n.management_fee_idr;
}

function addCell(into: Cell, from: Cell): void {
  into.accommodation += from.accommodation;
  into.pbjt += from.pbjt;
  into.ota += from.ota;
  into.fee += from.fee;
  into.cash += from.cash;
}

function metrics(c: Cell): Metrics {
  return {
    accommodation_gross_idr: idr(c.accommodation),
    pbjt_liability_idr: idr(c.pbjt),
    ota_fee_idr: idr(c.ota),
    management_fee_idr: idr(c.fee),
    owner_estimate_idr: idr(c.accommodation - c.ota - c.fee),
    cash_received_idr: idr(c.cash),
  };
}

function outsideWindow(record_type: Exception["record_type"], record_id: string): Exception {
  return { record_type, record_id, code: "OUTSIDE_REPORT_MONTHS", action: "hold" };
}

/** Reservations before payments, then by id. The sort is stable, so one record's codes keep their check order. */
function byRecord(a: Exception, b: Exception): number {
  if (a.record_type !== b.record_type) return a.record_type === "reservation" ? -1 : 1;
  return compareStrings(a.record_id, b.record_id);
}

function sumOf(lines: readonly NightLine[], key: "accommodation_gross_idr" | "management_fee_idr"): bigint {
  return lines.reduce((acc, n) => acc + n[key], 0n);
}

function traceOf(r: ReservationDecision): TraceEntry {
  const nights = r.hold ? [] : r.nights;
  const monthly: Record<string, TraceMonth> = {};
  for (const month of new Set(nights.map((n) => n.month))) {
    // Nights are chronological, so months and the rates within a month come out in night order.
    const lines = nights.filter((n) => n.month === month);
    monthly[month] = {
      nights: lines.length,
      rate_bps: [...new Set(lines.map((n) => n.rate_bps))],
      accommodation_gross_idr: idr(sumOf(lines, "accommodation_gross_idr")),
      management_fee_idr: idr(sumOf(lines, "management_fee_idr")),
    };
  }
  return {
    selected_source_event_id: r.snapshot?.source_event_id ?? null,
    superseded_source_event_ids: r.superseded,
    hold: r.hold,
    nights: nights.length,
    monthly,
  };
}

export function buildReport(input: CaseInput, snapshots: Snapshots): Report {
  const months = [...input.report_months].sort(compareStrings);
  const villas = input.properties.map((p) => p.property_id).sort(compareStrings);
  const grid = new Map(villas.map((v) => [v, new Map(months.map((m) => [m, emptyCell()]))]));
  const outside: Exception[] = [];
  const trace: Record<string, TraceEntry> = {};

  // Accruals: each night to the villa-month of its date; a night outside the window is reported, not counted.
  for (const r of snapshots.reservations) {
    trace[r.reservation_id] = traceOf(r);
    if (r.hold) continue;
    const cells = grid.get(r.snapshot.property_id)!; // an accepted snapshot passed UNKNOWN_PROPERTY
    let counted = 0;
    for (const n of r.nights) {
      const cell = cells.get(n.month);
      if (cell === undefined) continue;
      addNight(cell, n);
      counted += 1;
    }
    if (counted < r.nights.length) outside.push(outsideWindow("reservation", r.reservation_id));
  }

  // Cash: received payments to the villa-month of payment_date; held and unmatched money to its own total.
  let held = 0n;
  let unmatched = 0n;
  for (const p of snapshots.payments) {
    if (p.bucket === "received") {
      const cell = grid.get(p.property_id)!.get(p.payment.payment_date.slice(0, 7)); // the villa of an accepted reservation
      if (cell === undefined) outside.push(outsideWindow("payment", p.payment.payment_id));
      else cell.cash += p.payment.amount_idr;
    } else if (p.bucket === "held") {
      held += p.payment.amount_idr;
    } else {
      unmatched += p.payment.amount_idr;
    }
  }

  // Read out: by_property is the grid; monthly and total are its sums.
  const byMonth = new Map(months.map((m) => [m, emptyCell()]));
  const period = emptyCell();
  const by_property: Record<string, Readonly<Record<string, Metrics>>> = {};
  for (const [villa, cells] of grid) {
    const row: Record<string, Metrics> = {};
    for (const [month, cell] of cells) {
      row[month] = metrics(cell);
      addCell(byMonth.get(month)!, cell);
      addCell(period, cell);
    }
    by_property[villa] = row;
  }

  return {
    schema_version: 1,
    case_id: input.case_id,
    monthly: Object.fromEntries([...byMonth].map(([month, cell]) => [month, metrics(cell)])),
    total: metrics(period),
    by_property,
    cash_unmatched_idr: idr(unmatched),
    cash_held_idr: idr(held),
    dedup: snapshots.dedup,
    exceptions: [...snapshots.exceptions, ...outside].sort(byRecord),
    trace,
  };
}

function sortedKeys(_key: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compareStrings(a, b)));
}

/** The report as the CLI writes it: keys sorted at every level, two-space indent, final newline — the same bytes for the same input. */
export function formatReport(report: ReportView): string {
  return `${JSON.stringify(report, sortedKeys, 2)}\n`;
}
