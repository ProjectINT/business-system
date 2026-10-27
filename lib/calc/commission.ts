import { assertNever, CalcError } from "./errors";
import type { CalendarDate } from "./primitives/calendar";
import type { CalcPolicies } from "./policies";
import type { Money } from "./primitives/money";
import { applyRate } from "./primitives/rate";
import type { RoundingMode } from "./primitives/rounding";
import type { Rate } from "./primitives/rate";
import type { CommissionRuleInput } from "./types";

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

export type RuleLookup =
  | { readonly rule: CommissionRuleInput }
  | { readonly problem: "no_rule" }
  /** The rules the policy cannot choose between. */
  | { readonly problem: "ambiguous"; readonly candidates: readonly CommissionRuleInput[] };

/**
 * The rule in force on `date` (effectiveFrom ≤ date ≤ effectiveTo), or why there is none. Several rules
 * on the date: with 'ambiguous' any two are ambiguous; with 'latest-start' the latest effectiveFrom wins
 * (DQ-22 flags the overlap). Two with the same latest effectiveFrom are ambiguous under either policy.
 * DQ-17 asks this, so the check sees the rule the calculation takes.
 */
export function findCommissionRule(
  rules: readonly CommissionRuleInput[],
  propertyId: string,
  date: CalendarDate,
  overlap: CalcPolicies["commissionRuleOverlap"],
): RuleLookup {
  const matches = commissionRulesOn(rules, propertyId, date);
  if (matches.length === 0) return { problem: "no_rule" };
  const latestFrom = matches.reduce((max, r) => (r.effectiveFrom > max ? r.effectiveFrom : max), matches[0]!.effectiveFrom);
  const candidates = overlap === "ambiguous" ? matches : matches.filter((r) => r.effectiveFrom === latestFrom);
  return candidates.length > 1 ? { problem: "ambiguous", candidates } : { rule: candidates[0]! };
}

/** findCommissionRule that throws: NO_COMMISSION_RULE or AMBIGUOUS_COMMISSION_RULE. */
export function resolveCommissionRule(
  rules: readonly CommissionRuleInput[],
  propertyId: string,
  date: CalendarDate,
  overlap: CalcPolicies["commissionRuleOverlap"],
): CommissionRuleInput {
  const found = findCommissionRule(rules, propertyId, date, overlap);
  if ("rule" in found) return found.rule;
  if (found.problem === "no_rule") {
    throw new CalcError("NO_COMMISSION_RULE", `No commission rule for ${propertyId} on ${date}`, { propertyId, date });
  }
  const latestFrom = found.candidates.reduce((max, r) => (r.effectiveFrom > max ? r.effectiveFrom : max), found.candidates[0]!.effectiveFrom);
  throw new CalcError(
    "AMBIGUOUS_COMMISSION_RULE",
    `${found.candidates.length} commission rules for ${propertyId} cover ${date}, the latest from ${latestFrom}`,
    { propertyId, date, effectiveFrom: latestFrom, rules: found.candidates.length },
  );
}

/** MF(d) — the fee of one night, rounded on its own; a reservation's fee is the sum of its nights (PLAN.md 7.2). */
export function managementFeeForNight(
  nightGross: Money,
  rule: Pick<CommissionRuleInput, "rate" | "feeBasis">,
  mode: RoundingMode,
): Money {
  switch (rule.feeBasis) {
    case "gross_booking_value":
      return applyRate(nightGross, rule.rate, mode);
    default:
      return assertNever(rule.feeBasis, "UNSUPPORTED_FEE_BASIS", "feeBasis");
  }
}

/** The different rates of a list, in the order they first appear; equal fractions count once. */
export function distinctRates(rates: readonly Rate[]): Rate[] {
  const out: Rate[] = [];
  for (const r of rates) if (!out.some((o) => o.num * r.den === r.num * o.den)) out.push(r);
  return out;
}
