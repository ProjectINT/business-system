import { expect } from "vitest";
import { CalcError, type CalcErrorCode } from "../errors";

/** Asserts fn throws a CalcError with exactly this code. */
export function expectCode(fn: () => unknown, code: CalcErrorCode): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CalcError);
    expect((e as CalcError).code).toBe(code);
    return;
  }
  throw new Error(`Expected CalcError ${code}, nothing was thrown`);
}
