// DQ-22 commissionRuleOverlap: two rules of one villa whose periods share a date. A flag, not an
// exclusion (decided 2026-10-18): rules change all the time and arrive in separate files, so the
// overlap is a rate change. On the shared dates the rule with the later `effective_from` is in force
// (`resolveCommissionRule`); the details say which rate applies where. SQL version: phase 7b.
import { rateToString } from "../../calc";
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { fail, isOutUnit, pass, skip, SKIP } from "./common";

type Rule = RowUnit<"commission_rule">;

interface Candidate {
  readonly unit: Rule;
  readonly key: string;
  readonly propertyId: string;
  readonly from: string;
  readonly to: string | null; // inclusive; null — open-ended
}

function candidateOf(ctx: CheckContext, u: Rule): Candidate | CheckResult {
  if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
  const { property_id, effective_from, effective_to } = u.values;
  if (property_id === null) return skip(u, SKIP.notParsed("property_id"));
  if (effective_from === null) return skip(u, SKIP.notParsed("effective_from"));
  // both key columns parsed, so the key (villa@effective_from) is there
  return { unit: u, key: u.recordKey!, propertyId: property_id, from: effective_from, to: effective_to };
}

function isCandidate(c: Candidate | CheckResult): c is Candidate {
  return "unit" in c;
}

/** Inclusive periods share a date: a.from ≤ b.to and b.from ≤ a.to, an open end never ends. */
export function periodsOverlap(a: Candidate, b: Candidate): boolean {
  return (b.to === null || a.from <= b.to) && (a.to === null || b.from <= a.to);
}

function overlapWith(a: Candidate, b: Candidate) {
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to === null ? b.to : b.to === null ? a.to : a.to < b.to ? a.to : b.to;
  // Keys differ, so the later effective_from is unique: the key is villa@effective_from.
  const inForce = a.from > b.from ? a.key : b.key;
  return { other: b.key, from, to, inForce };
}

export const dq22: Check = {
  id: "DQ-22",
  version: 1,
  title: "Commission rule periods overlap",
  entity: "commission_rule",
  action: "review",
  engine: "sql",
  dependsOn: ["DQ-01", "DQ-02", "DQ-03"],
  async run(): Promise<CheckResult[]> {
    throw new Error("DQ-22 on SQL arrives in phase 7b; without a database the runner uses runTs");
  },
  async runTs(ctx: CheckContext): Promise<CheckResult[]> {
    const prepared = ctx.units("commission_rule").map((u) => candidateOf(ctx, u));
    const candidates = prepared.filter(isCandidate);
    return prepared.map((c) => {
      if (!isCandidate(c)) return c;
      const overlaps = candidates
        .filter((o) => o.propertyId === c.propertyId && o.key !== c.key && periodsOverlap(c, o))
        .map((o) => overlapWith(c, o))
        .sort((x, y) => (x.other < y.other ? -1 : 1));
      if (overlaps.length === 0) return pass(c.unit);
      return fail(c.unit, {
        details: { rate: c.unit.values.management_fee_rate === null ? null : rateToString(c.unit.values.management_fee_rate), overlaps },
        relatedKeys: overlaps.map((o) => o.other),
      });
    });
  },
};
