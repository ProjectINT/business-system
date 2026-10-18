// DQ-09 refundConsistent: a refund is never negative, never above the gross, and only a cancellation
// has one. R0072 is confirmed with a refund above its gross: excluded.
import type { Check, CheckContext, CheckResult } from "../types";
import { amountIdrOf, fail, isOutUnit, pass, skip, SKIP } from "./common";

export const dq09: Check = {
  id: "DQ-09",
  version: 1,
  title: "Refund consistent with gross and status",
  entity: "reservation",
  action: "exclude",
  engine: "ts",
  dependsOn: ["DQ-01", "DQ-02", "DQ-03"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    return ctx.units("reservation").map((u) => {
      const { refund_amount: refund, gross_booking_value: gross, status } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (refund === null) return skip(u, SKIP.notParsed("refund_amount"));
      if (gross === null) return skip(u, SKIP.notParsed("gross_booking_value"));
      if (status === null) return skip(u, SKIP.notParsed("status"));
      const problems: string[] = [];
      if (refund < 0n) problems.push("refund_negative");
      if (refund > gross) problems.push("refund_above_gross");
      if (refund > 0n && status !== "cancelled") problems.push("refund_without_cancellation");
      if (problems.length === 0) return pass(u);
      return fail(u, { details: { refund, gross, status, problems }, amountIdr: amountIdrOf(u) });
    });
  },
};
