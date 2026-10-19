// Level-1 source: the five CSV files in the repository (PLAN.md 4.1). Loading and the 22 rules run
// once per process, directory and day: the next day the checks run again for the new today. Every
// request of the day reuses the snapshot. A failed load is not kept, so the next request tries again.
import { DEFAULT_POLICIES, type CalendarDate } from "../calc";
import { datasetSource, defaultRegistry, MemorySink, runChecks } from "../dq";
import { DEFAULT_DATA_DIR, loadDataset } from "../ingest";
import { buildSnapshot } from "./snapshot";
import type { DataSource, Snapshot } from "./types";

const cache = new Map<string, { readonly today: CalendarDate; readonly snapshot: Promise<Snapshot> }>();

async function load(dir: string, today: CalendarDate): Promise<Snapshot> {
  const dataset = loadDataset(dir);
  const registry = defaultRegistry();
  const report = await runChecks({
    source: datasetSource(dataset),
    registry,
    sink: new MemorySink(),
    today,
    policies: DEFAULT_POLICIES,
  });
  return buildSnapshot({
    source: { kind: "csv", label: dir },
    dataset,
    report,
    checks: registry.checks,
    policies: DEFAULT_POLICIES,
  });
}

export function csvSource(dir: string = DEFAULT_DATA_DIR): DataSource {
  return {
    kind: "csv",
    snapshot(today) {
      let entry = cache.get(dir);
      if (entry === undefined || entry.today !== today) {
        const fresh = { today, snapshot: load(dir, today) };
        cache.set(dir, fresh);
        fresh.snapshot.catch(() => {
          if (cache.get(dir) === fresh) cache.delete(dir);
        });
        entry = fresh;
      }
      return entry.snapshot;
    },
  };
}
