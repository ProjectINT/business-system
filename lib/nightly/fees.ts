// Snapshot → night lines: the stay split into nights, the three amounts allocated per night, and on
// each night the villa's rule and the management fee (docs/FINAL_TEST_PLAN.md, 3.2).
//
// ТЗ 4–7: check-in included, check-out excluded; accommodation, PBJT and OTA fee are allocated in
// whole rupiah, the remainder going one rupiah at a time to the first nights; the fee is the night's
// accommodation × the rate in force on that night, rounded HALF_UP per night; the night of
// 2026-11-30 belongs to November. The formula of the ТЗ, (amount × bps + 5000) // 10000, is
// roundDiv(amount × bps, 10000, "half-up"): applyRate with rateFromBps rounds the same rational
// value the same way, so it gives the same integer (fees.test.ts checks this against the formula).
//
// A night with no rule, or with several, holds the whole reservation: no rule is invented (ТЗ 14).
// snapshots.ts calls this on a snapshot that passed its checks (a stay of at least one night) and
// before payments are placed, so the payment of a reservation held here is held too, not received.
import { allocate, applyRate, eachNight, idr, rateFromBps, type CalendarDate, type Money } from "../calc";
import type { CommissionRule, ReservationEvent } from "./schema";
import type { ExceptionCode } from "./types";

export interface NightLine {
  /** The date the night starts. */
  readonly night: CalendarDate;
  /** YYYY-MM of `night`: the month the accrual belongs to (ТЗ 7). */
  readonly month: string;
  readonly accommodation_gross_idr: bigint;
  readonly pbjt_idr: bigint;
  readonly ota_fee_idr: bigint;
  readonly rate_bps: number;
  readonly management_fee_idr: bigint;
}

export type NightLines =
  | {
      readonly hold: false;
      /** One line per night, chronological. */
      readonly nights: readonly NightLine[];
    }
  | {
      readonly hold: true;
      /** NO_COMMISSION_RULE and/or AMBIGUOUS_COMMISSION_RULE, in the order the nights raised them, each once. */
      readonly codes: readonly ExceptionCode[];
    };

/** The rules of the villa in force on the night: effective_to inclusive, null — open-ended (ТЗ 4). */
function rulesOn(rules: readonly CommissionRule[], property_id: string, night: CalendarDate): CommissionRule[] {
  return rules.filter(
    (r) =>
      r.property_id === property_id && r.effective_from <= night && (r.effective_to === null || night <= r.effective_to),
  );
}

function line(night: CalendarDate, rule: CommissionRule, accommodation: Money, pbjt: Money, ota: Money): NightLine {
  return {
    night,
    month: night.slice(0, 7),
    accommodation_gross_idr: accommodation.amount,
    pbjt_idr: pbjt.amount,
    ota_fee_idr: ota.amount,
    rate_bps: rule.rate_bps,
    management_fee_idr: applyRate(accommodation, rateFromBps(rule.rate_bps), "half-up").amount,
  };
}

export function nightLines(snapshot: ReservationEvent, rules: readonly CommissionRule[]): NightLines {
  const nights = eachNight(snapshot.check_in, snapshot.check_out);

  // Exactly one rule per night; otherwise the reservation waits for a person (ТЗ 14).
  const codes: ExceptionCode[] = [];
  const ruleOfNight: CommissionRule[] = [];
  for (const night of nights) {
    const matches = rulesOn(rules, snapshot.property_id, night);
    if (matches.length === 1) {
      ruleOfNight.push(matches[0]!);
    } else {
      const code: ExceptionCode = matches.length === 0 ? "NO_COMMISSION_RULE" : "AMBIGUOUS_COMMISSION_RULE";
      if (!codes.includes(code)) codes.push(code);
    }
  }
  if (codes.length > 0) return { hold: true, codes };

  // ТЗ 5: each amount on its own, equal parts, the remainder to the first nights.
  const accommodation = allocate(idr(snapshot.accommodation_gross_idr), nights.length);
  const pbjt = allocate(idr(snapshot.pbjt_idr), nights.length);
  const ota = allocate(idr(snapshot.ota_fee_idr), nights.length);
  return {
    hold: false,
    nights: nights.map((night, i) => line(night, ruleOfNight[i]!, accommodation[i]!, pbjt[i]!, ota[i]!)),
  };
}
