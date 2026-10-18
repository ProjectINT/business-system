// URL search params → filters → the calculator's scope. A value that does not fit (a broken date,
// an unknown villa) falls back to the default and leaves a warning: the page still opens.
import { addDays, parseDate, period, type CalendarDate, type Currency, type Period, type Scope } from "../calc";
import { PARAM, type FilterOptions, type FilterState } from "./query";
import type { Snapshot } from "./types";

/** Every amount of the dashboard is in the villas' base currency. */
export const BASE_CURRENCY: Currency = "IDR";

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

export interface Filters extends FilterState {
  readonly period: Period;
}

export interface ParsedFilters {
  readonly filters: Filters;
  /** What was ignored in the URL, for a note on the page. */
  readonly warnings: readonly string[];
}

function values(params: SearchParams, key: string): string[] {
  const v = params[key];
  const list = v === undefined ? [] : Array.isArray(v) ? v : [v];
  return list.flatMap((s) => s.split(",")).map((s) => s.trim()).filter((s) => s !== "");
}

function tryDate(text: string): CalendarDate | null {
  try {
    return parseDate(text);
  } catch {
    return null;
  }
}

function parsePeriod(params: SearchParams, range: Period, warnings: string[]): Period {
  const [fromText] = values(params, PARAM.from);
  const [toText] = values(params, PARAM.to);
  if (fromText === undefined && toText === undefined) return range;
  const from = fromText === undefined ? range.from : tryDate(fromText);
  const to = toText === undefined ? range.to : tryDate(toText);
  if (from === null || to === null) {
    warnings.push(`Period ${fromText ?? ""}…${toText ?? ""} is not a pair of dates YYYY-MM-DD; showing the whole period`);
    return range;
  }
  if (from > to) {
    warnings.push(`Period starts after it ends (${from} > ${to}); showing the whole period`);
    return range;
  }
  return period(from, to);
}

const OFF = new Set(["off", "0", "false", "no"]);
const ON = new Set(["on", "1", "true", "yes"]);

export function parseFilters(params: SearchParams, snapshot: Snapshot): ParsedFilters {
  const warnings: string[] = [];
  const p = parsePeriod(params, snapshot.range, warnings);

  const known = new Set(snapshot.properties.map((x) => x.propertyId));
  const requested = [...new Set(values(params, PARAM.property))];
  const unknown = requested.filter((id) => !known.has(id));
  if (unknown.length > 0) warnings.push(`Unknown properties ignored: ${unknown.join(", ")}`);
  const propertyIds = requested.filter((id) => known.has(id)).sort();

  const [clusterText] = values(params, PARAM.cluster);
  let cluster: string | null = null;
  if (clusterText !== undefined) {
    if (snapshot.clusters.includes(clusterText)) cluster = clusterText;
    else warnings.push(`Unknown cluster ignored: ${clusterText}`);
  }

  const [reviewText] = values(params, PARAM.review);
  let includeReview = true;
  if (reviewText !== undefined) {
    const v = reviewText.toLowerCase();
    if (OFF.has(v)) includeReview = false;
    else if (!ON.has(v)) warnings.push(`review=${reviewText} is neither on nor off; records under review are included`);
  }

  return {
    filters: { period: p, from: p.from, to: p.to, propertyIds, cluster, includeReview },
    warnings,
  };
}

/** Properties the filters select: `all` without a cluster and a selection, else the ones matching both. */
export function selectedProperties(filters: FilterState, snapshot: Snapshot): ReadonlySet<string> | "all" {
  if (filters.cluster === null && filters.propertyIds.length === 0) return "all";
  const ids = new Set(filters.propertyIds);
  return new Set(
    snapshot.properties
      .filter((p) => filters.cluster === null || p.cluster === filters.cluster)
      .filter((p) => ids.size === 0 || ids.has(p.propertyId))
      .map((p) => p.propertyId),
  );
}

export function scopeOf(filters: Filters, snapshot: Snapshot, includeReview: boolean = filters.includeReview): Scope {
  return {
    period: filters.period,
    propertyIds: selectedProperties(filters, snapshot),
    includeReview,
    baseCurrency: BASE_CURRENCY,
    asOf: snapshot.asOf,
  };
}

export interface PeriodPreset {
  /** `all` or the month, `2026-09`. */
  readonly id: string;
  readonly from: CalendarDate;
  readonly to: CalendarDate;
}

function firstOfNextMonth(date: CalendarDate): CalendarDate {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return parseDate(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`);
}

/** The whole data range, then every calendar month it touches. */
export function periodPresets(range: Period): PeriodPreset[] {
  const out: PeriodPreset[] = [{ id: "all", from: range.from, to: range.to }];
  for (let start = parseDate(`${range.from.slice(0, 7)}-01`); start <= range.to; ) {
    const next = firstOfNextMonth(start);
    out.push({ id: start.slice(0, 7), from: start, to: addDays(next, -1) });
    start = next;
  }
  return out;
}

export function filterOptionsOf(snapshot: Snapshot): FilterOptions {
  return {
    range: snapshot.range,
    presets: periodPresets(snapshot.range),
    properties: snapshot.properties.map((p) => ({ id: p.propertyId, name: p.name, cluster: p.cluster })),
    clusters: snapshot.clusters,
  };
}
