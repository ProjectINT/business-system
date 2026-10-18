// Public API of the loader (docs/ROADMAP.md, phase 1; PLAN.md 10). Import only from "@/lib/ingest".
//
// CSV → rows with the file, line number, raw values, rowHash and typed values. Unparsable values
// become `null` with an issue on the row (DQ-03 raises it); only a file that is not a table throws.
export { parseCsv } from "./csv";
export {
  ENTITIES,
  FIELDS,
  FILE_NAMES,
  KEY_COLUMNS,
  SCHEMAS,
  type CommissionRuleValues,
  type Entity,
  type ExpenseValues,
  type PaymentValues,
  type PropertyValues,
  type ReservationValues,
  type Values,
} from "./entities";
export { IngestError, type IngestErrorCode } from "./errors";
export { canonicalRow, rowHash, sha256 } from "./hash";
export { DEFAULT_DATA_DIR, loadDataset, loadFile } from "./load";
export type * from "./types";
