// Dashboard filters in the URL (PLAN.md 8): a link with them opens the same view. Plain strings and
// no imports, so the client filter bar builds the same URL as the server reads.
//   ?from=2026-09-01&to=2026-09-30   period, both bounds inclusive; absent — the whole data range
//   &property=V001&property=V003     properties; absent — all
//   &cluster=Ubud                    cluster; with properties, both apply
//   &review=off                      leave records under review out; absent — they are in

export const PARAM = {
  from: "from",
  to: "to",
  property: "property",
  cluster: "cluster",
  review: "review",
} as const;

export interface FilterState {
  readonly from: string;
  readonly to: string;
  /** Sorted; empty — every property. */
  readonly propertyIds: readonly string[];
  readonly cluster: string | null;
  readonly includeReview: boolean;
}

export interface DateRange {
  readonly from: string;
  readonly to: string;
}

/** What the filter bar offers: built on the server from the snapshot. */
export interface FilterOptions {
  readonly range: DateRange;
  /** `all`, then each month of the data: `2026-09`. */
  readonly presets: readonly { readonly id: string; readonly from: string; readonly to: string }[];
  readonly properties: readonly { readonly id: string; readonly name: string | null; readonly cluster: string | null }[];
  readonly clusters: readonly string[];
}

// Rows on /import/raw-data, same plain strings:
//   ?property=V001      rows that name the villa; absent — every row
//   &status=flagged     a row status, or `flagged`: review and pending, what the dashboard counts as DQ flags
export const RAW_PARAM = { property: PARAM.property, status: "status" } as const;
export const FLAGGED = "flagged";

/** The villa's DQ flags on /import/raw-data. */
export function flaggedRowsHref(propertyId: string): string {
  const q = new URLSearchParams({ [RAW_PARAM.property]: propertyId, [RAW_PARAM.status]: FLAGGED });
  return `/import/raw-data?${q}`;
}

/** `?…` with the filters that differ from the defaults; "" when none do. */
export function searchOf(state: FilterState, range: DateRange): string {
  const q = new URLSearchParams();
  if (state.from !== range.from || state.to !== range.to) {
    q.set(PARAM.from, state.from);
    q.set(PARAM.to, state.to);
  }
  for (const id of [...state.propertyIds].sort()) q.append(PARAM.property, id);
  if (state.cluster !== null) q.set(PARAM.cluster, state.cluster);
  if (!state.includeReview) q.set(PARAM.review, "off");
  const s = q.toString();
  return s === "" ? "" : `?${s}`;
}
