// Compile-time guarantees, checked by `npm run typecheck:calc` (an unused @ts-expect-error fails it).
import { describe, expectTypeOf, it } from "vitest";
import { assertNever } from "./errors";
import { add, idr, type Money } from "./primitives/money";
import { parseDate, type CalendarDate } from "./primitives/calendar";
import type { ReservationInput } from "./types";

function compileOnly(): void {
  // @ts-expect-error number is not Money
  add(idr(1n), 5);

  const m: Money = idr(1n);
  // @ts-expect-error bigint + number
  void (m.amount + 1);

  // @ts-expect-error a plain string is not a CalendarDate
  const d: CalendarDate = "2026-09-01";
  void d;

  const label = (s: ReservationInput["status"]): string => {
    switch (s) {
      case "confirmed":
      case "modified":
        return "active";
      default:
        // @ts-expect-error 'cancelled' is not handled
        return assertNever(s, "UNKNOWN_STATUS", "status");
    }
  };
  void label;

  // @ts-expect-error inputs are readonly
  idr(1n).amount = 2n;
}

describe("types", () => {
  it("are enforced by the compiler", () => {
    void compileOnly;
    expectTypeOf(parseDate).returns.toEqualTypeOf<CalendarDate>();
    expectTypeOf<CalendarDate>().not.toEqualTypeOf<string>();
    expectTypeOf<Money["amount"]>().toEqualTypeOf<bigint>();
  });
});
