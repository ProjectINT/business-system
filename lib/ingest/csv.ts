import { parse } from "csv-parse/sync";
import type { z } from "zod";
import { FIELDS, KEY_COLUMNS, SCHEMAS, type Entity, type Values } from "./entities";
import { IngestError } from "./errors";
import { rowHash, sha256 } from "./hash";
import type { IngestedRow, ParseIssue, ParsedFile } from "./types";

interface Record_ {
  readonly record: string[];
  readonly info: { readonly lines: number };
}

function newlines(text: string): number {
  let n = 0;
  for (const ch of text) if (ch === "\n") n++;
  return n;
}

/**
 * Parse the bytes of one source file. Never throws for a value: an unparsable cell becomes `null`
 * with a `ParseIssue` on its row. Throws `IngestError` only when the file is not a table:
 * malformed CSV, no header, or duplicate column names.
 */
export function parseCsv<E extends Entity>(entity: E, input: Uint8Array | string, fileName: string): ParsedFile<E> {
  const bytes = typeof input === "string" ? Buffer.from(input, "utf8") : input;

  let records: Record_[];
  try {
    records = parse(bytes, {
      bom: true,
      delimiter: ",",
      info: true,
      relax_column_count: true, // a short or long row is a row with an issue, not a failed file
      skip_empty_lines: true,
    }) as unknown as Record_[];
  } catch (e) {
    throw new IngestError("MALFORMED_CSV", fileName, (e as Error).message);
  }

  const head = records[0];
  if (!head) throw new IngestError("EMPTY_FILE", fileName, "no header line");
  const header = head.record.map((h) => h.trim());
  const duplicate = header.find((h, i) => header.indexOf(h) !== i);
  if (duplicate !== undefined) throw new IngestError("DUPLICATE_COLUMN", fileName, `column "${duplicate}" appears twice`);

  const fields = FIELDS[entity];
  const shape = SCHEMAS[entity].shape as Readonly<Record<string, z.ZodType>>;
  const missingColumns = fields.filter((f) => !header.includes(f));
  const extraColumns = header.filter((h) => !fields.includes(h));

  const rows: IngestedRow<Values<E>>[] = records.slice(1).map(({ record, info }) => {
    // `info.lines` is the physical line where the record ends; quoted fields may span lines.
    const lineNo = info.lines - record.reduce((n, cell) => n + newlines(cell), 0);
    const raw: Record<string, string> = {};
    header.forEach((column, i) => {
      const cell = record[i];
      if (cell !== undefined) raw[column] = cell;
    });

    const issues: ParseIssue[] = [];
    if (record.length !== header.length) {
      issues.push({ field: null, value: null, message: `${record.length} cells, header has ${header.length}` });
    }

    const values: Record<string, unknown> = {};
    for (const column of fields) {
      const text = raw[column];
      if (text === undefined) {
        values[column] = null;
        issues.push({ field: column, value: null, message: "column missing" });
        continue;
      }
      const parsed = shape[column]!.safeParse(text);
      if (parsed.success) {
        values[column] = parsed.data;
      } else {
        values[column] = null;
        issues.push({ field: column, value: text, message: parsed.error.issues.map((i) => i.message).join("; ") });
      }
    }

    const keyParts = KEY_COLUMNS[entity].map((c) => (raw[c] ?? "").trim());
    const recordKey = keyParts.every((p) => p !== "") ? keyParts.join("@") : null;

    return {
      unitId: `${fileName}:${lineNo}`,
      entity,
      fileName,
      lineNo,
      recordKey,
      raw,
      rowHash: rowHash(entity, raw),
      values: values as Values<E>,
      issues,
    };
  });

  return {
    file: {
      entity,
      fileName,
      sha256: sha256(bytes),
      byteSize: bytes.byteLength,
      header,
      rowCount: rows.length,
      missingColumns,
      extraColumns,
    },
    rows,
  };
}
