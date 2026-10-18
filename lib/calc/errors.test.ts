import { describe, expect, it } from "vitest";
import { calculateManagementFee, resolveCommissionRule } from "./commission";
import { assertNever, CALC_ERROR_CODES, CalcError, invariant, isCalcError, type CalcErrorCode } from "./errors";
import { assertPolicies, DEFAULT_POLICIES, type CalcPolicies } from "./policies";
import { allocate, allocateByWeights } from "./primitives/allocate";
import { parseDate, period } from "./primitives/calendar";
import { add, fromSafeInteger, idr, money, parseMoney, type Currency } from "./primitives/money";
import { parseRate } from "./primitives/rate";
import { roundDiv } from "./primitives/rounding";
import { calculateReservation } from "./reservation";
import { expectCode } from "./testing/expect";
import { date, RULES, synthetic } from "./testing/fixtures";
import type { CommissionRuleInput, ReservationInput } from "./types";

const rule = RULES[0] as CommissionRuleInput;

/** Adding a code without a test here does not compile. */
const TRIGGERS = {
  INVALID_AMOUNT: () => parseMoney("1e3", "IDR"),
  AMOUNT_SCALE: () => parseMoney("100.50", "IDR"),
  UNSAFE_NUMBER: () => fromSafeInteger(2 ** 53, "IDR"),
  UNKNOWN_CURRENCY: () => parseMoney("1", "RUB" as Currency),
  CURRENCY_MISMATCH: () => add(idr(1n), money(1n, "USD")),
  INVALID_RATE: () => parseRate("17%"),
  INVALID_DIVISOR: () => roundDiv(1n, 0n, "half-up"),
  INVALID_DATE: () => parseDate("2026-02-30"),
  INVALID_PERIOD: () => period(date("2026-10-01"), date("2026-09-30")),
  INVALID_STAY: () => calculateReservation(synthetic({ checkOut: synthetic().checkIn }), RULES, DEFAULT_POLICIES),
  EMPTY_ALLOCATION: () => allocate(idr(1n), 0),
  INVALID_WEIGHTS: () => allocateByWeights(idr(1n), [0n, 0n]),
  NO_COMMISSION_RULE: () => resolveCommissionRule(RULES, "V011", date("2027-01-05")),
  AMBIGUOUS_COMMISSION_RULE: () => resolveCommissionRule([rule, rule], rule.propertyId, rule.effectiveFrom),
  UNSUPPORTED_FEE_BASIS: () =>
    calculateManagementFee({ gross: idr(1n) }, { ...rule, feeBasis: "net_revenue" as "gross_booking_value" }, "half-up"),
  UNKNOWN_STATUS: () =>
    calculateReservation(synthetic({ status: "pending" as ReservationInput["status"] }), RULES, DEFAULT_POLICIES),
  INVALID_POLICY: () => assertPolicies({ ...DEFAULT_POLICIES, rounding: "up" as CalcPolicies["rounding"] }),
  RECORD_NOT_ADMITTED: () =>
    calculateReservation(synthetic({ dqStatus: "excluded" as ReservationInput["dqStatus"] }), RULES, DEFAULT_POLICIES),
  INVARIANT_VIOLATION: () => invariant(false, "test"),
} satisfies Record<CalcErrorCode, () => unknown>;

describe("CalcError", () => {
  it("every code has a trigger and the list has no extras", () => {
    expect(Object.keys(TRIGGERS).sort()).toEqual([...CALC_ERROR_CODES].sort());
  });

  it.each(CALC_ERROR_CODES)("%s", (code) => expectCode(TRIGGERS[code], code));

  it("is an Error with serializable details", () => {
    try {
      parseMoney("10011978.50", "IDR");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(isCalcError(e)).toBe(true);
      const err = e as CalcError;
      expect(err.name).toBe("CalcError");
      expect(err.message).toMatch(/10011978\.50/);
      expect(() => JSON.stringify(err.details)).not.toThrow();
      expect(err.details).toEqual({ text: "10011978.50", currency: "IDR", scale: 0 });
    }
    expect(new CalcError("INVALID_AMOUNT", "x").details).toEqual({});
    expect(isCalcError(new TypeError("x"))).toBe(false);
  });

  it("invariant passes on true, assertNever throws the given code", () => {
    expect(() => invariant(true, "ok")).not.toThrow();
    expectCode(() => assertNever("x" as never, "UNKNOWN_STATUS", "status"), "UNKNOWN_STATUS");
  });
});
