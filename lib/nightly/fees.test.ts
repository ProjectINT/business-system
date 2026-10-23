import fc from "fast-check";
import { describe, expect, it } from "vitest";
import publicCase from "../../final-test/case_public.json";
import { addDays, parseDate } from "../calc";
import { nightLines, type NightLine } from "./fees";
import { parseCase, type CommissionRule, type ReservationEvent } from "./schema";
import { rawCase, rawEvent, type Raw } from "./testing/fixtures";
import type { ExceptionCode } from "./types";

const parsed = parseCase(publicCase);
/** V01: 1700 bps in November, 2000 in December; V02: 1000 bps for both months. */
const RULES = parsed.commission_rules;
const R101 = parsed.reservation_events[2]!; // E_R101_V2: V01, 2026-11-29..2026-12-03, 4 400 000 / 440 000 / 660 000
const R202 = parsed.reservation_events[3]!; // V02, 2026-12-10..2026-12-12, 2 000 000 / 200 000 / 0

/** E_R101_V2 with overrides, parsed the way the CLI parses it. */
function snapshot(overrides: Raw = {}): ReservationEvent {
  return parseCase(rawCase({ reservation_events: [rawEvent(overrides)] })).reservation_events[0]!;
}

function rule(property_id: string, from: string, to: string | null, rate_bps: number): CommissionRule {
  return { property_id, effective_from: parseDate(from), effective_to: to === null ? null : parseDate(to), rate_bps };
}

function accepted(s: ReservationEvent, rules: readonly CommissionRule[] = RULES): readonly NightLine[] {
  const r = nightLines(s, rules);
  if (r.hold) throw new Error(`held: ${r.codes.join(", ")}`);
  return r.nights;
}

function held(s: ReservationEvent, rules: readonly CommissionRule[]): readonly ExceptionCode[] {
  const r = nightLines(s, rules);
  if (!r.hold) throw new Error("expected the reservation to be held");
  return r.codes;
}

type Amount = "accommodation_gross_idr" | "pbjt_idr" | "ota_fee_idr" | "management_fee_idr";
const sumOf = (nights: readonly NightLine[], key: Amount) => nights.reduce((a, n) => a + n[key], 0n);
const feeOfMonth = (nights: readonly NightLine[], month: string) =>
  sumOf(
    nights.filter((n) => n.month === month),
    "management_fee_idr",
  );

/** The formula of ТЗ 6 for a non-negative amount. */
const formula = (amount: bigint, bps: number) => (amount * BigInt(bps) + 5000n) / 10000n;

describe("F1: the rate of each night (plan, phase 2)", () => {
  it("R101: 17% on the two November nights, 20% on the two December nights", () => {
    const night = { accommodation_gross_idr: 1_100_000n, pbjt_idr: 110_000n, ota_fee_idr: 165_000n };
    expect(accepted(R101)).toEqual([
      { night: "2026-11-29", month: "2026-11", ...night, rate_bps: 1700, management_fee_idr: 187_000n },
      { night: "2026-11-30", month: "2026-11", ...night, rate_bps: 1700, management_fee_idr: 187_000n },
      { night: "2026-12-01", month: "2026-12", ...night, rate_bps: 2000, management_fee_idr: 220_000n },
      { night: "2026-12-02", month: "2026-12", ...night, rate_bps: 2000, management_fee_idr: 220_000n },
    ]);
  });

  it("R101: 374 000 + 440 000 = 814 000, not one rate for the whole stay (748 000 or 880 000)", () => {
    const nights = accepted(R101);
    expect(feeOfMonth(nights, "2026-11")).toBe(374_000n);
    expect(feeOfMonth(nights, "2026-12")).toBe(440_000n);
    const total = sumOf(nights, "management_fee_idr");
    expect(total).toBe(814_000n);
    expect(total).not.toBe(formula(4_400_000n, 1700)); // 748 000
    expect(total).not.toBe(formula(4_400_000n, 2000)); // 880 000
  });

  it("R202: two December nights at 10%, no OTA fee", () => {
    expect(accepted(R202)).toEqual([
      { night: "2026-12-10", month: "2026-12", accommodation_gross_idr: 1_000_000n, pbjt_idr: 100_000n, ota_fee_idr: 0n, rate_bps: 1000, management_fee_idr: 100_000n },
      { night: "2026-12-11", month: "2026-12", accommodation_gross_idr: 1_000_000n, pbjt_idr: 100_000n, ota_fee_idr: 0n, rate_bps: 1000, management_fee_idr: 100_000n },
    ]);
  });

  it("the order of the rules does not matter", () => {
    expect(nightLines(R101, [...RULES].reverse())).toEqual(nightLines(R101, RULES));
  });
});

describe("rounding per night (ТЗ 5, 6)", () => {
  it("an odd stay: 4 × 1 000 001 at 17% is 680 000 per night, one rupiah less than rounding the whole stay", () => {
    const nights = accepted(snapshot({ check_in: "2026-11-10", check_out: "2026-11-14", accommodation_gross_idr: 4_000_004, pbjt_idr: 0, ota_fee_idr: 0 }));
    expect(nights.map((n) => n.accommodation_gross_idr)).toEqual([1_000_001n, 1_000_001n, 1_000_001n, 1_000_001n]);
    expect(nights.map((n) => n.management_fee_idr)).toEqual([170_000n, 170_000n, 170_000n, 170_000n]);
    expect(sumOf(nights, "management_fee_idr")).toBe(680_000n);
    expect(formula(4_000_004n, 1700)).toBe(680_001n);
  });

  it("the remainder of each amount goes one rupiah at a time to the first nights", () => {
    const nights = accepted(snapshot({ check_in: "2026-11-10", check_out: "2026-11-13", accommodation_gross_idr: 10, pbjt_idr: 2, ota_fee_idr: 1 }));
    expect(nights.map((n) => n.accommodation_gross_idr)).toEqual([4n, 3n, 3n]);
    expect(nights.map((n) => n.pbjt_idr)).toEqual([1n, 1n, 0n]);
    expect(nights.map((n) => n.ota_fee_idr)).toEqual([1n, 0n, 0n]);
    expect(nights.map((n) => n.management_fee_idr)).toEqual([1n, 1n, 1n]); // 0.68, 0.51, 0.51
  });

  it.each<[number, bigint]>([
    [0, 0n],
    [5, 1n], // 0.5 → 1
    [14, 1n], // 1.4 → 1
    [15, 2n], // 1.5 → 2
    [25, 3n], // 2.5 → 3
  ])("HALF_UP: %s at 10% → %s", (amount, fee) => {
    const one = snapshot({ property_id: "V02", check_in: "2026-12-10", check_out: "2026-12-11", accommodation_gross_idr: amount });
    expect(accepted(one).map((n) => n.management_fee_idr)).toEqual([fee]);
  });

  it.each<[number, bigint, bigint]>([
    [0, 1_234_567n, 0n],
    [10000, 1_234_567n, 1_234_567n],
    [1, 4_999n, 0n], // 0.4999
    [1, 5_000n, 1n], // 0.5
  ])("%s bps on %s → %s", (bps, amount, fee) => {
    const one = snapshot({ check_in: "2026-11-10", check_out: "2026-11-11", accommodation_gross_idr: Number(amount) });
    expect(accepted(one, [rule("V01", "2026-01-01", null, bps)]).map((n) => n.management_fee_idr)).toEqual([fee]);
  });

  it("the fee is computed on accommodation only: PBJT and OTA fee do not change it", () => {
    const base = accepted(snapshot({ pbjt_idr: 0, ota_fee_idr: 0 }));
    expect(accepted(R101).map((n) => n.management_fee_idr)).toEqual(base.map((n) => n.management_fee_idr));
  });
});

describe("the rule of a night (ТЗ 4, 14)", () => {
  const november = [rule("V01", "2026-11-01", "2026-11-30", 1700)];
  const stay = (check_in: string, check_out: string) => snapshot({ check_in, check_out });

  it("effective_from and effective_to are inclusive", () => {
    expect(accepted(stay("2026-11-01", "2026-11-02"), november)).toHaveLength(1);
    expect(accepted(stay("2026-11-30", "2026-12-01"), november)).toHaveLength(1);
    expect(held(stay("2026-10-31", "2026-11-01"), november)).toEqual(["NO_COMMISSION_RULE"]);
    expect(held(stay("2026-11-30", "2026-12-02"), november)).toEqual(["NO_COMMISSION_RULE"]);
  });

  it("a rule without effective_to has no end", () => {
    expect(accepted(stay("2099-01-01", "2099-01-02"), [rule("V01", "2026-11-01", null, 1700)])).toHaveLength(1);
  });

  it("a night without a rule holds the whole reservation, even when the other nights have one", () => {
    expect(held(R101, november)).toEqual(["NO_COMMISSION_RULE"]);
  });

  it("the rules of another villa do not apply", () => {
    expect(held(R101, [rule("V02", "2026-01-01", null, 1000)])).toEqual(["NO_COMMISSION_RULE"]);
    expect(held(R101, [])).toEqual(["NO_COMMISSION_RULE"]);
  });

  it("two rules on one night hold the whole reservation", () => {
    expect(held(R101, [...RULES, rule("V01", "2026-11-29", "2026-11-29", 2000)])).toEqual(["AMBIGUOUS_COMMISSION_RULE"]);
  });

  it("reports each code once, in the order the nights raise them", () => {
    const ambiguousFirst = [rule("V01", "2026-11-01", "2026-11-29", 1700), rule("V01", "2026-11-29", "2026-11-29", 2000)];
    expect(held(R101, ambiguousFirst)).toEqual(["AMBIGUOUS_COMMISSION_RULE", "NO_COMMISSION_RULE"]);
    const missingFirst = [rule("V01", "2026-11-30", "2026-12-31", 1700), rule("V01", "2026-12-01", "2026-12-31", 2000)];
    expect(held(R101, missingFirst)).toEqual(["NO_COMMISSION_RULE", "AMBIGUOUS_COMMISSION_RULE"]);
  });
});

describe("properties", () => {
  const amount = fc.bigInt({ min: 0n, max: 10n ** 15n });
  const checkIn = parseDate("2026-11-20");

  it("for any amounts, 1–30 nights and any rate: one line per night, the lines sum to the snapshot, each fee is the formula of the ТЗ", () => {
    fc.assert(
      fc.property(amount, amount, amount, fc.integer({ min: 1, max: 30 }), fc.integer({ min: 0, max: 10000 }), (gross, pbjt, ota, n, bps) => {
        const s = { ...R101, check_in: checkIn, check_out: addDays(checkIn, n), accommodation_gross_idr: gross, pbjt_idr: pbjt, ota_fee_idr: ota };
        const nights = accepted(s, [rule("V01", "2026-01-01", null, bps)]);
        expect(nights).toHaveLength(n);
        expect(sumOf(nights, "accommodation_gross_idr")).toBe(gross);
        expect(sumOf(nights, "pbjt_idr")).toBe(pbjt);
        expect(sumOf(nights, "ota_fee_idr")).toBe(ota);
        nights.forEach((line, i) => {
          expect(line.night).toBe(addDays(checkIn, i));
          expect(line.month).toBe(line.night.slice(0, 7));
          expect(line.rate_bps).toBe(bps);
          expect(line.management_fee_idr).toBe(formula(line.accommodation_gross_idr, bps));
        });
      }),
    );
  });

  it("the fee of each night never depends on the other nights: splitting a stay does not change a night's fee", () => {
    fc.assert(
      fc.property(amount, fc.integer({ min: 2, max: 30 }), fc.integer({ min: 0, max: 10000 }), (gross, n, bps) => {
        const rules = [rule("V01", "2026-01-01", null, bps)];
        const whole = accepted({ ...R101, check_in: checkIn, check_out: addDays(checkIn, n), accommodation_gross_idr: gross }, rules);
        // The same per-night accommodation as a one-night stay gives the same fee.
        for (const line of whole) {
          const one = accepted({ ...R101, check_in: line.night, check_out: addDays(line.night, 1), accommodation_gross_idr: line.accommodation_gross_idr }, rules);
          expect(one[0]!.management_fee_idr).toBe(line.management_fee_idr);
        }
      }),
    );
  });
});
