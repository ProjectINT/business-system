// Snapshots for tests: a small dataset through the real parser and the full rule set, or the
// sample files through the CSV source — the same path the pages take.
import { DEFAULT_POLICIES, parseDate } from "../../calc";
import { defaultRegistry, type Dataset } from "../../dq";
import { datasetFrom, type Rows } from "../../dq/testing/fixture";
import { TODAY, runOn } from "../../dq/testing/run";
import { csvSource } from "../csv-source";
import { parseFilters, type Filters, type SearchParams } from "../filters";
import { buildSnapshot } from "../snapshot";
import type { Snapshot } from "../types";

export async function snapshotOfDataset(dataset: Dataset, today: string = TODAY): Promise<Snapshot> {
  return buildSnapshot({
    source: { kind: "csv", label: "<memory>" },
    dataset,
    report: await runOn(dataset, { today }),
    checks: defaultRegistry().checks,
    policies: DEFAULT_POLICIES,
  });
}

export function snapshotOf(rows: Rows, today: string = TODAY): Promise<Snapshot> {
  return snapshotOfDataset(datasetFrom(rows), today);
}

/** The sample files, as the dashboard reads them on `TODAY`. */
export function sampleSnapshot(): Promise<Snapshot> {
  return csvSource().snapshot(parseDate("2026-10-19"));
}

export function filtersOf(snapshot: Snapshot, params: SearchParams = {}): Filters {
  const { filters, warnings } = parseFilters(params, snapshot);
  if (warnings.length > 0) throw new Error(`Unexpected filter warnings: ${warnings.join("; ")}`);
  return filters;
}
