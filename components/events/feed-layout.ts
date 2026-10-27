// The layout of the event feed (docs/EVENTS_VISUALIZATION_PLAN.md, 3.4): per booking, columns of
// versions by updated_at, in each column the copies of a source_event_id stacked, and what each version
// changed against the one before. Only arranges rows of the model: fates come from explain.ts.
import { idrFull } from "@/lib/format";
import type { ChipColor } from "@/components/status-meta";
import type { EventRow, Model, Reservation } from "./view-of";

export const FIELDS = [
  { key: "status", label: "Status" },
  { key: "property_id", label: "Villa" },
  { key: "check_in", label: "Check-in" },
  { key: "check_out", label: "Check-out" },
  { key: "accommodation_gross_idr", label: "Accommodation" },
  { key: "pbjt_idr", label: "PBJT" },
  { key: "ota_fee_idr", label: "OTA fee" },
  { key: "currency", label: "Currency" },
] as const satisfies readonly { key: keyof EventRow; label: string }[];

export type Field = (typeof FIELDS)[number]["key"];

const AMOUNTS: ReadonlySet<Field> = new Set(["accommodation_gross_idr", "pbjt_idr", "ota_fee_idr"]);

export const isAmount = (f: Field) => AMOUNTS.has(f);

/** "4,400,000" in IDR, "USD 10,000" in another currency: amounts are never converted. */
export const amountText = (value: number, currency: string) => (currency === "IDR" ? idrFull(value) : `${currency} ${idrFull(value)}`);

export interface Change {
  field: Field;
  label: string;
  was: string | number;
  now: string | number;
  /** Amounts only. */
  direction: "up" | "down" | null;
}

/** One content of a source_event_id: its rows are exact copies, the first one carries the fate. */
export interface VersionCard {
  /** The row that is not a duplicate, else the first. */
  primary: EventRow;
  rows: EventRow[];
  /** Fields that differ from the other cards of its column or from other copies of its id. */
  differing: ReadonlySet<Field>;
  /** Against the previous column; null in the first column. */
  changes: Change[] | null;
}

/** Rows of one source_event_id in one column. */
export interface CopyStack {
  source_event_id: string;
  cards: VersionCard[];
  /** Copies of the id differ in content anywhere in the feed (CONFLICTING_EVENT). */
  conflicting: boolean;
}

export interface Column {
  updated_at: string;
  stacks: CopyStack[];
  /** More than one source_event_id at this updated_at. */
  tie: boolean;
  /** The ids at this updated_at carry different content. */
  tieDiffers: boolean;
}

export interface BookingFeed {
  reservation: Reservation;
  columns: Column[];
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const t of items) out.set(key(t), [...(out.get(key(t)) ?? []), t]);
  return out;
}

/** Fields whose values are not all equal across the rows. */
export function differingFields(rows: readonly EventRow[]): Set<Field> {
  const out = new Set<Field>();
  for (const { key } of FIELDS) if (new Set(rows.map((r) => r[key])).size > 1) out.add(key);
  return out;
}

/** What `now` changed against `was`, field by field. */
export function changesOf(was: EventRow, now: EventRow): Change[] {
  return FIELDS.filter(({ key }) => was[key] !== now[key]).map(({ key, label }) => {
    const a = was[key];
    const b = now[key];
    const direction = typeof a === "number" && typeof b === "number" ? (b > a ? "up" : "down") : null;
    return { field: key, label, was: a, now: b, direction };
  });
}

/** The row a column stands for when the next one is compared with it. */
function representative(column: Column): EventRow {
  const cards = column.stacks.flatMap((s) => s.cards);
  const kept = cards.find((c) => c.primary.fate.kind !== "rejected" && c.primary.fate.kind !== "duplicate");
  return (kept ?? cards[0]!).primary;
}

/** The columns of one booking's rows, oldest first; within a column, stacks by source_event_id. */
export function columnsOf(rows: readonly EventRow[]): Column[] {
  const sorted = [...rows].sort((a, b) => byString(a.updated_at, b.updated_at) || a.row - b.row);
  const copiesOfId = groupBy(rows, (r) => r.source_event_id);
  const columns: Column[] = [];
  for (const [updated_at, list] of groupBy(sorted, (r) => r.updated_at)) {
    const ids = groupBy(list, (r) => r.source_event_id);
    const tie = ids.size > 1;
    const tieDiffers = tie && new Set(list.map((r) => r.content)).size > 1;
    const tieFields = tieDiffers ? differingFields(list) : new Set<Field>();
    const stacks = [...ids]
      .sort(([a], [b]) => byString(a, b))
      .map(([source_event_id, copies]): CopyStack => {
        const all = copiesOfId.get(source_event_id)!;
        const conflicting = new Set(all.map((r) => r.content)).size > 1;
        const copyFields = conflicting ? differingFields(all) : new Set<Field>();
        const cards = [...groupBy(copies, (r) => r.content).values()].map((same): VersionCard => {
          const primary = same.find((r) => r.fate.kind !== "duplicate") ?? same[0]!;
          return { primary, rows: same, differing: new Set([...tieFields, ...copyFields]), changes: null };
        });
        return { source_event_id, cards, conflicting };
      });
    const column: Column = { updated_at, stacks, tie, tieDiffers };
    const prev = columns.at(-1);
    if (prev !== undefined) {
      const was = representative(prev);
      for (const s of column.stacks) for (const c of s.cards) c.changes = changesOf(was, c.primary);
    }
    columns.push(column);
  }
  return columns;
}

/** Every booking with its columns, by reservation id. */
export function feedOf(model: Model): BookingFeed[] {
  const byRow = new Map(model.events.map((e) => [e.row, e]));
  return [...model.reservations]
    .sort((a, b) => byString(a.reservation_id, b.reservation_id))
    .map((reservation) => ({
      reservation,
      columns: columnsOf(reservation.rows.map((r) => byRow.get(r)!)),
    }));
}

/** The open disputes a booking waits on: its tie of versions, or a conflicting event in its feed. */
export function disputesOfReservation(model: Model, r: Reservation): Model["disputes"] {
  const ids = new Set(model.events.filter((e) => e.reservation_id === r.reservation_id).map((e) => e.source_event_id));
  return model.disputes.filter(
    (d) => (d.kind === "version" && d.record_key === r.reservation_id) || (d.kind === "event" && ids.has(d.record_key)),
  );
}

/** Case keys that can name a booking's decision, open or applied. */
export function caseKeysOfReservation(model: Model, r: Reservation): Set<string> {
  const ids = new Set(model.events.filter((e) => e.reservation_id === r.reservation_id).map((e) => e.source_event_id));
  return new Set([`version:${r.reservation_id}`, ...[...ids].map((id) => `event:${id}`)]);
}

export type BookingState = "in_figures" | "excluded" | "decide";

export const BOOKING_STATE_META: Record<BookingState, { label: string; color: ChipColor; description: string }> = {
  in_figures: { label: "In figures", color: "success", description: "Its version stands and passed the checks: its nights are in the figures" },
  excluded: { label: "Excluded", color: "danger", description: "Left out of the figures until the source data is corrected" },
  decide: { label: "Awaits a decision", color: "accent", description: "Disputed records: out of the figures until a person picks one" },
};

export function bookingStateOf(model: Model, r: Reservation): BookingState {
  if (!r.hold) return "in_figures";
  const decide = r.codes.some((c) => c === "AMBIGUOUS_VERSION" || c === "CONFLICTING_EVENT");
  return decide || disputesOfReservation(model, r).length > 0 ? "decide" : "excluded";
}
