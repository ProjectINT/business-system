// Public API of the data-quality module (docs/VALIDATION_PLAN.md; docs/ROADMAP.md, phase 2).
// Import only from "@/lib/dq".
export { contractViolations, sortResults } from "./contract";
export { DQ_ERROR_CODES, DqError, type DqErrorCode } from "./errors";
export { createRegistry, orderChecks, type Registry } from "./registry";
export { NO_DECISIONS, runChecks, type RunOptions } from "./runner";
export { journalOf, MemorySink, type MemoryRun, type StoredResult } from "./sinks/memory";
export { CSV_BATCH_ID, datasetSource } from "./sources/dataset";
export { supersededVerdict, verdictFor, type RuleResult } from "./verdict";
export type * from "./types";
