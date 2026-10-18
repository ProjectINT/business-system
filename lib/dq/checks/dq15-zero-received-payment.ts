// DQ-15 zeroReceivedPayment: a payment of zero marked received. Information only: the six
// cancellations and R0072 have one each; the figures do not change either way.
import type { Check, CheckContext, CheckResult } from "../types";
import { fail, isOutUnit, pass, skip, SKIP } from "./common";

export const dq15: Check = {
  id: "DQ-15",
  version: 1,
  title: "Zero payment marked received",
  entity: "payment",
  action: "info",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    return ctx.units("payment").map((u) => {
      const { amount, status, reservation_id } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (amount === null) return skip(u, SKIP.notParsed("amount"));
      if (status === null) return skip(u, SKIP.notParsed("status"));
      if (amount === 0n && status === "received") return fail(u, { details: { status, reservationId: reservation_id } });
      return pass(u);
    });
  },
};
