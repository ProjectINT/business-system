// DQ-04 propertyExists: the row names a villa that is not in the properties file. Excluded and shown
// as "unallocated": there is nothing to attribute the money to (R0034 → V999, E0017 → V777).
import type { Check, CheckContext, CheckResult } from "../types";
import { amountIdrOf, fail, isOutUnit, pass, propertyIndex, skip, SKIP } from "./common";

export const dq04: Check = {
  id: "DQ-04",
  version: 1,
  title: "Property exists",
  entity: ["commission_rule", "reservation", "payment", "expense"],
  action: "exclude",
  engine: "ts",
  dependsOn: ["DQ-01", "DQ-02", "DQ-03"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const properties = propertyIndex(ctx);
    const out: CheckResult[] = [];
    for (const entity of ["commission_rule", "reservation", "payment", "expense"] as const) {
      for (const u of ctx.units(entity)) {
        if (isOutUnit(ctx, u)) out.push(skip(u, SKIP.out));
        else if (u.values.property_id === null) out.push(skip(u, SKIP.notParsed("property_id")));
        else if (properties.has(u.values.property_id)) out.push(pass(u));
        else out.push(fail(u, { details: { propertyId: u.values.property_id }, amountIdr: amountIdrOf(u) }));
      }
    }
    return out;
  },
};
