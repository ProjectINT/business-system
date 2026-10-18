import { assertNever, CalcError } from "./errors";
import type { CalendarDate } from "./primitives/calendar";
import type { Money } from "./primitives/money";
import { applyRate } from "./primitives/rate";
import type { RoundingMode } from "./primitives/rounding";
import type { CommissionRuleInput, ReservationInput } from "./types";

/** The rule in force on `date` (the check-in date): effectiveFrom ≤ date ≤ effectiveTo. */
export function resolveCommissionRule(
  rules: readonly CommissionRuleInput[],
  propertyId: string,
  date: CalendarDate,
): CommissionRuleInput {
  const matches = rules.filter(
    (r) => r.propertyId === propertyId && r.effectiveFrom <= date && (r.effectiveTo === null || date <= r.effectiveTo),
  );
  const [rule, ...rest] = matches;
  if (!rule) throw new CalcError("NO_COMMISSION_RULE", `No commission rule for ${propertyId} on ${date}`, { propertyId, date });
  if (rest.length > 0) {
    throw new CalcError("AMBIGUOUS_COMMISSION_RULE", `${matches.length} commission rules for ${propertyId} on ${date}`, {
      propertyId,
      date,
      rules: matches.length,
    });
  }
  return rule;
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
