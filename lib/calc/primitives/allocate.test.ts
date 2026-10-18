import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectCode } from "../testing/expect";
import { allocate, allocateByWeights } from "./allocate";
import { idr } from "./money";

const amounts = (parts: { amount: bigint }[]) => parts.map((p) => p.amount);

describe("allocate", () => {
  it.each<[bigint, number, bigint[]]>([
    [10n, 3, [4n, 3n, 3n]],
    [-10n, 3, [-4n, -3n, -3n]],
    [2n, 5, [1n, 1n, 0n, 0n, 0n]],
    [0n, 4, [0n, 0n, 0n, 0n]],
    [7924759n, 4, [1981190n, 1981190n, 1981190n, 1981189n]], // R0067
    [14989658n, 6, [2498277n, 2498277n, 2498276n, 2498276n, 2498276n, 2498276n]], // R0018
    [-100000n, 4, [-25000n, -25000n, -25000n, -25000n]], // R0102
  ])("%s into %s → %s", (total, n, expected) => {
    expect(amounts(allocate(idr(total), n))).toEqual(expected);
  });

  it.each([0, -1, 1.5, NaN])("%s parts → EMPTY_ALLOCATION", (n) =>
    expectCode(() => allocate(idr(10n), n), "EMPTY_ALLOCATION"),
  );

  it("keeps the currency", () => {
    expect(allocate(idr(3n), 2).every((p) => p.currency === "IDR")).toBe(true);
  });

  it("sums to total, has n parts, differs by at most 1, keeps the sign", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }), fc.integer({ min: 1, max: 60 }), (t, n) => {
        const parts = amounts(allocate(idr(t), n));
        expect(parts).toHaveLength(n);
        expect(parts.reduce((a, b) => a + b, 0n)).toBe(t);
        const max = parts.reduce((a, b) => (a > b ? a : b));
        const min = parts.reduce((a, b) => (a < b ? a : b));
        expect(max - min <= 1n).toBe(true);
        for (const p of parts) expect(t >= 0n ? p >= 0n : p <= 0n).toBe(true);
      }),
    );
  });
});

describe("allocateByWeights", () => {
  it.each<[bigint, bigint[], bigint[]]>([
    [100n, [1n, 1n, 1n], [34n, 33n, 33n]],
    [100n, [0n, 1n, 1n], [0n, 50n, 50n]],
    [100n, [2n, 1n], [67n, 33n]],
    [100n, [1n, 2n], [33n, 67n]],
    [-100n, [2n, 1n], [-67n, -33n]],
  ])("%s by %s → %s", (total, weights, expected) => {
    expect(amounts(allocateByWeights(idr(total), weights))).toEqual(expected);
  });

  it("rejects empty and invalid weights", () => {
    expectCode(() => allocateByWeights(idr(1n), []), "EMPTY_ALLOCATION");
    expectCode(() => allocateByWeights(idr(1n), [0n, 0n]), "INVALID_WEIGHTS");
    expectCode(() => allocateByWeights(idr(1n), [-1n, 2n]), "INVALID_WEIGHTS");
  });

  it("sums to total, zero weight gets zero, each part is within 1 of its exact share", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }),
        fc.array(fc.bigInt({ min: 0n, max: 1000n }), { minLength: 1, maxLength: 30 }).filter((w) => w.some((x) => x > 0n)),
        (t, weights) => {
          const parts = amounts(allocateByWeights(idr(t), weights));
          const w = weights.reduce((a, b) => a + b, 0n);
          expect(parts.reduce((a, b) => a + b, 0n)).toBe(t);
          parts.forEach((p, i) => {
            const wi = weights[i] as bigint;
            if (wi === 0n) expect(p).toBe(0n);
            const dev = p * w - t * wi; // (part − exact share) × W
            expect((dev < 0n ? -dev : dev) < w).toBe(true);
          });
        },
      ),
    );
  });
});
