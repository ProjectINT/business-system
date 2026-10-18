import { assertNever, CalcError } from "./errors";
import type { CalendarDate } from "./primitives/calendar";
import type { Money } from "./primitives/money";
import { applyRate } from "./primitives/rate";
import type { RoundingMode } from "./primitives/rounding";
import type { CommissionRuleInput, ReservationInput } from "./types";

/** Every rule of the villa whose period covers `date` (effectiveTo inclusive, null — open-ended). */
export function commissionRulesOn(
  rules: readonly CommissionRuleInput[],
  propertyId: string,
  date: CalendarDate,
): CommissionRuleInput[] {
  return rules.filter(
    (r) => r.propertyId === propertyId && r.effectiveFrom <= date && (r.effectiveTo === null || date <= r.effectiveTo),
  );
}

/**
 * The rule in force on `date` (the check-in date): effectiveFrom ≤ date ≤ effectiveTo.
 * Overlapping periods are a rate change, not an error (PLAN.md decision log, 2026-10-18; DQ-22 flags them):
 * the rule with the latest effectiveFrom wins. Two matching rules with the same effectiveFrom are ambiguous.
 */
export function resolveCommissionRule(
  rules: readonly CommissionRuleInput[],
  propertyId: string,
  date: CalendarDate,
): CommissionRuleInput {
  const matches = commissionRulesOn(rules, propertyId, date);
  if (matches.length === 0) {
    throw new CalcError("NO_COMMISSION_RULE", `No commission rule for ${propertyId} on ${date}`, { propertyId, date });
  }
  const latestFrom = matches.reduce((max, r) => (r.effectiveFrom > max ? r.effectiveFrom : max), matches[0]!.effectiveFrom);
  const latest = matches.filter((r) => r.effectiveFrom === latestFrom);
  if (latest.length > 1) {
    throw new CalcError(
      "AMBIGUOUS_COMMISSION_RULE",
      `${latest.length} commission rules for ${propertyId} start on ${latestFrom} and cover ${date}`,
      { propertyId, date, effectiveFrom: latestFrom, rules: latest.length },
    );
  }
  return latest[0]!;
}

/** MF_r — the only rounding per reservation. */
export function calculateManagementFee(
  r: Pick<ReservationInput, "gross">,
  rule: Pick<CommissionRuleInput, "rate" | "feeBasis">,
  mode: RoundingMode,
): Money {
  switch (rule.feeBasis) {
    case "gross_booking_value":
      return applyRate(r.gross, rule.rate, mode);
    default:
      return assertNever(rule.feeBasis, "UNSUPPORTED_FEE_BASIS", "feeBasis");
  }
}
