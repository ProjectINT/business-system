// Source rows as received (page /raw-data): every cell as text under the file's own header, with the
// status the checks gave the row and the rules that failed on it. Nothing is corrected.
import { ENTITIES } from "../ingest";
import type { RowEntity, Status } from "../dq";
import type { FailedRule, Snapshot } from "./types";

export interface RawRow {
  readonly unitId: string;
  readonly lineNo: number;
  readonly recordKey: string | null;
  /** Cells in header order; "" where the row has no value. */
  readonly cells: readonly string[];
  readonly status: Status;
  readonly failed: readonly FailedRule[];
}

export interface RawTable {
  readonly entity: RowEntity;
  readonly fileName: string;
  readonly header: readonly string[];
  readonly rows: readonly RawRow[];
}

export function rawTablesOf(snapshot: Snapshot): RawTable[] {
  const recordOf = new Map(snapshot.records.map((r) => [r.unitId, r]));
  return ENTITIES.map((entity) => {
    const file = snapshot.dataset.files[entity];
    const rows = snapshot.dataset.rows[entity].map((row): RawRow => {
      const record = recordOf.get(row.unitId)!;
      return {
        unitId: row.unitId,
        lineNo: row.lineNo,
        recordKey: row.recordKey,
        cells: file.header.map((column) => row.raw[column] ?? ""),
        status: record.status,
        failed: record.failed,
      };
    });
    return { entity, fileName: file.fileName, header: file.header, rows };
  });
}
