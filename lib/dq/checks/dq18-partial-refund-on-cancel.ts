// DQ-18 partialRefundOnCancel: a cancellation that kept part of the money. The retained part might be
// revenue; the policy is a question for the finance director (PLAN.md 7.5), so the row is flagged.
import type { Check, CheckContext, CheckResult } from "../types";
import { fail, isOutUnit, pass, skip, SKIP } from "./common";

export const dq18: Check = {
  id: "DQ-18",
  version: 1,
  title: "Partial refund on a cancellation",
  entity: "reservation",
  action: "review",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07", "DQ-09"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    return ctx.units("reservation").map((u) => {
      const { status, refund_amount: refund, gross_booking_value: gross, currency } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (status === null) return skip(u, SKIP.notParsed("status"));
      if (status !== "cancelled") return skip(u, SKIP.notCancelled);
      if (refund === null) return skip(u, SKIP.notParsed("refund_amount"));
      if (gross === null) return skip(u, SKIP.notParsed("gross_booking_value"));
      if (refund <= 0n || refund >= gross) return pass(u);
      const retained = gross - refund;
      return fail(u, { details: { gross, refund, retained }, amountIdr: currency === "IDR" ? retained : undefined });
    });
  },
};
