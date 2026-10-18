// DQ-17 commissionRuleCovers: a rule of the villa is in force on the check-in date and the rate does
// not change inside the stay (the fee is taken at the check-in rate; PLAN.md decision log 2026-10-18).
// Uses lib/calc's own resolver, so the rule the check sees is the rule the calculation will use.
import { commissionRulesOn, eachNight, rateToString, resolveCommissionRule, type CalendarDate, type CommissionRuleInput } from "../../calc";
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { amountIdrOf, commissionRulesInForce, fail, isOutUnit, nightsOf, pass, propertyIndex, skip, SKIP } from "./common";

type Resolved = { readonly rule: CommissionRuleInput } | { readonly problem: "no_rule" | "ambiguous" };

/** The calculation's own choice of rule, or why there is none: no rule covers the date, or two start on the same latest date. */
function resolve(rules: readonly CommissionRuleInput[], propertyId: string, date: CalendarDate): Resolved {
  const matches = commissionRulesOn(rules, propertyId, date);
  if (matches.length === 0) return { problem: "no_rule" };
  const latestFrom = matches.reduce((max, r) => (r.effectiveFrom > max ? r.effectiveFrom : max), matches[0]!.effectiveFrom);
  if (matches.filter((r) => r.effectiveFrom === latestFrom).length > 1) return { problem: "ambiguous" };
  return { rule: resolveCommissionRule(rules, propertyId, date) };
}

function check(ctx: CheckContext, rules: readonly CommissionRuleInput[], known: ReadonlySet<string>, u: RowUnit<"reservation">): CheckResult {
  const { property_id, check_in, check_out, status } = u.values;
  if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
  if (status === null) return skip(u, SKIP.notParsed("status"));
  if (status === "cancelled") return skip(u, SKIP.cancelled);
  if (property_id === null) return skip(u, SKIP.notParsed("property_id"));
  if (check_in === null || check_out === null) return skip(u, SKIP.notParsed("check_in / check_out"));
  if (!known.has(property_id)) return skip(u, SKIP.propertyUnknown);
  if (nightsOf(u)! <= 0) return skip(u, SKIP.noStay); // dates parsed above

  const atCheckIn = resolve(rules, property_id, check_in);
  if ("problem" in atCheckIn) return fail(u, { details: { problem: atCheckIn.problem, date: check_in }, amountIdr: amountIdrOf(u) });
  const rate = rateToString(atCheckIn.rule.rate);
  for (const night of eachNight(check_in, check_out)) {
    const r = resolve(rules, property_id, night);
    const nightRate = "rule" in r ? rateToString(r.rule.rate) : null;
    if (nightRate !== rate) {
      return fail(u, {
        details: { problem: "rate_changes", checkInRate: rate, from: night, rateFrom: nightRate },
        amountIdr: amountIdrOf(u),
      });
    }
  }
  return pass(u);
}

export const dq17: Check = {
  id: "DQ-17",
  version: 1,
  title: "Commission rule covers the stay",
  entity: "reservation",
  action: "review",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07", "DQ-09", "DQ-22"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const rules = commissionRulesInForce(ctx);
    const known = new Set(propertyIndex(ctx).keys());
    return ctx.units("reservation").map((u) => check(ctx, rules, known, u));
  },
};
