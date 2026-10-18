import { resolveCommissionRule, calculateManagementFee } from "./commission";
import { assertNever, CalcError, isCalcError } from "./errors";
import { assertPolicies, type CalcPolicies } from "./policies";
import { allocate } from "./primitives/allocate";
import { eachNight, nightsBetween } from "./primitives/calendar";
import { assertSameCurrency, parseCurrency, sub, zero, type Money } from "./primitives/money";
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

/** What the channel should pay out: GBV − OTA − REF (the OTA keeps its fee, PLAN.md, 7.4). */
export function calculateExpectedPayout(r: Amounts): Money {
  return sub(sub(r.gross, r.otaFee), r.refund);
}

/** Owner share before expenses: GBV − REF − OTA − MF. */
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

function spreadOverNights(
  r: ReservationInput,
  nights: number,
  amounts: { gross: Money; refund: Money; otaFee: Money; managementFee: Money },
  policies: CalcPolicies,
): NightLine[] {
  switch (policies.revenueRecognition) {
    case "checkout":
      return [{ date: r.checkOut, nights, ...amounts }];
    case "nights": {
      const gross = allocate(amounts.gross, nights);
      const refund = allocate(amounts.refund, nights);
      const otaFee = allocate(amounts.otaFee, nights);
      const managementFee = allocate(amounts.managementFee, nights);
      return eachNight(r.checkIn, r.checkOut).map((date, i) => ({
        date,
        nights: 1,
        gross: gross[i] as Money,
        refund: refund[i] as Money,
        otaFee: otaFee[i] as Money,
        managementFee: managementFee[i] as Money,
      }));
    }
    default:
      return assertNever(policies.revenueRecognition, "INVALID_POLICY", "revenueRecognition");
  }
}

/** One reservation: recognised amounts, management fee with one rounding, and night lines. */
export function calculateReservation(
  r: ReservationInput,
  rules: readonly CommissionRuleInput[],
  policies: CalcPolicies,
): ReservationCalc {
  assertAdmitted(r, r.reservationId);
  parseCurrency(r.gross.currency);
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
    dqStatus: r.dqStatus,
    nights,
  };

  switch (r.status) {
    case "confirmed":
    case "modified": {
      const rule = resolveCommissionRule(rules, r.propertyId, r.checkIn);
      const managementFee = calculateManagementFee(r, rule, policies.rounding);
      return {
        ...base,
        active: true,
        rate: rule.rate,
        gross: r.gross,
        refund: r.refund,
        otaFee: r.otaFee,
        managementFee,
        netRental: calculateNetRental(r),
        expectedPayout: calculateExpectedPayout(r),
        ownerShare: calculateOwnerShare(r, managementFee),
        cancelled: null,
        lines: spreadOverNights(r, nights, { gross: r.gross, refund: r.refund, otaFee: r.otaFee, managementFee }, policies),
      };
    }
    case "cancelled": {
      const z = zero(r.gross.currency);
      return {
        ...base,
        active: false,
        rate: null,
        gross: z,
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
