// DQ-13 modifiedWithoutOrigin: the data has no link from a modified reservation to the one it
// replaced, so every modified reservation is accepted by a human, who links it to its origin by hand
// (VALIDATION_PLAN.md 7.5). Inside a conflict group the case is the group's; alone, the case is `M:<id>`.
import type { Check, CheckContext, CheckResult } from "../types";
import { amountIdrOf, fail, isOutUnit, skip, SKIP } from "./common";

export function modificationCaseKey(reservationId: string): string {
  return `M:${reservationId}`;
}

export const dq13: Check = {
  id: "DQ-13",
  version: 1,
  title: "Modified reservation without an origin",
  entity: "reservation",
  action: "decide",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07", "DQ-09"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    return ctx.units("reservation").map((u) => {
      const { status } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (status === null) return skip(u, SKIP.notParsed("status"));
      if (status !== "modified") return skip(u, SKIP.notModified);
      return fail(u, { details: { status, propertyId: u.values.property_id, updatedAt: u.values.updated_at }, amountIdr: amountIdrOf(u) });
    });
  },
};
