// Snapshot → night lines: the stay split into nights, the three amounts allocated per night, and on
// each night the villa's rule and the management fee (docs/FINAL_TEST_PLAN.md, 3.2). Since phase 6b
// (docs/MONEY_MODEL_PLAN.md, step 8) lib/calc computes the lines: this file translates the case into
// the calculator's input and its lines back into the report's.
//
// ТЗ 4–7: check-in included, check-out excluded; accommodation, PBJT and OTA fee are allocated in
// whole rupiah, the remainder going one rupiah at a time to the first nights; the fee is the night's
// accommodation × the rate in force on that night, rounded HALF_UP per night; the night of
// 2026-11-30 belongs to November. The formula of the ТЗ, (amount × bps + 5000) // 10000, is
// roundDiv(amount × bps, 10000, "half-up"): lib/calc's per-night fee with rateFromBps rounds the same
// rational value the same way, so it gives the same integer (fees.test.ts checks this against the formula).
//
// A night with no rule, or with several, holds the whole reservation: no rule is invented (ТЗ 14) —
// the calculator's policy `commissionRuleOverlap: 'ambiguous'`. The calculator stops at the first such
// night; the report names every code the nights raise, so the check runs here first, night by night,
// through lib/calc's own resolver. snapshots.ts calls this on a snapshot that passed its checks (status
// confirmed or modified, a stay of at least one night) and before payments are placed, so the payment
// of a reservation held here is held too, not received.
import {
  calculateReservation,
  DEFAULT_POLICIES,
  eachNight,
  findCommissionRule,
  idr,
  rateFromBps,
  type CalcPolicies,
  type CalendarDate,
  type CommissionRuleInput,
  type ReservationInput,
} from "../calc";
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

/** Exactly one rule per night, whatever the system's default (ТЗ 14). */
const POLICIES: CalcPolicies = { ...DEFAULT_POLICIES, commissionRuleOverlap: "ambiguous" };

export function nightLines(snapshot: ReservationEvent, rules: readonly CommissionRule[]): NightLines {
  const inputs = rules.map(
    (r): CommissionRuleInput => ({
      propertyId: r.property_id,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      rate: rateFromBps(r.rate_bps),
      feeBasis: "gross_booking_value",
    }),
  );
  const caseRuleOf = new Map(inputs.map((input, i) => [input, rules[i]!]));

  // Exactly one rule per night; otherwise the reservation waits for a person (ТЗ 14).
  const codes: ExceptionCode[] = [];
  const bps: number[] = []; // the case's own rate of each night: not turned back from the fraction
  for (const night of eachNight(snapshot.check_in, snapshot.check_out)) {
    const found = findCommissionRule(inputs, snapshot.property_id, night, POLICIES.commissionRuleOverlap);
    if ("rule" in found) {
      bps.push(caseRuleOf.get(found.rule)!.rate_bps);
    } else {
      const code: ExceptionCode = found.problem === "no_rule" ? "NO_COMMISSION_RULE" : "AMBIGUOUS_COMMISSION_RULE";
      if (!codes.includes(code)) codes.push(code);
    }
  }
  if (codes.length > 0) return { hold: true, codes };

  // ТЗ 5–6: each amount allocated on its own, the fee per night — the calculator's night lines.
  const calc = calculateReservation(
    {
      reservationId: snapshot.reservation_id,
      propertyId: snapshot.property_id,
      checkIn: snapshot.check_in,
      checkOut: snapshot.check_out,
      status: snapshot.status as ReservationInput["status"], // checked: confirmed or modified
      gross: idr(snapshot.accommodation_gross_idr),
      pbjt: idr(snapshot.pbjt_idr),
      otaFee: idr(snapshot.ota_fee_idr),
      refund: idr(0n), // the feed has no refunds
      channel: null, // the feed has no channel; it is not guessed
      dqStatus: "clean",
    },
    inputs,
    POLICIES,
  );
  return {
    hold: false,
    nights: calc.lines.map((l, i) => ({
      night: l.date,
      month: l.date.slice(0, 7),
      accommodation_gross_idr: l.gross.amount,
      pbjt_idr: l.pbjt.amount,
      ota_fee_idr: l.otaFee.amount,
      rate_bps: bps[i]!,
      management_fee_idr: l.managementFee.amount,
    })),
  };
}
