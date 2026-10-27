// What the /events page shows, laid out from the model of lib/nightly/explain.ts: labels of fates and
// money kinds, what a selection lights up, the day axis of the calendar, the list of exceptions with
// their money and state. Nothing here computes a figure: sums come from the model.
import type { View } from "@/lib/calc";
import type { ExceptionCode } from "@/lib/nightly";
import type { EventFate, Explanation, MoneyKind } from "@/lib/nightly/explain";
import type { ChipColor } from "@/components/status-meta";
import { STATUS_META } from "@/components/status-meta";
import { actionOf, CODE_META, type ExceptionKind } from "./exception-meta";

export type Model = View<Explanation>;
export type EventRow = Model["events"][number];
export type PaymentRow = Model["payments"][number];
export type Reservation = Model["reservations"][number];
export type Cell = Model["cells"][number];
export type DisputeView = Model["disputes"][number];
export type Figures = Model["report"]["total"];
export type MetricKey = keyof Figures;

export const METRICS: readonly { key: MetricKey; label: string; hint: string }[] = [
  { key: "accommodation_gross_idr", label: "Accommodation", hint: "Stay without PBJT, by night" },
  { key: "pbjt_liability_idr", label: "PBJT", hint: "Tax owed to the state, not income" },
  { key: "ota_fee_idr", label: "OTA fee", hint: "Channel commission, by night" },
  { key: "management_fee_idr", label: "Mgmt fee", hint: "Night × the rate in force that night" },
  { key: "owner_estimate_idr", label: "Owner est.", hint: "Accommodation − OTA fee − Mgmt fee" },
  { key: "cash_received_idr", label: "Cash received", hint: "Received payments by payment date" },
];

export interface FateMeta {
  label: string;
  color: ChipColor;
  description: string;
}

export function eventFateMeta(f: View<EventFate>): FateMeta {
  switch (f.kind) {
    case "selected":
      return f.in_figures ? { ...STATUS_META.clean, description: "The version that stands, in the figures" } : { ...STATUS_META.excluded, description: "The version that stands, but it failed a check" };
    case "duplicate":
      return { ...STATUS_META.duplicate, description: "An exact copy of another row, counted once" };
    case "superseded":
      return STATUS_META.superseded;
    case "candidate":
      return { ...STATUS_META.pending, description: "One of the disputed records: awaits a person's choice" };
    case "blocked":
      return { label: "Waits", color: "accent", description: "Another event of this booking is disputed: the booking waits for it" };
    case "rejected":
      return { label: "Rejected", color: "default", description: "Not picked by a person's decision" };
  }
}

export const MONEY_KIND_META: Record<MoneyKind, { label: string; color: ChipColor; description: string }> = {
  received: { label: "Received", color: "success", description: "In the villa's cash of the month of payment" },
  outside: { label: "Outside", color: "default", description: "Received, dated outside the report months" },
  held: { label: "Held", color: "accent", description: "Known money not attributed yet: pending, or its booking is held" },
  unmatched: { label: "Unmatched", color: "danger", description: "Received for a booking nobody sent" },
  duplicate: { label: "Duplicate", color: "default", description: "An exact copy, counted once" },
  conflicting: { label: "Disputed", color: "accent", description: "Copies differ: no single amount, in no sum" },
  rejected: { label: "Rejected", color: "default", description: "Not picked by a person's decision" },
};

export const MONEY_KIND_ORDER: readonly MoneyKind[] = ["received", "outside", "held", "unmatched", "duplicate", "conflicting", "rejected"];

export function moneyKindOf(p: PaymentRow): MoneyKind {
  return p.fate.kind === "received" ? (p.fate.counted ? "received" : "outside") : p.fate.kind;
}

// ── dates ──────────────────────────────────────────────────────────────────

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const INSTANT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export const dayText = (d: string) => DAY_MONTH.format(new Date(`${d}T00:00:00Z`));
export const monthText = (m: string) => MONTH.format(new Date(`${m}-01T00:00:00Z`));
export const instantText = (iso: string) => `${INSTANT.format(new Date(iso))} UTC`;

/** Every day of the report months, in order: the axis of the calendar. */
export function daysOf(months: readonly string[]): string[] {
  const out: string[] = [];
  for (const m of months) {
    const d = new Date(`${m}-01T00:00:00Z`);
    while (d.toISOString().slice(0, 7) === m) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return out;
}

/** The nights of a stay, check-out excluded. */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const d = new Date(`${checkIn}T00:00:00Z`);
  for (let i = 0; i < 400 && d.toISOString().slice(0, 10) < checkOut; i += 1) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** "17%", "17.5%" */
export const percentOfBps = (bps: number) => `${bps / 100}%`;

// ── selection ──────────────────────────────────────────────────────────────

export type FlowStep =
  | { side: "events"; part: "duplicate" | "superseded" | "candidate" | "held" | "in_figures" | "rejected" }
  | { side: "payments"; part: MoneyKind };

export type Selection =
  | { kind: "cell"; property_id: string | null; month: string | null; metric: MetricKey }
  | { kind: "reservation"; id: string }
  | { kind: "payment"; id: string }
  | { kind: "code"; code: ExceptionCode }
  | { kind: "flow"; step: FlowStep };

export interface Highlight {
  label: string;
  reservations: ReadonlySet<string>;
  payments: ReadonlySet<string>;
  eventRows: ReadonlySet<number>;
  paymentRows: ReadonlySet<number>;
  /** `${reservation_id}|${night}` */
  nights: ReadonlySet<string>;
}

export const nightKey = (reservation_id: string, night: string) => `${reservation_id}|${night}`;

export function cellOf(model: Model, property_id: string | null, month: string | null): Cell {
  return model.cells.find((c) => c.property_id === property_id && c.month === month)!;
}

type EventPart = Extract<FlowStep, { side: "events" }>["part"];

const EVENT_PART_LABEL: Record<EventPart, string> = {
  duplicate: "Duplicate rows",
  superseded: "Superseded versions",
  candidate: "Disputed records",
  held: "Bookings out of the figures",
  in_figures: "Bookings in the figures",
  rejected: "Rejected records",
};

/** What a selection lights up in every section: the rows, bookings, payments and nights behind it. */
export function highlightOf(model: Model, s: Selection): Highlight {
  const reservations = new Set<string>();
  const payments = new Set<string>();
  const nights = new Set<string>();
  const addReservation = (id: string) => {
    reservations.add(id);
    const r = model.reservations.find((x) => x.reservation_id === id);
    for (const n of r?.nights ?? []) nights.add(nightKey(id, n.night));
  };
  let label: string;
  switch (s.kind) {
    case "cell": {
      const cell = cellOf(model, s.property_id, s.month);
      const metric = METRICS.find((m) => m.key === s.metric)!.label;
      label = `${metric} · ${s.property_id ?? "all villas"} · ${s.month === null ? "total" : monthText(s.month)}`;
      if (s.metric === "cash_received_idr") {
        for (const p of cell.payments) payments.add(p.payment_id);
      } else {
        for (const n of cell.nights) {
          reservations.add(n.reservation_id);
          nights.add(nightKey(n.reservation_id, n.night));
        }
      }
      break;
    }
    case "reservation":
      label = `Booking ${s.id}`;
      addReservation(s.id);
      for (const p of model.payments) if (p.reservation_id === s.id) payments.add(p.payment_id);
      break;
    case "payment": {
      label = `Payment ${s.id}`;
      payments.add(s.id);
      break;
    }
    case "code":
      label = CODE_META[s.code].label;
      for (const e of model.report.exceptions) {
        if (e.code !== s.code) continue;
        if (e.record_type === "reservation") addReservation(e.record_id);
        else payments.add(e.record_id);
      }
      break;
    case "flow": {
      const step = s.step;
      label = step.side === "payments" ? `${MONEY_KIND_META[step.part].label} payments` : EVENT_PART_LABEL[step.part];
      if (step.side === "payments") {
        for (const p of model.payments) if (moneyKindOf(p) === step.part) payments.add(p.payment_id);
      } else if (step.part === "held" || step.part === "in_figures") {
        for (const r of model.reservations) if (r.hold === (step.part === "held")) addReservation(r.reservation_id);
      } else {
        const rows = new Set(model.events.filter((e) => e.fate.kind === step.part).map((e) => e.row));
        return { label, reservations, payments, eventRows: rows, paymentRows: new Set(), nights };
      }
      break;
    }
  }
  const eventRows = new Set(model.events.filter((e) => reservations.has(e.reservation_id)).map((e) => e.row));
  const paymentRows = new Set(model.payments.filter((p) => payments.has(p.payment_id)).map((p) => p.row));
  return { label, reservations, payments, eventRows, paymentRows, nights };
}

// ── exceptions ─────────────────────────────────────────────────────────────

export type ExceptionState =
  | { kind: "open" }
  | { kind: "decided"; decision: Model["applied"][number]["decision"] }
  | { kind: "stale"; decision: Model["stale"][number] };

export interface ExceptionRow {
  key: string;
  record_type: "reservation" | "payment";
  record_id: string;
  code: ExceptionCode;
  kind: ExceptionKind;
  action: ReturnType<typeof actionOf>;
  property_id: string | null;
  /** Money out of the totals and where it is now; null — no IDR amount (another currency, a booking without nights). */
  money: { amount: number; currency: string; where: "held" | "unmatched" | "nowhere" | "outside" } | null;
  /** The dispute it belongs to, open or not. */
  case_key: string | null;
}

const DECIDE_CODES: ReadonlySet<ExceptionCode> = new Set(["AMBIGUOUS_VERSION", "CONFLICTING_EVENT", "CONFLICTING_PAYMENT"]);

/** The rows of the exceptions list, in the report's order; decided cases follow as rows of their own. */
export function exceptionRowsOf(model: Model): ExceptionRow[] {
  const disputed = new Set(
    model.report.exceptions.filter((e) => e.record_type === "reservation" && DECIDE_CODES.has(e.code)).map((e) => e.record_id),
  );
  return model.report.exceptions.map((e) => {
    const base = { key: `${e.record_type}|${e.record_id}|${e.code}`, record_type: e.record_type, record_id: e.record_id, code: e.code };
    if (e.record_type === "reservation") {
      const r = model.reservations.find((x) => x.reservation_id === e.record_id)!;
      const snapshot = model.events.find((x) => x.source_event_id === r.selected);
      const out = r.nights.filter((n) => !n.in_window).reduce((a, n) => a + n.accommodation_gross_idr, 0);
      const money =
        e.code === "OUTSIDE_REPORT_MONTHS"
          ? { amount: out, currency: "IDR", where: "outside" as const }
          : snapshot !== undefined
            ? { amount: snapshot.accommodation_gross_idr, currency: snapshot.currency, where: "nowhere" as const }
            : null;
      const case_key = e.code === "AMBIGUOUS_VERSION" ? `version:${e.record_id}` : e.code === "CONFLICTING_EVENT" ? caseOfReservation(model, e.record_id) : null;
      return { ...base, kind: CODE_META[e.code].kind, action: actionOf(e.code), property_id: r.property_id, money, case_key };
    }
    const rows = model.payments.filter((p) => p.payment_id === e.record_id);
    const first = rows[0]!;
    const where = first.fate.kind === "unmatched" ? "unmatched" : first.fate.kind === "held" ? "held" : first.fate.kind === "received" ? "outside" : "nowhere";
    const amount = e.code === "CONFLICTING_PAYMENT" ? Math.max(...rows.map((p) => p.amount_idr)) : first.amount_idr;
    const property = model.reservations.find((r) => r.reservation_id === first.reservation_id)?.property_id ?? null;
    return {
      ...base,
      kind: CODE_META[e.code].kind,
      action: actionOf(e.code, disputed.has(first.reservation_id)),
      property_id: property,
      money: { amount, currency: "IDR", where },
      case_key: e.code === "CONFLICTING_PAYMENT" ? `payment:${e.record_id}` : null,
    };
  });
}

/** The conflicting event that holds a booking: the open dispute naming one of its rows. */
function caseOfReservation(model: Model, reservation_id: string): string | null {
  const ids = new Set(model.events.filter((e) => e.reservation_id === reservation_id).map((e) => e.source_event_id));
  return model.disputes.find((d) => d.kind === "event" && ids.has(d.record_key))?.case_key ?? null;
}

export const CASE_LABEL: Record<DisputeView["kind"], string> = {
  version: "Two latest versions of a booking",
  event: "One event, different copies",
  payment: "One payment, different copies",
};
