import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectCode } from "../testing/expect";
import { idr, money } from "./money";
import { applyRate, exceedsShare, parseRate, rateToString } from "./rate";

describe("parseRate", () => {
  it.each<[string, bigint, bigint]>([
    ["0.17", 17n, 100n],
    ["0.2", 2n, 10n],
    ["0.1700", 17n, 100n],
    ["0", 0n, 1n],
    ["0.0", 0n, 1n],
    ["0.9999", 9999n, 10000n],
    ["0.0725", 725n, 10000n],
  ])("%s → %s/%s", (text, num, den) => expect(parseRate(text)).toEqual({ num, den }));

  it.each(["1", "-0.1", "0.12345", ".17", "17%", "0,17", "", "1.0", "0.", " 0.17", "00.17"])("%j → INVALID_RATE", (t) =>
    expectCode(() => parseRate(t), "INVALID_RATE"),
  );

  it.each(["0.17", "0.2", "0", "0.0725", "0.9999"])("rateToString(parseRate(%s)) round trips", (t) =>
    expect(rateToString(parseRate(t))).toBe(t),
  );
});

describe("applyRate", () => {
  const r = parseRate;
  it.each<[bigint, string, bigint, number]>([
    [3602767n, "0.17", 612470n, 3602767 * 0.17], // R0020
    [6955058n, "0.17", 1182360n, 6955058 * 0.17], // R0143
    [8309300n, "0.17", 1412581n, 8309300 * 0.17], // R0110
    [50n, "0.29", 15n, 50 * 0.29],
    [90n, "0.35", 32n, 90 * 0.35],
    [200n, "0.0725", 15n, 200 * 0.0725],
    [50n, "0.17", 9n, 50 * 0.17],
    [-100000n, "0.17", -17000n, -100000 * 0.17],
  ])("%s × %s → %s (half-up)", (amount, rate, expected) => {
    expect(applyRate(idr(amount), r(rate), "half-up")).toEqual(idr(expected));
  });

  it("is where Math.round on number goes wrong", () => {
    expect(Math.round(50 * 0.29)).toBe(14);
    expect(Math.round(90 * 0.35)).toBe(31);
    expect(Math.round(200 * 0.0725)).toBe(14);
  });

  it("half-even differs only on exact halves", () => {
    expect(applyRate(idr(50n), r("0.17"), "half-even")).toEqual(idr(8n));
    expect(applyRate(idr(3602767n), r("0.17"), "half-even")).toEqual(idr(612470n));
  });

  it("is monotonic; zero amount or zero rate gives zero", () => {
    const rate = fc.integer({ min: 0, max: 9999 }).map((n) => ({ num: BigInt(n), den: 10000n }));
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }), fc.bigInt({ min: 0n, max: 10n ** 18n }), rate, (a, delta, rt) => {
        expect(applyRate(idr(a + delta), rt, "half-up").amount >= applyRate(idr(a), rt, "half-up").amount).toBe(true);
        expect(applyRate(idr(0n), rt, "half-up")).toEqual(idr(0n));
        expect(applyRate(idr(a), parseRate("0"), "half-even")).toEqual(idr(0n));
      }),
    );
  });
});

describe("exceedsShare", () => {
  it("compares shares by cross multiplication", () => {
    expect(exceedsShare(idr(26n), idr(100n), parseRate("0.25"))).toBe(true);
    expect(exceedsShare(idr(25n), idr(100n), parseRate("0.25"))).toBe(false);
    expectCode(() => exceedsShare(idr(1n), money(1n, "USD"), parseRate("0.25")), "CURRENCY_MISMATCH");
  });
});
