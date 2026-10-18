export type IngestErrorCode = "FILE_NOT_FOUND" | "EMPTY_FILE" | "MALFORMED_CSV" | "DUPLICATE_COLUMN";

/** A file-level failure: the file cannot be read as a table at all. Value-level problems never throw. */
export class IngestError extends Error {
  readonly code: IngestErrorCode;
  readonly fileName: string;

  constructor(code: IngestErrorCode, fileName: string, message: string) {
    super(`${fileName}: ${message}`);
    this.name = "IngestError";
    this.code = code;
    this.fileName = fileName;
  }
}
