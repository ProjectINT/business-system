export const CALC_ERROR_CODES = [
  "INVALID_AMOUNT",
  "AMOUNT_SCALE",
  "UNSAFE_NUMBER",
  "UNKNOWN_CURRENCY",
  "CURRENCY_MISMATCH",
  "INVALID_RATE",
  "INVALID_DIVISOR",
  "INVALID_DATE",
  "INVALID_PERIOD",
  "INVALID_STAY",
  "EMPTY_ALLOCATION",
  "INVALID_WEIGHTS",
  "NO_COMMISSION_RULE",
  "AMBIGUOUS_COMMISSION_RULE",
  "UNSUPPORTED_FEE_BASIS",
  "UNKNOWN_STATUS",
  "INVALID_POLICY",
  "RECORD_NOT_ADMITTED",
  "INVARIANT_VIOLATION",
] as const;

export type CalcErrorCode = (typeof CALC_ERROR_CODES)[number];

/** Only serializable values: amounts go in as decimal strings. */
export type CalcErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export class CalcError extends Error {
  override readonly name = "CalcError";

  constructor(
    readonly code: CalcErrorCode,
    message: string,
    readonly details: CalcErrorDetails = {},
  ) {
    super(message);
  }
}

export function isCalcError(e: unknown): e is CalcError {
  return e instanceof CalcError;
}

/** Internal check: a failure means a bug in the module, not bad input. */
export function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new CalcError("INVARIANT_VIOLATION", message);
}

/**
 * Exhaustiveness guard for switches over unions. The compiler rejects a missing case;
 * at runtime an unexpected value (bad cast, old data) becomes a coded error.
 */
export function assertNever(value: never, code: CalcErrorCode, what: string): never {
  throw new CalcError(code, `Unexpected ${what}: ${String(value)}`, { [what]: String(value) });
}
