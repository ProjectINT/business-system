import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectCode } from "../testing/expect";
import { idrMoney } from "../testing/arbitraries";
import {
  add,
  compare,
  fromSafeInteger,
  idr,
  isNegative,
  isZero,
  money,
  neg,
  parseCurrency,
  parseMoney,
  sub,
  sum,
  toDecimalString,
  toSafeNumber,
  zero,
  type Currency,
} from "./money";

describe("parseMoney", () => {
  it.each<[string, Currency, bigint]>([
    ["10011978", "IDR", 10011978n],
    ["10011978.00", "IDR", 10011978n],
    ["-100000", "IDR", -100000n],
    ["-0", "IDR", 0n],
    ["4280874", "USD", 428087400n],
    ["12.5", "USD", 1250n],
    ["12.500", "USD", 1250n],
  ])("%s %s → %s", (text, currency, expected) => {
    expect(parseMoney(text, currency)).toEqual({ amount: expected, currency });
  });

  it("-0 has no negative zero", () => {
    expect(Object.is(Number(parseMoney("-0", "IDR").amount), -0)).toBe(false);
  });

  it.each<[string, Currency]>([
    ["10011978.50", "IDR"],
    ["1.005", "USD"],
  ])("%s %s → AMOUNT_SCALE", (text, currency) => expectCode(() => parseMoney(text, currency), "AMOUNT_SCALE"));

  it.each(["", " 1", "1 ", "+1", "1,000", "1e3", "0x10", ".5", "5.", "NaN", "Infinity", "١٢٣", "1_000", "--1"])(
    "%j → INVALID_AMOUNT",
    (text) => expectCode(() => parseMoney(text, "IDR"), "INVALID_AMOUNT"),
  );

  it.each(["RUB", "idr", "", "toString", "__proto__"])("currency %j → UNKNOWN_CURRENCY", (c) => {
    expectCode(() => parseMoney("1", c as Currency), "UNKNOWN_CURRENCY");
    expectCode(() => parseCurrency(c), "UNKNOWN_CURRENCY");
    expectCode(() => money(1n, c as Currency), "UNKNOWN_CURRENCY");
  });

  it("round trips through toDecimalString", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }), fc.constantFrom<Currency>("IDR", "USD"), (a, c) => {
        const m = money(a, c);
        expect(parseMoney(toDecimalString(m), c)).toEqual(m);
      }),
    );
  });
});

describe("fromSafeInteger / toSafeNumber", () => {
  it("accepts safe integers", () => {
    expect(fromSafeInteger(3602767, "IDR")).toEqual(idr(3602767n));
    expect(fromSafeInteger(-0, "IDR")).toEqual(idr(0n));
  });

  it.each([0.1, NaN, Infinity, -Infinity])("%s → INVALID_AMOUNT", (n) =>
    expectCode(() => fromSafeInteger(n, "IDR"), "INVALID_AMOUNT"),
  );

  it("2^53 → UNSAFE_NUMBER", () => {
    expectCode(() => fromSafeInteger(2 ** 53, "IDR"), "UNSAFE_NUMBER");
    expectCode(() => fromSafeInteger(1, "RUB" as Currency), "UNKNOWN_CURRENCY");
  });

  it("toSafeNumber guards the boundary in both directions", () => {
    expect(toSafeNumber(idr(9007199254740991n))).toBe(9007199254740991);
    expect(toSafeNumber(idr(-9007199254740991n))).toBe(-9007199254740991);
    expectCode(() => toSafeNumber(idr(2n ** 53n)), "UNSAFE_NUMBER");
    expectCode(() => toSafeNumber(idr(-(2n ** 53n))), "UNSAFE_NUMBER");
  });
});

describe("toDecimalString", () => {
  it.each<[bigint, Currency, string]>([
    [10011978n, "IDR", "10011978"],
    [-100000n, "IDR", "-100000"],
    [1250n, "USD", "12.50"],
    [5n, "USD", "0.05"],
    [-5n, "USD", "-0.05"],
    [0n, "USD", "0.00"],
  ])("%s %s → %s", (a, c, s) => expect(toDecimalString(money(a, c))).toBe(s));
});

describe("arithmetic", () => {
  it("rejects mixed currencies", () => {
    const usd = money(1n, "USD");
    expectCode(() => add(idr(1n), usd), "CURRENCY_MISMATCH");
    expectCode(() => sub(idr(1n), usd), "CURRENCY_MISMATCH");
    expectCode(() => compare(idr(1n), usd), "CURRENCY_MISMATCH");
    expectCode(() => sum([usd], "IDR"), "CURRENCY_MISMATCH");
  });

  it("sum is exact beyond 2^53", () => {
    expect(sum([], "IDR")).toEqual(zero("IDR"));
    expect(sum([idr(2n ** 53n), idr(1n)], "IDR").amount).toBe(9007199254740993n);
    expect(2 ** 53 + 1).toBe(2 ** 53); // what number would have done
  });

  it("compare, isZero, isNegative, neg", () => {
    expect(compare(idr(1n), idr(2n))).toBe(-1);
    expect(compare(idr(2n), idr(2n))).toBe(0);
    expect(compare(idr(3n), idr(2n))).toBe(1);
    expect(isZero(idr(0n))).toBe(true);
    expect(isZero(idr(-1n))).toBe(false);
    expect(isNegative(idr(-1n))).toBe(true);
    expect(isNegative(idr(0n))).toBe(false);
    expect(neg(idr(5n))).toEqual(idr(-5n));
  });

  it("does not mutate its inputs", () => {
    const a = Object.freeze(idr(1n));
    const b = Object.freeze(idr(2n));
    expect(add(a, b)).toEqual(idr(3n));
    expect(a).toEqual(idr(1n));
  });

  it("add is commutative and associative; sub undoes add; sum ignores order", () => {
    fc.assert(
      fc.property(idrMoney(), idrMoney(), idrMoney(), (a, b, c) => {
        expect(add(a, b)).toEqual(add(b, a));
        expect(add(add(a, b), c)).toEqual(add(a, add(b, c)));
        expect(sub(add(a, b), b)).toEqual(a);
      }),
    );
    fc.assert(
      fc.property(fc.array(idrMoney()), (list) => {
        expect(sum([...list].reverse(), "IDR")).toEqual(sum(list, "IDR"));
      }),
    );
  });
});
