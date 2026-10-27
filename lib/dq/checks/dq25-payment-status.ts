// DQ-25 paymentStatus: `received` is money; `pending` is not money yet (ТЗ п. 11 of the final test) —
// information, the payment stays in the data and lib/data shows its amount as "held", not received;
// any other status cannot be read as money or as a promise of it — excluded, its amount "held" too
// (PLAN.md 7.4). The sample has only `received`.
import type { Check, CheckContext, CheckResult } from "../types";
import { amountIdrOf, fail, isOutUnit, pass, skip, SKIP } from "./common";

export const dq25: Check = {
  id: "DQ-25",
  version: 1,
  title: "Payment status",
  entity: "payment",
  action: "exclude",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    return ctx.units("payment").map((u) => {
      const { status } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (status === null) return skip(u, SKIP.notParsed("status"));
      if (status === "received") return pass(u);
      const amountIdr = amountIdrOf(u);
      if (status === "pending") return fail(u, { action: "info", details: { status }, amountIdr });
      return fail(u, { details: { status }, amountIdr });
    });
  },
};
