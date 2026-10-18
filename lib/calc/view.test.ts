import { describe, expect, expectTypeOf, it } from "vitest";
import { calculateOverview } from "./overview";
import { DEFAULT_POLICIES } from "./policies";
import { idr } from "./primitives/money";
import { parseRate } from "./primitives/rate";
import { calculateReservation } from "./reservation";
import { expectCode } from "./testing/expect";
import { EXP, PAY, RES, RULES, scope } from "./testing/fixtures";
import { toView } from "./view";

describe("toView", () => {
  it("turns Money into number, Rate into a string, Set into an array", () => {
    const v = toView({ m: idr(5n), r: parseRate("0.17"), s: new Set(["V011"]), list: [idr(1n)], n: null, t: "x", k: 3 });
    expect(v).toEqual({ m: 5, r: "0.17", s: ["V011"], list: [1], n: null, t: "x", k: 3 });
    expectTypeOf(v.m).toEqualTypeOf<number>();
    expectTypeOf(v.r).toEqualTypeOf<string>();
  });

  it("makes the overview JSON-serializable", () => {
    const o = calculateOverview(
      { reservations: Object.values(RES), commissionRules: RULES, payments: Object.values(PAY), expenses: Object.values(EXP) },
      scope(),
      DEFAULT_POLICIES,
    );
    expect(() => JSON.stringify(o)).toThrow(TypeError);
    const v = toView(o);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    expect(v.portfolio.accruals.gross).toBe(Number(o.portfolio.accruals.gross.amount));
    expectTypeOf(v.portfolio.accruals.gross).toEqualTypeOf<number>();
    expectTypeOf(v.scope.asOf).toEqualTypeOf<typeof o.scope.asOf>(); // a calendar date stays a string, not an object
    expectTypeOf(v.scope.asOf).toExtend<string>();
  });

  it("keeps a reservation's shape", () => {
    const v = toView(calculateReservation(RES.R0020, RULES, DEFAULT_POLICIES));
    expect(v.managementFee).toBe(612470);
    expect(v.rate).toBe("0.17");
    expect(v.lines[0]?.gross).toBe(1200923);
  });

  it("refuses unsafe amounts and bare bigint", () => {
    expectCode(() => toView({ m: idr(2n ** 53n) }), "UNSAFE_NUMBER");
    expectCode(() => toView({ b: 1n }), "INVARIANT_VIOLATION");
  });
});
