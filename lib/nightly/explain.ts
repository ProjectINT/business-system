// The model of the /events page (docs/EVENTS_VISUALIZATION_PLAN.md, 4): the same calculation as runCase,
// laid out for a person — the fate of every row of the input, every reservation with its night lines,
// the records behind every figure, the control totals, the open disputes with what each choice would
// change, and the decisions applied.
//
// Nothing here decides anew: selectSnapshots and buildReport compute, this file only sorts their result
// by the rows of the input — which copy is a duplicate, which version was replaced — comparing contents
// with snapshots.ts's contentKey. The tests tie the model to the report: the parts of every figure add up
// to it, the fates of the rows agree with `dedup`, the report equals runCase. Not exported from index.ts:
// the CLI and the nightly:pack archive do not change.
import { idr, type Money } from "../calc";
import {
  applyDecisions,
  contentOf,
  disputesOf,
  groupRows,
  inputOf,
  pickIn,
  rowsOf,
  type Applied,
  type Decision,
  type Dispute,
  type Rows,
} from "./decisions";
import { buildReport, type Metrics, type Report } from "./report";
import { parseCase, type CaseInput, type CommissionRule, type Payment, type Property, type ReservationEvent } from "./schema";
import { compareStrings, selectSnapshots, type Snapshots } from "./snapshots";
import type { ExceptionCode } from "./types";

/** What became of a row of reservation_events. */
export type EventFate =
  /** The snapshot of its reservation; `in_figures` false — the reservation is held (checks, rules). */
  | { readonly kind: "selected"; readonly in_figures: boolean }
  /** An exact copy of the row `of` (ТЗ 9). */
  | { readonly kind: "duplicate"; readonly of: number }
  /** Replaced by a later version (ТЗ 10): `by` — the snapshot, null when the latest versions are in dispute. */
  | { readonly kind: "superseded"; readonly by: string | null }
  /** One of the records of an open dispute. */
  | { readonly kind: "candidate"; readonly code: "AMBIGUOUS_VERSION" | "CONFLICTING_EVENT"; readonly case_key: string }
  /** A version of a reservation held by a conflicting event elsewhere in its feed. */
  | { readonly kind: "blocked" }
  /** Not picked by a person's decision on `case_key`. */
  | { readonly kind: "rejected"; readonly case_key: string };

/** What became of a row of payments. */
export type PaymentFate =
  /** Received for an accepted reservation; `counted` false — payment_date outside report_months. */
  | { readonly kind: "received"; readonly property_id: string; readonly month: string; readonly counted: boolean }
  | { readonly kind: "held"; readonly code: ExceptionCode }
  | { readonly kind: "unmatched" }
  | { readonly kind: "duplicate"; readonly of: number }
  | { readonly kind: "conflicting"; readonly case_key: string }
  | { readonly kind: "rejected"; readonly case_key: string };

type Amounts<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]: Money };

export type EventView = Amounts<Omit<ReservationEvent, "updated_at">, "accommodation_gross_idr" | "pbjt_idr" | "ota_fee_idr"> & {
  readonly row: number;
  /** ISO 8601, UTC. */
  readonly updated_at: string;
  /** Fingerprint of the content without source_event_id: equal — the same version. */
  readonly content: string;
  readonly fate: EventFate;
};

export type PaymentView = Amounts<Payment, "amount_idr"> & {
  readonly row: number;
  readonly content: string;
  readonly fate: PaymentFate;
};

/** A night of an accepted reservation, as fees.ts computed it. */
export interface NightView {
  readonly night: string;
  readonly month: string;
  /** The month is one of report_months: the night is in the figures. */
  readonly in_window: boolean;
  readonly accommodation_gross_idr: Money;
  readonly pbjt_idr: Money;
  readonly ota_fee_idr: Money;
  readonly rate_bps: number;
  readonly management_fee_idr: Money;
  /** Index of the night's rule in `rules`. */
  readonly rule: number;
}

export interface ReservationView {
  readonly reservation_id: string;
  /** Of the snapshot, else of the latest row naming the reservation. */
  readonly property_id: string;
  readonly hold: boolean;
  readonly selected: string | null;
  readonly superseded: readonly string[];
  /** Every row of reservation_events naming it, whatever its fate. */
  readonly rows: readonly number[];
  /** Every row of payments naming it. */
  readonly payments: readonly number[];
  /** Empty when held. */
  readonly nights: readonly NightView[];
  readonly codes: readonly ExceptionCode[];
}

export type NightRef = NightView & { readonly reservation_id: string };

export interface PaymentRef {
  readonly row: number;
  readonly payment_id: string;
  readonly reservation_id: string;
  readonly payment_date: string;
  readonly amount_idr: Money;
}

/**
 * The records behind one cell of the report: a villa's month (by_property), a month (monthly,
 * property_id null) or the period (total, both null). The night amounts add up to accommodation,
 * PBJT, OTA fee and management fee; the payments to cash received; owner estimate is a formula of the cell.
 */
export interface CellSources {
  readonly property_id: string | null;
  readonly month: string | null;
  readonly nights: readonly NightRef[];
  readonly payments: readonly PaymentRef[];
}

export type MoneyKind = "received" | "outside" | "held" | "unmatched" | "duplicate" | "conflicting" | "rejected";

export interface Controls {
  /** rows = selected + superseded + duplicate + candidate + blocked + rejected. */
  readonly events: {
    readonly rows: number;
    readonly selected: number;
    readonly superseded: number;
    readonly duplicate: number;
    readonly candidate: number;
    readonly blocked: number;
    readonly rejected: number;
    readonly bookings: number;
    readonly held_bookings: number;
    readonly in_figures: number;
    /** Nights of accepted reservations inside report_months. */
    readonly nights: number;
  };
  /** amount = the sum of the kinds: every rupiah of the file is somewhere. */
  readonly payments: {
    readonly rows: number;
    readonly amount: Money;
    readonly kinds: Readonly<Record<MoneyKind, { readonly rows: number; readonly amount: Money }>>;
  };
}

export const METRIC_KEYS = [
  "accommodation_gross_idr",
  "pbjt_liability_idr",
  "ota_fee_idr",
  "management_fee_idr",
  "owner_estimate_idr",
  "cash_received_idr",
] as const satisfies readonly (keyof Metrics)[];

export type Bucket = "received" | "held" | "unmatched" | "none";

/** What one choice of a dispute would change, against the figures as they are now. */
export interface Option {
  readonly pick: string;
  /** Non-zero changes of the villa × month cells. */
  readonly changes: readonly { readonly property_id: string; readonly month: string; readonly metric: keyof Metrics; readonly delta: Money }[];
  readonly held: Money;
  readonly unmatched: Money;
  /** Payments whose money would move: `none` — a conflicting payment, in no sum. */
  readonly moved: readonly { readonly payment_id: string; readonly from: Bucket; readonly to: Bucket }[];
  /** Disputes the choice would open. */
  readonly opens: readonly string[];
}

export type DisputeView = Dispute & { readonly options: readonly Option[] };

export interface Explanation {
  readonly case_id: string;
  readonly report_months: readonly string[];
  readonly properties: readonly Property[];
  readonly rules: readonly CommissionRule[];
  /** With the decisions applied. */
  readonly report: Report;
  /** Without decisions: what the CLI prints. */
  readonly as_computed: Report;
  readonly events: readonly EventView[];
  readonly payments: readonly PaymentView[];
  readonly reservations: readonly ReservationView[];
  readonly cells: readonly CellSources[];
  readonly controls: Controls;
  readonly disputes: readonly DisputeView[];
  readonly applied: readonly Applied[];
  readonly stale: readonly Decision[];
}

interface Run {
  readonly snapshots: Snapshots;
  readonly report: Report;
}

function run(input: CaseInput, rows: Rows): Run {
  const filtered = inputOf(input, rows);
  const snapshots = selectSnapshots(filtered);
  return { snapshots, report: buildReport(filtered, snapshots) };
}

function codesByRecord(report: Report, type: "reservation" | "payment"): Map<string, ExceptionCode[]> {
  const out = new Map<string, ExceptionCode[]>();
  for (const e of report.exceptions) if (e.record_type === type) out.set(e.record_id, [...(out.get(e.record_id) ?? []), e.code]);
  return out;
}

function eventFates(rows: Rows, { snapshots, report }: Run): Map<number, EventFate> {
  const fates = new Map<number, EventFate>();
  const reservationOf = new Map(snapshots.reservations.map((r) => [r.reservation_id, r]));
  const codes = codesByRecord(report, "reservation");
  for (const [id, copies] of groupRows(rows.events, (e) => e.source_event_id)) {
    if (new Set(copies.map((c) => contentOf(c.record))).size > 1) {
      for (const c of copies) fates.set(c.row, { kind: "candidate", code: "CONFLICTING_EVENT", case_key: `event:${id}` });
      continue;
    }
    const [first, ...rest] = copies as [(typeof copies)[number], ...typeof copies];
    for (const c of rest) fates.set(c.row, { kind: "duplicate", of: first.row });
    const r = reservationOf.get(first.record.reservation_id)!; // every version's reservation is decided
    let fate: EventFate;
    if (r.snapshot?.source_event_id === id) fate = { kind: "selected", in_figures: !r.hold };
    else if (r.superseded.includes(id)) fate = { kind: "superseded", by: r.snapshot?.source_event_id ?? null };
    else if (codes.get(r.reservation_id)?.includes("AMBIGUOUS_VERSION") === true)
      fate = { kind: "candidate", code: "AMBIGUOUS_VERSION", case_key: `version:${r.reservation_id}` };
    else fate = { kind: "blocked" };
    fates.set(first.row, fate);
  }
  return fates;
}

function paymentFates(input: CaseInput, rows: Rows, { snapshots, report }: Run): Map<number, PaymentFate> {
  const fates = new Map<number, PaymentFate>();
  const months = new Set(input.report_months);
  const decisionOf = new Map(snapshots.payments.map((p) => [p.payment.payment_id, p]));
  const codes = codesByRecord(report, "payment");
  for (const [id, copies] of groupRows(rows.payments, (p) => p.payment_id)) {
    if (new Set(copies.map((c) => contentOf(c.record))).size > 1) {
      for (const c of copies) fates.set(c.row, { kind: "conflicting", case_key: `payment:${id}` });
      continue;
    }
    const [first, ...rest] = copies as [(typeof copies)[number], ...typeof copies];
    for (const c of rest) fates.set(c.row, { kind: "duplicate", of: first.row });
    const p = decisionOf.get(id)!; // a payment without conflicting copies is placed in a bucket
    const month = p.payment.payment_date.slice(0, 7);
    fates.set(
      first.row,
      p.bucket === "received"
        ? { kind: "received", property_id: p.property_id, month, counted: months.has(month) }
        : p.bucket === "held"
          ? { kind: "held", code: codes.get(id)![0]! } // a held payment has exactly one code
          : { kind: "unmatched" },
    );
  }
  return fates;
}

/** The rule in force on the night: an accepted reservation has exactly one on each night. */
function ruleIndex(rules: readonly CommissionRule[], property_id: string, night: string): number {
  return rules.findIndex(
    (r) => r.property_id === property_id && r.effective_from <= night && (r.effective_to === null || night <= r.effective_to),
  );
}

function reservationsOf(input: CaseInput, all: Rows, { snapshots, report }: Run): ReservationView[] {
  const months = new Set(input.report_months);
  const codes = codesByRecord(report, "reservation");
  return snapshots.reservations.map((r) => {
    const rows = all.events.filter((e) => e.record.reservation_id === r.reservation_id);
    const latest = rows.reduce((a, b) => (b.record.updated_at > a.record.updated_at ? b : a));
    const property_id = r.snapshot?.property_id ?? latest.record.property_id;
    return {
      reservation_id: r.reservation_id,
      property_id,
      hold: r.hold,
      selected: r.snapshot?.source_event_id ?? null,
      superseded: r.superseded,
      rows: rows.map((e) => e.row),
      payments: all.payments.filter((p) => p.record.reservation_id === r.reservation_id).map((p) => p.row),
      nights: r.hold
        ? []
        : r.nights.map((n) => ({
            night: n.night,
            month: n.month,
            in_window: months.has(n.month),
            accommodation_gross_idr: idr(n.accommodation_gross_idr),
            pbjt_idr: idr(n.pbjt_idr),
            ota_fee_idr: idr(n.ota_fee_idr),
            rate_bps: n.rate_bps,
            management_fee_idr: idr(n.management_fee_idr),
            rule: ruleIndex(input.commission_rules, property_id, n.night),
          })),
      codes: codes.get(r.reservation_id) ?? [],
    };
  });
}

function cellsOf(input: CaseInput, reservations: readonly ReservationView[], payments: readonly PaymentView[]): CellSources[] {
  const months = [...input.report_months].sort(compareStrings);
  const villas = input.properties.map((p) => p.property_id).sort(compareStrings);
  // Each part with the cell it belongs to.
  const nights = reservations.flatMap((r) =>
    r.nights
      .filter((n) => n.in_window)
      .map((n) => ({ property_id: r.property_id, month: n.month, ref: { ...n, reservation_id: r.reservation_id } })),
  );
  const received = payments.flatMap((p) =>
    p.fate.kind === "received" && p.fate.counted
      ? [
          {
            property_id: p.fate.property_id,
            month: p.fate.month,
            ref: { row: p.row, payment_id: p.payment_id, reservation_id: p.reservation_id, payment_date: p.payment_date, amount_idr: p.amount_idr },
          },
        ]
      : [],
  );
  const cell = (property_id: string | null, month: string | null): CellSources => {
    const keep = (x: { property_id: string; month: string }) =>
      (property_id === null || x.property_id === property_id) && (month === null || x.month === month);
    return { property_id, month, nights: nights.filter(keep).map((x) => x.ref), payments: received.filter(keep).map((x) => x.ref) };
  };
  return [
    ...villas.flatMap((v) => months.map((m) => cell(v, m))),
    ...months.map((m) => cell(null, m)),
    cell(null, null),
  ];
}

function controlsOf(events: readonly EventView[], payments: readonly PaymentView[], reservations: readonly ReservationView[]): Controls {
  const countOf = (kind: EventFate["kind"]) => events.filter((e) => e.fate.kind === kind).length;
  const kindOf = (f: PaymentFate): MoneyKind => (f.kind === "received" ? (f.counted ? "received" : "outside") : f.kind);
  const kinds = Object.fromEntries(
    (["received", "outside", "held", "unmatched", "duplicate", "conflicting", "rejected"] as const).map((k) => {
      const rows = payments.filter((p) => kindOf(p.fate) === k);
      return [k, { rows: rows.length, amount: idr(rows.reduce((n, p) => n + p.amount_idr.amount, 0n)) }];
    }),
  ) as Record<MoneyKind, { rows: number; amount: Money }>;
  return {
    events: {
      rows: events.length,
      selected: countOf("selected"),
      superseded: countOf("superseded"),
      duplicate: countOf("duplicate"),
      candidate: countOf("candidate"),
      blocked: countOf("blocked"),
      rejected: countOf("rejected"),
      bookings: reservations.length,
      held_bookings: reservations.filter((r) => r.hold).length,
      in_figures: reservations.filter((r) => !r.hold).length,
      nights: reservations.reduce((n, r) => n + r.nights.filter((x) => x.in_window).length, 0),
    },
    payments: { rows: payments.length, amount: idr(payments.reduce((n, p) => n + p.amount_idr.amount, 0n)), kinds },
  };
}

function bucketsOf(rows: Rows, snapshots: Snapshots): Map<string, Bucket> {
  const placed = new Map<string, Bucket>(snapshots.payments.map((p) => [p.payment.payment_id, p.bucket]));
  const ids = [...new Set(rows.payments.map((p) => p.record.payment_id))].sort(compareStrings);
  return new Map(ids.map((id) => [id, placed.get(id) ?? "none"]));
}

/** Each candidate of a dispute against the figures as they are: what picking it would change. */
function optionsOf(input: CaseInput, rows: Rows, now: Run, d: Dispute, open: readonly Dispute[]): Option[] {
  const before = bucketsOf(rows, now.snapshots);
  return d.candidates.map((c) => {
    const next = pickIn(rows, d, c.key);
    const after = run(input, next.rows);
    const changes: Option["changes"][number][] = [];
    for (const [property_id, monthsOf] of Object.entries(now.report.by_property)) {
      for (const [month, m] of Object.entries(monthsOf)) {
        const a = after.report.by_property[property_id]![month]!; // the same villas and months
        for (const metric of METRIC_KEYS) {
          const delta = a[metric].amount - m[metric].amount;
          if (delta !== 0n) changes.push({ property_id, month, metric, delta: idr(delta) });
        }
      }
    }
    const afterBuckets = bucketsOf(next.rows, after.snapshots);
    const moved = [...before]
      .map(([payment_id, from]) => ({ payment_id, from, to: afterBuckets.get(payment_id)! })) // a pick keeps one copy of every payment
      .filter((m) => m.from !== m.to);
    const known = new Set(open.map((x) => x.case_key));
    return {
      pick: c.key,
      changes,
      held: idr(after.report.cash_held_idr.amount - now.report.cash_held_idr.amount),
      unmatched: idr(after.report.cash_unmatched_idr.amount - now.report.cash_unmatched_idr.amount),
      moved,
      opens: disputesOf(next.rows)
        .map((x) => x.case_key)
        .filter((k) => !known.has(k)),
    };
  });
}

/**
 * A case file (parsed JSON of unknown shape) and the decisions, in order → the model of the page.
 * Throws ZodError on a format error, as runCase. Without decisions `report` is runCase's report.
 */
export function explainCase(raw: unknown, decisions: readonly Decision[] = []): Explanation {
  const input = parseCase(raw);
  const all = rowsOf(input);
  const { rows, applied, stale } = applyDecisions(all, decisions);
  const now = run(input, rows);

  const rejected = new Map<string, string>(); // "event:3" / "payment:1" → case_key
  for (const a of applied) {
    const kind = a.decision.case_key.startsWith("payment:") ? "payment" : "event";
    for (const row of a.removed) rejected.set(`${kind}:${row}`, a.decision.case_key);
  }
  const eFates = eventFates(rows, now);
  const pFates = paymentFates(input, rows, now);

  const events: EventView[] = all.events.map(({ row, record }) => {
    const case_key = rejected.get(`event:${row}`);
    return {
      ...record,
      row,
      updated_at: new Date(record.updated_at).toISOString(),
      accommodation_gross_idr: idr(record.accommodation_gross_idr),
      pbjt_idr: idr(record.pbjt_idr),
      ota_fee_idr: idr(record.ota_fee_idr),
      content: contentOf(record),
      fate: case_key === undefined ? eFates.get(row)! : { kind: "rejected", case_key },
    };
  });
  const payments: PaymentView[] = all.payments.map(({ row, record }) => {
    const case_key = rejected.get(`payment:${row}`);
    return {
      ...record,
      row,
      amount_idr: idr(record.amount_idr),
      content: contentOf(record),
      fate: case_key === undefined ? pFates.get(row)! : { kind: "rejected", case_key },
    };
  });
  const reservations = reservationsOf(input, all, now);
  const open = disputesOf(rows);

  return {
    case_id: input.case_id,
    report_months: [...input.report_months].sort(compareStrings),
    properties: [...input.properties].sort((a, b) => compareStrings(a.property_id, b.property_id)),
    rules: input.commission_rules,
    report: now.report,
    as_computed: applied.length === 0 ? now.report : run(input, all).report,
    events,
    payments,
    reservations,
    cells: cellsOf(input, reservations, payments),
    controls: controlsOf(events, payments, reservations),
    disputes: open.map((d) => ({ ...d, options: optionsOf(input, rows, now, d, open) })),
    applied,
    stale,
  };
}
