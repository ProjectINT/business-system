import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES, type CalcPolicies } from "./policies";
import { idr, money, sub, sum } from "./primitives/money";
import {
  calculateExpectedPayout,
  calculateNetRental,
  calculateOwnerShare,
  calculateReservation,
  calculateReservations,
} from "./reservation";
import { reservation, rules as ruleSets } from "./testing/arbitraries";
import { expectCode } from "./testing/expect";
import { date, deepFreeze, RES, RULES, synthetic } from "./testing/fixtures";
import type { ReservationCalc, ReservationInput } from "./types";

const calc = (r: ReservationInput, policies: CalcPolicies = DEFAULT_POLICIES) => calculateReservation(r, RULES, policies);
const nightAmounts = (c: ReservationCalc, key: "gross" | "refund" | "otaFee" | "managementFee") =>
  c.lines.map((l) => l[key].amount);

describe("formulas", () => {
  const r = { gross: idr(1000n), refund: idr(100n), otaFee: idr(150n) };
  it("net rental, expected payout and owner share", () => {
    expect(calculateNetRental(r)).toEqual(idr(750n));
    expect(calculateExpectedPayout(r)).toEqual(idr(750n));
    expect(calculateOwnerShare(r, idr(170n))).toEqual(idr(580n));
  });
});

describe("calculateReservation", () => {
  it("R0020 end to end", () => {
    const c = calc(RES.R0020);
    expect(c).toMatchObject({
      nights: 3,
      active: true,
      dqStatus: "clean",
      managementFee: idr(612470n),
      netRental: idr(2990297n),
      expectedPayout: idr(2990297n),
      ownerShare: idr(2377827n),
      cancelled: null,
    });
    expect(nightAmounts(c, "gross")).toEqual([1200923n, 1200922n, 1200922n]);
    expect(c.lines.map((l) => l.date)).toEqual(["2026-09-12", "2026-09-13", "2026-09-14"]);
    expect(c.lines.every((l) => l.nights === 1)).toBe(true);
  });

  it("R0143 (modified) is calculated like confirmed", () => {
    const modified = calc(RES.R0143);
    const confirmed = calc({ ...RES.R0143, status: "confirmed" });
    expect(modified).toEqual(confirmed);
    expect(modified.managementFee).toEqual(idr(1182360n));
  });

  it("R0131 (cancelled, full refund): nothing recognised, source kept for reference", () => {
    const c = calc(RES.R0131);
    expect(c).toMatchObject({
      active: false,
      rate: null,
      gross: idr(0n),
      refund: idr(0n),
      otaFee: idr(0n),
      managementFee: idr(0n),
      netRental: idr(0n),
      expectedPayout: idr(0n),
      ownerShare: idr(0n),
      lines: [],
      cancelled: { gross: idr(6699678n), refund: idr(6699678n), retained: idr(0n) },
    });
  });

  it("cancellation with a partial refund keeps the retained part visible", () => {
    const c = calc(synthetic({ status: "cancelled", refund: idr(7000000n) }));
    expect(c.cancelled?.retained).toEqual(idr(924759n));
    expect(c.gross).toEqual(idr(0n));
  });

  it("R0102: negative OTA fee is calculated as is", () => {
    const c = calc(RES.R0102);
    expect(c.netRental).toEqual(idr(3998667n));
    expect(c.expectedPayout).toEqual(idr(3998667n));
    expect(c.managementFee).toEqual(idr(662773n));
    expect(nightAmounts(c, "otaFee")).toEqual([-25000n, -25000n, -25000n, -25000n]);
  });

  it("refund on an active reservation reduces revenue and is spread like GBV", () => {
    const c = calc(
      synthetic({ checkIn: date("2026-09-10"), checkOut: date("2026-09-13"), gross: idr(1000n), refund: idr(100n), otaFee: idr(0n) }),
    );
    expect(c.netRental).toEqual(idr(900n));
    expect(nightAmounts(c, "refund")).toEqual([34n, 33n, 33n]);
    expect(c.managementFee).toEqual(idr(170n)); // MF on GBV, PLAN.md 7.4; open question mf_base_on_refunds
  });

  it("'checkout' recognition puts the whole stay on the check-out date", () => {
    const c = calc(RES.R0018, { ...DEFAULT_POLICIES, revenueRecognition: "checkout" });
    expect(c.lines).toEqual([
      {
        date: "2026-10-04",
        nights: 6,
        gross: idr(14989658n),
        refund: idr(0n),
        otaFee: idr(2248449n),
        managementFee: idr(2548242n),
      },
    ]);
  });

  it("'half-even' rounding changes MF only on exact halves", () => {
    const half = synthetic({ gross: idr(50n), otaFee: idr(0n) });
    expect(calc(half).managementFee).toEqual(idr(9n));
    expect(calc(half, { ...DEFAULT_POLICIES, rounding: "half-even" }).managementFee).toEqual(idr(8n));
  });

  it("rejects bad records with a code", () => {
    expectCode(() => calc(synthetic({ checkOut: synthetic().checkIn })), "INVALID_STAY");
    expectCode(() => calc(synthetic({ checkOut: date("2026-09-19") })), "INVALID_STAY");
    expectCode(() => calc(synthetic({ otaFee: money(1n, "USD") })), "CURRENCY_MISMATCH");
    expectCode(() => calc(synthetic({ refund: money(1n, "USD") })), "CURRENCY_MISMATCH");
    expectCode(() => calc(synthetic({ gross: { amount: 1n, currency: "RUB" as "IDR" } })), "UNKNOWN_CURRENCY");
    expectCode(() => calc(synthetic({ status: "pending" as ReservationInput["status"] })), "UNKNOWN_STATUS");
    expectCode(() => calc(synthetic({ dqStatus: "excluded" as ReservationInput["dqStatus"] })), "RECORD_NOT_ADMITTED");
    expectCode(() => calc(synthetic({ checkIn: date("2027-01-05"), checkOut: date("2027-01-08") })), "NO_COMMISSION_RULE");
    expectCode(
      () => calc(synthetic(), { ...DEFAULT_POLICIES, revenueRecognition: "x" as CalcPolicies["revenueRecognition"] }),
      "INVALID_POLICY",
    );
  });

  it("does not mutate its input", () => {
    const r = deepFreeze({ ...RES.R0018 });
    expect(() => calc(r)).not.toThrow();
    expect(Object.isFrozen(RES.R0018.gross)).toBe(true);
  });

  it("night lines sum to the reservation; netRental and payout identities", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }).chain(reservation), ruleSets, (r, rules) => {
        const c = calculateReservation(r, rules, DEFAULT_POLICIES);
        for (const key of ["gross", "refund", "otaFee", "managementFee"] as const) {
          expect(sum(c.lines.map((l) => l[key]), "IDR")).toEqual(c[key]);
        }
        expect(c.netRental).toEqual(sub(sub(c.gross, c.refund), c.otaFee));
        expect(c.expectedPayout).toEqual(c.netRental);
        expect(c.lines.length).toBe(c.active ? c.nights : 0);
      }),
    );
  });
});

describe("calculateReservations", () => {
  it("one broken reservation goes to failures with its amount; the rest are unchanged", () => {
    const broken = synthetic({ reservationId: "X0002", checkIn: date("2027-01-05"), checkOut: date("2027-01-08") });
    const batch = calculateReservations([RES.R0020, broken, RES.R0067], RULES, DEFAULT_POLICIES);
    expect(batch.results).toEqual([calc(RES.R0020), calc(RES.R0067)]);
    expect(batch.failures).toEqual([
      {
        entity: "reservation",
        recordId: "X0002",
        propertyId: "V011",
        code: "NO_COMMISSION_RULE",
        message: expect.any(String),
        amount: broken.gross,
      },
    ]);
  });

  it("non-CalcError exceptions are bugs and are rethrown", () => {
    const poisoned = {
      ...synthetic(),
      get checkIn(): never {
        throw new TypeError("boom");
      },
    } as ReservationInput;
    expect(() => calculateReservations([poisoned], RULES, DEFAULT_POLICIES)).toThrow(TypeError);
  });

  it("rejects bad policies for the whole batch", () =>
    expectCode(
      () => calculateReservations([], RULES, { ...DEFAULT_POLICIES, rounding: "x" as CalcPolicies["rounding"] }),
      "INVALID_POLICY",
    ));
});
