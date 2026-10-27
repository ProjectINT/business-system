import { distinctRates, managementFeeForNight, resolveCommissionRule } from "./commission";
import { assertNever, CalcError, isCalcError } from "./errors";
import { assertPolicies, type CalcPolicies } from "./policies";
import { allocate } from "./primitives/allocate";
import { eachNight, nightsBetween } from "./primitives/calendar";
import { add, assertSameCurrency, parseCurrency, sub, sum, zero, type Money } from "./primitives/money";
import type { Rate } from "./primitives/rate";
import type {
  BatchResult,
  CalcFailure,
  CommissionRuleInput,
  DqStatus,
  NightLine,
  ReservationCalc,
  ReservationInput,
} from "./types";

type Amounts = Pick<ReservationInput, "gross" | "refund" | "otaFee">;

/** Net rental revenue: GBV − REF − OTA. */
export function calculateNetRental(r: Amounts): Money {
  return sub(sub(r.gross, r.refund), r.otaFee);
}

/** What the channel should pay out: A + PBJT − OTA − REF (it passes the stay and PBJT on and keeps its fee, PLAN.md, 7.4). */
export function calculateExpectedPayout(r: Amounts & Pick<ReservationInput, "pbjt">): Money {
  return sub(sub(add(r.gross, r.pbjt), r.otaFee), r.refund);
}

/** Owner share before expenses (owner estimate of the reservation, ТЗ п. 8): A − REF − OTA − MF; PBJT is not in it. */
export function calculateOwnerShare(r: Amounts, managementFee: Money): Money {
  return sub(calculateNetRental(r), managementFee);
}

const ADMITTED: readonly string[] = ["clean", "review"] satisfies DqStatus[];

export function assertAdmitted(record: { readonly dqStatus: string }, id: string): void {
  if (!ADMITTED.includes(record.dqStatus)) {
    throw new CalcError("RECORD_NOT_ADMITTED", `Record ${id} has DQ status ${record.dqStatus}`, {
      recordId: id,
      dqStatus: record.dqStatus,
    });
  }
}

type Night = NightLine & { readonly rate: Rate };

/**
 * One line per night of an active reservation: A, PBJT, REF and OTA are each spread over the nights,
 * and every night takes the rule in force on its date and its own rounding. A night without a rule
 * fails the whole reservation: there is no partly calculated reservation.
 */
function nightLines(r: ReservationInput, nights: number, rules: readonly CommissionRuleInput[], policies: CalcPolicies): Night[] {
  const gross = allocate(r.gross, nights);
  const pbjt = allocate(r.pbjt, nights);
  const refund = allocate(r.refund, nights);
  const otaFee = allocate(r.otaFee, nights);
  return eachNight(r.checkIn, r.checkOut).map((date, i) => {
    const rule = resolveCommissionRule(rules, r.propertyId, date, policies.commissionRuleOverlap);
    const g = gross[i] as Money;
    return {
      date,
      nights: 1,
      rate: rule.rate,
      gross: g,
      pbjt: pbjt[i] as Money,
      refund: refund[i] as Money,
      otaFee: otaFee[i] as Money,
      managementFee: managementFeeForNight(g, rule, policies.rounding),
    };
  });
}

/** 'nights' keeps the night lines; 'checkout' folds them into one line on the check-out date, the fee being their sum. */
function recognise(r: ReservationInput, nights: readonly Night[], managementFee: Money, policies: CalcPolicies): NightLine[] {
  switch (policies.revenueRecognition) {
    case "nights":
      return [...nights];
    case "checkout":
      return [
        {
          date: r.checkOut,
          nights: nights.length,
          rate: null,
          gross: r.gross,
          pbjt: r.pbjt,
          refund: r.refund,
          otaFee: r.otaFee,
          managementFee,
        },
      ];
    default:
      return assertNever(policies.revenueRecognition, "INVALID_POLICY", "revenueRecognition");
  }
}

/** One reservation: recognised amounts, the management fee rounded per night, and night lines. */
export function calculateReservation(
  r: ReservationInput,
  rules: readonly CommissionRuleInput[],
  policies: CalcPolicies,
): ReservationCalc {
  assertAdmitted(r, r.reservationId);
  parseCurrency(r.gross.currency);
  assertSameCurrency(r.gross, r.pbjt);
  assertSameCurrency(r.gross, r.otaFee);
  assertSameCurrency(r.gross, r.refund);
  const nights = nightsBetween(r.checkIn, r.checkOut);
  if (nights < 1) {
    throw new CalcError("INVALID_STAY", `Reservation ${r.reservationId} has ${nights} nights`, {
      reservationId: r.reservationId,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
    });
  }
  const base = {
    reservationId: r.reservationId,
    propertyId: r.propertyId,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    channel: r.channel,
    dqStatus: r.dqStatus,
    nights,
  };

  switch (r.status) {
    case "confirmed":
    case "modified": {
      const perNight = nightLines(r, nights, rules, policies);
      const managementFee = sum(perNight.map((l) => l.managementFee), r.gross.currency);
      return {
        ...base,
        active: true,
        rates: distinctRates(perNight.map((l) => l.rate)),
        gross: r.gross,
        pbjt: r.pbjt,
        refund: r.refund,
        otaFee: r.otaFee,
        managementFee,
        netRental: calculateNetRental(r),
        expectedPayout: calculateExpectedPayout(r),
        ownerShare: calculateOwnerShare(r, managementFee),
        cancelled: null,
        lines: recognise(r, perNight, managementFee, policies),
      };
    }
    case "cancelled": {
      const z = zero(r.gross.currency);
      return {
        ...base,
        active: false,
        rates: [],
        gross: z,
        pbjt: z,
        refund: z,
        otaFee: z,
        managementFee: z,
        netRental: z,
        expectedPayout: z,
        ownerShare: z,
        cancelled: { gross: r.gross, refund: r.refund, retained: sub(r.gross, r.refund) },
        lines: [],
      };
    }
    default:
      return assertNever(r.status, "UNKNOWN_STATUS", "status");
  }
}

/** Runs fn per record; a CalcError becomes a failure with the record's amount, anything else is a bug and rethrown. */
export function collect<In, Out>(
  items: readonly In[],
  fn: (item: In) => Out,
  describe: (item: In) => Omit<CalcFailure, "code" | "message">,
): BatchResult<Out> {
  const results: Out[] = [];
  const failures: CalcFailure[] = [];
  for (const item of items) {
    try {
      results.push(fn(item));
    } catch (e) {
      if (!isCalcError(e)) throw e;
      failures.push({ ...describe(item), code: e.code, message: e.message });
    }
  }
  return { results, failures };
}

export function calculateReservations(
  reservations: readonly ReservationInput[],
  rules: readonly CommissionRuleInput[],
  policies: CalcPolicies,
): BatchResult<ReservationCalc> {
  assertPolicies(policies);
  return collect(
    reservations,
    (r) => calculateReservation(r, rules, policies),
    (r) => ({ entity: "reservation", recordId: r.reservationId, propertyId: r.propertyId, amount: r.gross }),
  );
}
