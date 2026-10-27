// DQ-17 commissionRuleCovers (v2): every night of the stay has the one rule lib/calc will take for it.
// Each night is charged at its own rate (PLAN.md 7.2), so a rate change inside the stay is fine; a night
// with no rule, or with rules the policy `commissionRuleOverlap` cannot choose between, leaves the fee
// unknown — the reservation is excluded (ТЗ п. 14 of the final test: no rule is made up) and comes back
// when a file of rules covers the night. Asks lib/calc's own resolver: the check sees the calculation's rule.
import { eachNight, findCommissionRule, type CommissionRuleInput } from "../../calc";
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { amountIdrOf, commissionRulesInForce, fail, isOutUnit, nightsOf, pass, propertyIndex, skip, SKIP } from "./common";

function check(ctx: CheckContext, rules: readonly CommissionRuleInput[], known: ReadonlySet<string>, u: RowUnit<"reservation">): CheckResult {
  const { property_id, check_in, check_out, status } = u.values;
  if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
  if (status === null) return skip(u, SKIP.notParsed("status"));
  if (status === "cancelled") return skip(u, SKIP.cancelled);
  if (property_id === null) return skip(u, SKIP.notParsed("property_id"));
  if (check_in === null || check_out === null) return skip(u, SKIP.notParsed("check_in / check_out"));
  if (!known.has(property_id)) return skip(u, SKIP.propertyUnknown);
  if (nightsOf(u)! <= 0) return skip(u, SKIP.noStay); // dates parsed above

  for (const night of eachNight(check_in, check_out)) {
    const found = findCommissionRule(rules, property_id, night, ctx.policies.commissionRuleOverlap);
    if ("problem" in found) return fail(u, { details: { problem: found.problem, date: night }, amountIdr: amountIdrOf(u) });
  }
  return pass(u);
}

export const dq17: Check = {
  id: "DQ-17",
  version: 2,
  title: "Commission rule covers every night",
  entity: "reservation",
  action: "exclude",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07", "DQ-09", "DQ-22"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const rules = commissionRulesInForce(ctx);
    const known = new Set(propertyIndex(ctx).keys());
    return ctx.units("reservation").map((u) => check(ctx, rules, known, u));
  },
};
