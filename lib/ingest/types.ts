import type { Entity, Values } from "./entities";

/** A value that did not parse. The row keeps going with `null` in its place; DQ-03 raises it. */
export interface ParseIssue {
  readonly field: string | null; // null — the row as a whole (cell count differs from the header)
  readonly value: string | null; // text as in the file; null when the column is absent
  readonly message: string;
}

export interface IngestedRow<T> {
  /** `${fileName}:${lineNo}` — the level-1 unit id (VALIDATION_PLAN.md 3). */
  readonly unitId: string;
  readonly entity: Entity;
  readonly fileName: string;
  /** Physical line where the record starts; the header is line 1 (as `raw_record.line_no`). */
  readonly lineNo: number;
  /** Natural key as in the file, trimmed; null when any key column is empty (as `raw_record.record_key`). */
  readonly recordKey: string | null;
  /** Values as text under the source column names, untouched (as `raw_record.payload`). */
  readonly raw: Readonly<Record<string, string>>;
  /** sha256 of the canonical target fields (IMPORT_PLAN.md 6; as `raw_record.row_hash`). */
  readonly rowHash: string;
  readonly values: T;
  readonly issues: readonly ParseIssue[];
}

export interface IngestedFile {
  readonly entity: Entity;
  readonly fileName: string;
  readonly sha256: string; // of the bytes as read, BOM included (as `import_file.file_sha256`)
  readonly byteSize: number;
  readonly header: readonly string[]; // columns in file order, trimmed
  readonly rowCount: number; // data rows, header excluded (as `import_file.row_count`)
  readonly missingColumns: readonly string[]; // target columns absent from the header
  readonly extraColumns: readonly string[]; // header columns outside the target format (kept in `raw`, not hashed)
}

export interface ParsedFile<E extends Entity> {
  readonly file: IngestedFile;
  readonly rows: readonly IngestedRow<Values<E>>[];
}

export interface Dataset {
  readonly dir: string;
  readonly files: { readonly [E in Entity]: IngestedFile };
  readonly rows: { readonly [E in Entity]: readonly IngestedRow<Values<E>>[] };
}
