// Public API of the data-quality module (docs/VALIDATION_PLAN.md; docs/ROADMAP.md, phases 2–3).
// Import only from "@/lib/dq".
export { buildCases, type Case, type CaseType } from "./cases";
export { CHECKS, defaultRegistry } from "./checks";
export { conflictGroups, overlapPairs, stayCandidates, type ConflictGroup, type OverlapKind, type OverlapPair } from "./checks/dq12-stay-overlap";
export { areaOf, contractViolations, entitiesOf, sortResults } from "./contract";
export { DQ_ERROR_CODES, DqError, type DqErrorCode } from "./errors";
export { createRegistry, orderChecks, type Registry } from "./registry";
export { NO_DECISIONS, runChecks, type RunOptions } from "./runner";
export { journalOf, MemorySink, type MemoryRun, type StoredResult } from "./sinks/memory";
export { CSV_BATCH_ID, datasetSource } from "./sources/dataset";
export { actionOf, supersededVerdict, verdictFor, type RuleResult } from "./verdict";
export type * from "./types";
