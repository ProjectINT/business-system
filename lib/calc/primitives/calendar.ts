import { CalcError } from "../errors";

/** 'YYYY-MM-DD'. Only parseDate and the functions here produce it. */
export type CalendarDate = string & { readonly __brand: "CalendarDate" };

/** Both bounds are inclusive in the API: September = 2026-09-01..2026-09-30. */
export interface Period {
  readonly from: CalendarDate;
  readonly to: CalendarDate;
}

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(text: string): CalendarDate {
  const m = DATE_RE.exec(text);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = new Date(Date.UTC(y, mo - 1, d));
    // Round trip rejects 2026-02-30 and years 0–99 (Date.UTC maps them to 1900–1999).
    if (t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d) {
      return text as CalendarDate;
    }
  }
  throw new CalcError("INVALID_DATE", `Not a calendar date: "${text}"`, { text });
}

/** Days since 1970-01-01, independent of the process time zone. */
export function toEpochDay(date: CalendarDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function fromEpochDay(day: number): CalendarDate {
  const t = new Date(day * DAY_MS);
  const y = String(t.getUTCFullYear()).padStart(4, "0");
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return parseDate(`${y}-${m}-${d}`);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Nights of a half-open stay [checkIn, checkOut). */
export function nightsBetween(checkIn: CalendarDate, checkOut: CalendarDate): number {
  return toEpochDay(checkOut) - toEpochDay(checkIn);
}

/** Each night of [checkIn, checkOut): the night from `date` to `date + 1`. */
export function eachNight(checkIn: CalendarDate, checkOut: CalendarDate): CalendarDate[] {
  const start = toEpochDay(checkIn);
  return Array.from({ length: Math.max(0, nightsBetween(checkIn, checkOut)) }, (_, i) => fromEpochDay(start + i));
}

export function period(from: CalendarDate, to: CalendarDate): Period {
  if (from > to) throw new CalcError("INVALID_PERIOD", `Period starts after it ends: ${from}..${to}`, { from, to });
  return { from, to };
}

export function inPeriod(p: Period, date: CalendarDate): boolean {
  return p.from <= date && date <= p.to;
}

/** The calendar date at `instant` in `timeZone` (IANA name), whatever the process time zone. */
export function dateIn(instant: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return parseDate(`${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`);
}
