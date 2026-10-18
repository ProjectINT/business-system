export const DQ_ERROR_CODES = [
  "BAD_RULE_ID",
  "DUPLICATE_RULE",
  "UNKNOWN_DEPENDENCY",
  "DEPENDENCY_CYCLE",
  "UNKNOWN_UNIT",
  "NO_AS_OF",
] as const;

export type DqErrorCode = (typeof DQ_ERROR_CODES)[number];

/** A failure of the module's own setup: a bad registry, an unknown unit. Data problems never throw. */
export class DqError extends Error {
  override readonly name = "DqError";

  constructor(
    readonly code: DqErrorCode,
    message: string,
    readonly details: Readonly<Record<string, string | number | null>> = {},
  ) {
    super(message);
  }
}
