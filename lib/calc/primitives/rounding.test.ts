import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { roundDiv, type RoundingMode } from "./rounding";
import { expectCode } from "../testing/expect";

const T64 = 2n ** 64n;

describe("roundDiv", () => {
  it.each<[bigint, bigint, bigint, bigint]>([
    [25n, 10n, 3n, 2n],
    [35n, 10n, 4n, 4n],
    [-25n, 10n, -3n, -2n],
    [-35n, 10n, -4n, -4n],
    [24n, 10n, 2n, 2n],
    [26n, 10n, 3n, 3n],
    [-26n, 10n, -3n, -3n],
    [0n, 7n, 0n, 0n],
    [T64 * 10n + 5n, 10n, T64 + 1n, T64],
  ])("%s / %s → half-up %s, half-even %s", (n, d, up, even) => {
    expect(roundDiv(n, d, "half-up")).toBe(up);
    expect(roundDiv(n, d, "half-even")).toBe(even);
  });

  it.each([0n, -5n])("divisor %s → INVALID_DIVISOR", (d) => expectCode(() => roundDiv(10n, d, "half-up"), "INVALID_DIVISOR"));

  it("unknown mode → INVALID_POLICY", () =>
    expectCode(() => roundDiv(5n, 10n, "up" as RoundingMode), "INVALID_POLICY"));

  it("is within half a unit and symmetric", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 24n), max: 10n ** 24n }),
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        fc.constantFrom<RoundingMode>("half-up", "half-even"),
        (n, d, mode) => {
          const q = roundDiv(n, d, mode);
          const err = n - q * d;
          expect(2n * (err < 0n ? -err : err) <= d).toBe(true);
          expect(roundDiv(-n, d, mode)).toBe(-q);
        },
      ),
    );
  });
});
