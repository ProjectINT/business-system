// The layout of the calendar of nights (docs/EVENTS_VISUALIZATION_PLAN.md, 3.3): the day axis of the
// report months, villas with the bands of their commission rules, a row per booking with its nights or
// its held stay dates, payments on their dates, and the payments with no booking. Positions only: every
// amount comes from the model.
import type { ExceptionCode } from "@/lib/nightly";
import type { MoneyKind } from "@/lib/nightly/explain";
import { idrFull } from "@/lib/format";
import { daysOf, moneyKindOf, nightsOf, type EventRow, type Model, type PaymentRow, type Reservation } from "./view-of";

/**
 * The ordinal scale of rates: blue steps 600 → 100 of the dataviz palette, low rate darkest. Every subset
 * `rateScale` picks (1–6 rates) passes validate_palette.js --ordinal --mode dark on the card surface #18181b.
 */
export const RATE_RAMP = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"] as const;

/** Each distinct rate → its colour, spread evenly over the ramp; past six rates neighbours may share a step. */
export function rateScale(rates: readonly number[]): Map<number, string> {
  const distinct = [...new Set(rates)].sort((a, b) => a - b);
  const last = RATE_RAMP.length - 1;
  return new Map(
    distinct.map((bps, i) => [bps, RATE_RAMP[distinct.length === 1 ? 2 : Math.round((i * last) / (distinct.length - 1))]!]),
  );
}

export interface Axis {
  readonly days: readonly string[];
  readonly index: ReadonlyMap<string, number>;
  /** Indexes of the first day of every month after the first: where a boundary line goes. */
  readonly boundaries: readonly number[];
}

export function axisOf(months: readonly string[]): Axis {
  const days = daysOf(months);
  return {
    days,
    index: new Map(days.map((d, i) => [d, i])),
    boundaries: days.flatMap((d, i) => (i > 0 && d.endsWith("-01") ? [i] : [])),
  };
}

/** Consecutive days on the axis, `end` exclusive; the days off the axis are counted at its edges. */
export interface Span {
  /** null — no day on the axis. */
  readonly range: { readonly start: number; readonly end: number } | null;
  readonly before: number;
  readonly after: number;
}

export function spanOf(axis: Axis, days: readonly string[]): Span {
  const first = axis.days[0]!;
  const last = axis.days[axis.days.length - 1]!;
  const on = days.flatMap((d) => (axis.index.has(d) ? [axis.index.get(d)!] : []));
  return {
    range: on.length === 0 ? null : { start: Math.min(...on), end: Math.max(...on) + 1 },
    before: days.filter((d) => d < first).length,
    after: days.filter((d) => d > last).length,
  };
}

export interface RuleSegment {
  /** Index into `model.rules`. */
  readonly rule: number;
  readonly start: number;
  readonly end: number;
  /** Overlapping rules of a villa stack in lanes. */
  readonly lane: number;
}

export interface RuleBand {
  readonly segments: readonly RuleSegment[];
  readonly lanes: number;
  /** Rules wholly before or after the axis. */
  readonly before: readonly number[];
  readonly after: readonly number[];
}

export function ruleBandOf(axis: Axis, rules: Model["rules"], property_id: string): RuleBand {
  const first = axis.days[0]!;
  const last = axis.days[axis.days.length - 1]!;
  const before: number[] = [];
  const after: number[] = [];
  const spans: Omit<RuleSegment, "lane">[] = [];
  rules.forEach((r, rule) => {
    if (r.property_id !== property_id) return;
    if (r.effective_to !== null && r.effective_to < first) before.push(rule);
    else if (r.effective_from > last) after.push(rule);
    else
      spans.push({
        rule,
        start: r.effective_from <= first ? 0 : axis.index.get(r.effective_from)!,
        end: r.effective_to === null || r.effective_to >= last ? axis.days.length : axis.index.get(r.effective_to)! + 1,
      });
  });
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const segments = spans.map((s) => {
    let lane = laneEnds.findIndex((end) => end <= s.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = s.end;
    return { ...s, lane };
  });
  return { segments, lanes: Math.max(1, laneEnds.length), before, after };
}

/** One payment_id in a row: its copies are one mark, counted once. */
export interface PaymentMark {
  readonly payment_id: string;
  readonly reservation_id: string;
  readonly date: string;
  /** null — the date is off the axis, `side` says which edge. */
  readonly day: number | null;
  readonly side: "before" | "after" | null;
  /** Every row of payments with this id, in file order. */
  readonly rows: readonly PaymentRow[];
  /** The money kind of the copy that counts (the first one that is not a duplicate or rejected). */
  readonly kind: MoneyKind;
  /** The money arrived: received, outside the report months or unmatched. Otherwise the mark is hollow. */
  readonly filled: boolean;
  readonly codes: readonly ExceptionCode[];
}

function paymentMarks(model: Model, axis: Axis, rows: readonly PaymentRow[]): PaymentMark[] {
  const first = axis.days[0]!;
  const byId = new Map<string, PaymentRow[]>();
  for (const p of rows) byId.set(p.payment_id, [...(byId.get(p.payment_id) ?? []), p]);
  return [...byId.values()]
    .map((copies) => {
      const main = copies.find((p) => p.fate.kind !== "duplicate" && p.fate.kind !== "rejected") ?? copies[0]!;
      const kind = moneyKindOf(main);
      const day = axis.index.get(main.payment_date) ?? null;
      return {
        payment_id: main.payment_id,
        reservation_id: main.reservation_id,
        date: main.payment_date,
        day,
        side: day !== null ? null : main.payment_date < first ? ("before" as const) : ("after" as const),
        rows: copies,
        kind,
        filled: kind === "received" || kind === "outside" || kind === "unmatched",
        codes: model.report.exceptions.filter((e) => e.record_type === "payment" && e.record_id === main.payment_id).map((e) => e.code),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.payment_id.localeCompare(b.payment_id));
}

/** The stay as the calendar draws a held booking: the selected snapshot, else its latest event row. */
export function stayEventOf(model: Model, r: Reservation): EventRow | null {
  const rows = model.events.filter((e) => e.reservation_id === r.reservation_id);
  if (r.selected !== null) return rows.find((e) => e.source_event_id === r.selected) ?? null;
  return rows.reduce<EventRow | null>((a, b) => (a === null || b.updated_at >= a.updated_at ? b : a), null);
}

export interface BookingRow {
  readonly r: Reservation;
  /** The event the stay dates come from. */
  readonly stay: EventRow | null;
  /** Accepted: its nights; held: the nights of its stay dates. */
  readonly span: Span;
  /** Held with check-out not after check-in: the check-in day, drawn as a sliver. */
  readonly noNights: number | null;
  /** Superseded versions whose stay dates differ from the snapshot's. */
  readonly earlier: readonly { readonly event: EventRow; readonly span: Span }[];
  readonly payments: readonly PaymentMark[];
  /** Axis days the row draws on: its nights, its held stay. */
  readonly occupied: ReadonlySet<number>;
}

export interface VillaGroup {
  readonly property_id: string;
  /** In `properties`: a booking on another villa gets a group of its own. */
  readonly known: boolean;
  readonly rules: RuleBand;
  readonly bookings: readonly BookingRow[];
}

export interface CalendarLayout {
  readonly axis: Axis;
  readonly rates: ReadonlyMap<number, string>;
  readonly villas: readonly VillaGroup[];
  /** Payments whose booking is not in the feed. */
  readonly orphans: readonly PaymentMark[];
}

function bookingRow(model: Model, axis: Axis, r: Reservation): BookingRow {
  const stay = stayEventOf(model, r);
  const nights = r.hold ? (stay === null ? [] : nightsOf(stay.check_in, stay.check_out)) : r.nights.map((n) => n.night);
  const noNights = r.hold && stay !== null && nights.length === 0 ? (axis.index.get(stay.check_in) ?? null) : null;
  const key = (e: EventRow) => `${e.check_in}|${e.check_out}`;
  const seen = new Set(stay === null ? [] : [key(stay)]);
  const earlier: BookingRow["earlier"][number][] = [];
  for (const id of r.superseded) {
    const event = model.events.find((e) => e.source_event_id === id && e.fate.kind === "superseded");
    if (event === undefined || seen.has(key(event))) continue;
    seen.add(key(event));
    earlier.push({ event, span: spanOf(axis, nightsOf(event.check_in, event.check_out)) });
  }
  const payments = paymentMarks(
    model,
    axis,
    model.payments.filter((p) => p.reservation_id === r.reservation_id),
  );
  const span = spanOf(axis, nights);
  const occupied = new Set<number>(noNights === null ? [] : [noNights]);
  for (let i = span.range?.start ?? 0; i < (span.range?.end ?? 0); i += 1) occupied.add(i);
  return { r, stay, span, noNights, earlier, payments, occupied };
}

const startOf = (b: BookingRow) => b.stay?.check_in ?? b.r.nights[0]?.night ?? "";

export function calendarLayout(model: Model): CalendarLayout {
  const axis = axisOf(model.report_months);
  const known = new Set(model.properties.map((p) => p.property_id));
  const unknown = [...new Set(model.reservations.map((r) => r.property_id).filter((id) => !known.has(id)))].sort();
  const villas = [...model.properties.map((p) => p.property_id), ...unknown].map((property_id) => ({
    property_id,
    known: known.has(property_id),
    rules: ruleBandOf(axis, model.rules, property_id),
    bookings: model.reservations
      .filter((r) => r.property_id === property_id)
      .map((r) => bookingRow(model, axis, r))
      .sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.r.reservation_id.localeCompare(b.r.reservation_id)),
  }));
  const booked = new Set(model.reservations.map((r) => r.reservation_id));
  return {
    axis,
    rates: rateScale(model.rules.map((r) => r.rate_bps)),
    villas,
    orphans: paymentMarks(
      model,
      axis,
      model.payments.filter((p) => !booked.has(p.reservation_id)),
    ),
  };
}

/**
 * The exact product accommodation × rate of a night, before HALF_UP rounds it to the fee: "187,008.5".
 * Integer arithmetic, accommodation × bps / 10 000; `rounded` — the product has a fraction.
 */
export function exactFee(accommodation: number, bps: number): { text: string; rounded: boolean } {
  const product = accommodation * bps;
  const abs = Math.abs(product);
  const rest = abs % 10000;
  const fraction = rest === 0 ? "" : `.${String(rest).padStart(4, "0").replace(/0+$/, "")}`;
  return { text: `${product < 0 ? "−" : ""}${idrFull(Math.trunc(abs / 10000))}${fraction}`, rounded: rest !== 0 };
}

/** Where a payment's label goes: right of its mark, else left, so it does not cover the row's stay; null — no room. */
export function labelSide(day: number, occupied: ReadonlySet<number>, days: number, width = 3): "right" | "left" | null {
  const free = (from: number, to: number) => {
    for (let i = from; i <= to; i += 1) if (occupied.has(i)) return false;
    return true;
  };
  if (free(day + 1, Math.min(day + width, days - 1))) return "right";
  if (day - width >= 0 && free(day - width, day - 1)) return "left";
  return null;
}
