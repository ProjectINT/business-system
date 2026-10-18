// DQ-03 schemaAndFormat: a row whose value did not parse (the loader left `null` and an issue), whose
// natural key is empty (the parser reports it as an issue), or whose identifiers are not in the house format (R####, V###, P####, E####;
// PLAN.md 6) is excluded. Every other rule may then rely on the typed values of the rows it sees.
import { ENTITIES } from "../../ingest";
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { amountIdrOf, fail, pass } from "./common";

interface FormatIssue {
  readonly field: string | null;
  readonly value: string | null;
  readonly message: string;
}

/** Identifier columns and their formats; a column is checked wherever an entity has it. */
export const ID_FORMATS: Readonly<Record<string, RegExp>> = Object.freeze({
  reservation_id: /^R\d{4}$/,
  property_id: /^V\d{3}$/,
  payment_id: /^P\d{4}$/,
  expense_id: /^E\d{4}$/,
});

export function formatIssues(u: RowUnit): FormatIssue[] {
  const issues: FormatIssue[] = u.issues.map((i) => ({ field: i.field, value: i.value, message: i.message }));
  for (const [field, re] of Object.entries(ID_FORMATS)) {
    const value = (u.values as Record<string, unknown>)[field];
    if (typeof value === "string" && !re.test(value)) {
      issues.push({ field, value, message: `not in the format ${re.source}` });
    }
  }
  return issues;
}

export const dq03: Check = {
  id: "DQ-03",
  version: 1,
  title: "Schema and format",
  entity: ENTITIES,
  action: "exclude",
  engine: "ts",
  dependsOn: [],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const out: CheckResult[] = [];
    for (const entity of ENTITIES) {
      for (const u of ctx.units(entity)) {
        const issues = formatIssues(u);
        out.push(issues.length === 0 ? pass(u) : fail(u, { details: { issues }, amountIdr: amountIdrOf(u) }));
      }
    }
    return out;
  },
};
