// Nightly commission adapter for the final test (docs/FINAL_TEST_PLAN.md).
// Public API for scripts/nightly.ts and the tests: runCase(input) → the report with numbers,
// formatReport(report) → the JSON text the CLI writes.
// Imports from lib/calc go through "../calc" (relative, as the lint block for lib/* requires).
import { toView } from "../calc";
import { buildReport, type ReportView } from "./report";
import { parseCase } from "./schema";
import { selectSnapshots } from "./snapshots";

export { formatReport, type ReportView } from "./report";
export type { Dedup, Exception, ExceptionCode } from "./types";

/**
 * A case file (parsed JSON of unknown shape) → the report. Throws ZodError on a format error
 * (scripts/nightly.ts prints the path to the field). Only the input decides the result: there is
 * no current date, and the order of the input arrays does not matter.
 */
export function runCase(input: unknown): ReportView {
  const parsed = parseCase(input);
  return toView(buildReport(parsed, selectSnapshots(parsed)));
}
