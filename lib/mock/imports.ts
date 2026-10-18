// Placeholder import log for the layout stage. Shape follows the planned
// import_batch / dq_issue tables (docs/PLAN.md §9); replace with DB reads.

export type BatchStatus = "completed" | "warnings" | "skipped" | "failed";
export type StepStatus = "ok" | "warning" | "skipped" | "failed";
export type EventAction = "removed" | "excluded" | "flagged" | "corrected" | "loaded" | "skipped";

export type ImportStep = {
  id: string;
  module: string;
  description: string;
  status: StepStatus;
  durationMs: number;
  result: string;
};

export type ImportFile = {
  name: string;
  rows: number;
  sha256: string;
  inserted: number;
  updated: number;
  unchanged: number;
  rejected: number;
};

export type ImportEvent = {
  id: number;
  at: string;
  module: string;
  record: string;
  action: EventAction;
  rule?: string;
  message: string;
};

export type ImportBatch = {
  id: string;
  startedAt: string;
  source: string;
  trigger: string;
  status: BatchStatus;
  durationMs: number;
  rowsRead: number;
  inserted: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  corrected: number;
  excluded: number;
  review: number;
  steps: ImportStep[];
  files: ImportFile[];
  events: ImportEvent[];
};

export const BATCH_STATUS_META: Record<
  BatchStatus,
  { label: string; color: "success" | "warning" | "default" | "danger" }
> = {
  completed: { label: "Completed", color: "success" },
  warnings: { label: "Completed with warnings", color: "warning" },
  skipped: { label: "Skipped", color: "default" },
  failed: { label: "Failed", color: "danger" },
};

export const EVENT_ACTION_META: Record<
  EventAction,
  { label: string; color: "success" | "warning" | "default" | "danger" | "accent" }
> = {
  removed: { label: "Duplicate removed", color: "default" },
  excluded: { label: "Excluded", color: "danger" },
  flagged: { label: "Sent to review", color: "warning" },
  corrected: { label: "Corrected", color: "accent" },
  loaded: { label: "Loaded", color: "success" },
  skipped: { label: "Skipped", color: "default" },
};

const STEPS_B002: ImportStep[] = [
  {
    id: "intake",
    module: "File intake",
    description: "Hash every file, skip files already imported",
    status: "ok",
    durationMs: 42,
    result: "5 files · 5 new hashes",
  },
  {
    id: "parse",
    module: "CSV parser",
    description: "UTF-8 BOM, comma-delimited, header mapping",
    status: "ok",
    durationMs: 118,
    result: "357 rows parsed · BOM stripped in 5 headers",
  },
  {
    id: "schema",
    module: "Schema validation",
    description: "Types, ID formats, ISO dates (DQ-03)",
    status: "ok",
    durationMs: 96,
    result: "357 valid · 0 rejected",
  },
  {
    id: "dedupe",
    module: "Deduplication",
    description: "Exact duplicate rows within a file (DQ-01)",
    status: "ok",
    durationMs: 21,
    result: "2 duplicates removed",
  },
  {
    id: "refs",
    module: "Referential integrity",
    description: "Unknown properties, orphan payments (DQ-04, DQ-05)",
    status: "warning",
    durationMs: 34,
    result: "5 excluded → unallocated",
  },
  {
    id: "rules",
    module: "Anomaly rules",
    description: "Currency, fees, refunds, overlaps, links (DQ-06…19)",
    status: "warning",
    durationMs: 188,
    result: "3 excluded · 112 sent to review",
  },
  {
    id: "load",
    module: "Load & versioning",
    description: "Upsert by natural key, close old versions",
    status: "ok",
    durationMs: 1341,
    result: "12 new · 8 changed · 335 unchanged",
  },
];

const FILES_B002: ImportFile[] = [
  { name: "reservations.csv", rows: 151, sha256: "9f2c41ab", inserted: 8, updated: 8, unchanged: 134, rejected: 0 },
  { name: "payments.csv", rows: 76, sha256: "4be07d19", inserted: 4, updated: 0, unchanged: 71, rejected: 0 },
  { name: "expenses.csv", rows: 90, sha256: "c1a5e630", inserted: 0, updated: 0, unchanged: 90, rejected: 0 },
  { name: "properties.csv", rows: 20, sha256: "07d3f2be", inserted: 0, updated: 0, unchanged: 20, rejected: 0 },
  { name: "commission_rules.csv", rows: 20, sha256: "e86b0c57", inserted: 0, updated: 0, unchanged: 20, rejected: 0 },
];

const EVENTS_B002: ImportEvent[] = [
  { id: 1, at: "09:12:00.042", module: "CSV parser", record: "5 files", action: "corrected", message: "UTF-8 BOM stripped from the first header cell" },
  { id: 2, at: "09:12:00.181", module: "Deduplication", record: "R0015", action: "removed", rule: "DQ-01", message: "Line 152 is an exact copy of line 16" },
  { id: 3, at: "09:12:00.182", module: "Deduplication", record: "P0075", action: "removed", rule: "DQ-01", message: "Line 77 is an exact copy of line 76" },
  { id: 4, at: "09:12:00.204", module: "Referential integrity", record: "R0034", action: "excluded", rule: "DQ-04", message: "Property V999 does not exist" },
  { id: 5, at: "09:12:00.205", module: "Referential integrity", record: "E0017", action: "excluded", rule: "DQ-04", message: "Property V777 does not exist" },
  { id: 6, at: "09:12:00.207", module: "Referential integrity", record: "P0017", action: "excluded", rule: "DQ-05", message: "Payment for excluded reservation R0034" },
  { id: 7, at: "09:12:00.231", module: "Anomaly rules", record: "R0061", action: "excluded", rule: "DQ-06", message: "Currency USD, property base is IDR; amount looks like IDR" },
  { id: 8, at: "09:12:00.232", module: "Anomaly rules", record: "R0102", action: "excluded", rule: "DQ-08", message: "Negative OTA fee: −100,000" },
  { id: 9, at: "09:12:00.233", module: "Anomaly rules", record: "R0072", action: "excluded", rule: "DQ-09", message: "Refund 7,970,068 exceeds gross 7,070,068 on a confirmed booking" },
  { id: 10, at: "09:12:00.290", module: "Anomaly rules", record: "R0033 · R0056", action: "flagged", rule: "DQ-12", message: "Same dates on V008 — probable duplicate booking" },
  { id: 11, at: "09:12:00.301", module: "Anomaly rules", record: "R0146", action: "flagged", rule: "DQ-13", message: "Status modified, no link to the original reservation" },
  { id: 12, at: "09:12:00.318", module: "Anomaly rules", record: "31 reservations", action: "flagged", rule: "DQ-11", message: "OTA fee charged on Direct channel bookings" },
  { id: 13, at: "09:12:01.659", module: "Load & versioning", record: "reservations", action: "loaded", message: "8 new, 8 changed (new version, previous closed), 134 unchanged" },
  { id: 14, at: "09:12:01.840", module: "Load & versioning", record: "payments", action: "loaded", message: "4 new, 71 unchanged" },
];

export const IMPORT_BATCHES: ImportBatch[] = [
  {
    id: "B-003",
    startedAt: "2026-10-18 14:32",
    source: "CSV · Technical_Challenge_Data",
    trigger: "Manual re-import",
    status: "skipped",
    durationMs: 61,
    rowsRead: 0,
    inserted: 0,
    updated: 0,
    unchanged: 357,
    duplicates: 0,
    corrected: 0,
    excluded: 0,
    review: 0,
    steps: [
      { ...STEPS_B002[0], result: "5 files · all hashes already imported in B-002" },
      ...STEPS_B002.slice(1).map((s) => ({ ...s, status: "skipped" as const, durationMs: 0, result: "Not run" })),
    ],
    files: FILES_B002.map((f) => ({ ...f, inserted: 0, updated: 0, unchanged: f.rows })),
    events: [
      { id: 1, at: "14:32:07.061", module: "File intake", record: "5 files", action: "skipped", message: "Identical sha256 to batch B-002 — nothing to import" },
    ],
  },
  {
    id: "B-002",
    startedAt: "2026-10-15 09:12",
    source: "CSV · Technical_Challenge_Data",
    trigger: "Scheduled export",
    status: "warnings",
    durationMs: 1840,
    rowsRead: 357,
    inserted: 12,
    updated: 8,
    unchanged: 335,
    duplicates: 2,
    corrected: 5,
    excluded: 8,
    review: 112,
    steps: STEPS_B002,
    files: FILES_B002,
    events: EVENTS_B002,
  },
  {
    id: "B-001",
    startedAt: "2026-09-15 09:10",
    source: "CSV · Technical_Challenge_Data",
    trigger: "Initial load",
    status: "warnings",
    durationMs: 2215,
    rowsRead: 345,
    inserted: 343,
    updated: 0,
    unchanged: 0,
    duplicates: 2,
    corrected: 5,
    excluded: 6,
    review: 97,
    steps: STEPS_B002.map((s) =>
      s.id === "load" ? { ...s, durationMs: 1702, result: "343 new" } : s,
    ),
    files: [
      { name: "reservations.csv", rows: 143, sha256: "5a90e1c4", inserted: 142, updated: 0, unchanged: 0, rejected: 0 },
      { name: "payments.csv", rows: 72, sha256: "b3f61a08", inserted: 71, updated: 0, unchanged: 0, rejected: 0 },
      { name: "expenses.csv", rows: 90, sha256: "c1a5e630", inserted: 90, updated: 0, unchanged: 0, rejected: 0 },
      { name: "properties.csv", rows: 20, sha256: "07d3f2be", inserted: 20, updated: 0, unchanged: 0, rejected: 0 },
      { name: "commission_rules.csv", rows: 20, sha256: "e86b0c57", inserted: 20, updated: 0, unchanged: 0, rejected: 0 },
    ],
    events: EVENTS_B002.slice(0, 9),
  },
];
