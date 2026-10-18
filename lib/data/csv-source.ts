// Level-1 source: the five CSV files in the repository (PLAN.md 4.1). Loading and the 22 rules run
// once per process and directory; every request reuses the snapshot. A failed load is not kept,
// so the next request tries again.
import { DEFAULT_POLICIES } from "../calc";
import { datasetSource, defaultRegistry, MemorySink, runChecks } from "../dq";
import { DEFAULT_DATA_DIR, loadDataset } from "../ingest";
import { buildSnapshot } from "./snapshot";
import type { DataSource, Snapshot } from "./types";

const cache = new Map<string, Promise<Snapshot>>();

async function load(dir: string): Promise<Snapshot> {
  const dataset = loadDataset(dir);
  const registry = defaultRegistry();
  const report = await runChecks({
    source: datasetSource(dataset),
    registry,
    sink: new MemorySink(),
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
    snapshot() {
      let snapshot = cache.get(dir);
      if (snapshot === undefined) {
        snapshot = load(dir);
        cache.set(dir, snapshot);
        snapshot.catch(() => cache.delete(dir));
      }
      return snapshot;
    },
  };
}
