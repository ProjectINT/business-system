// DQ-05 paymentReservationValid: a payment points at a reservation that exists and is in the data.
// Missing reservation → the payment is excluded, its money "unallocated" (`missing`); excluded
// reservation (an older version does not count: DQ-02) → excluded too, its money "held"
// (`reservation_excluded`, PLAN.md 7.4). Reservation waiting for a human (a case) → the payment waits
// with it: `hold`, its money "held" as well.
import type { Check, CheckContext, CheckResult } from "../types";
import { amountIdrOf, fail, isOutUnit, pass, reservationLookup, skip, SKIP } from "./common";

export const dq05: Check = {
  id: "DQ-05",
  version: 1,
  title: "Payment's reservation exists",
  entity: "payment",
  action: "exclude",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07", "DQ-09", "DQ-12", "DQ-13", "DQ-17", "DQ-25"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const lookup = reservationLookup(ctx);
    return ctx.units("payment").map((u) => {
      const id = u.values.reservation_id;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (id === null) return skip(u, SKIP.notParsed("reservation_id"));
      const found = lookup(id);
      const amountIdr = amountIdrOf(u);
      switch (found.kind) {
        case "missing":
          return fail(u, { details: { reservationId: id, problem: "missing" }, amountIdr });
        case "excluded":
          return fail(u, { details: { reservationId: id, problem: "reservation_excluded" }, relatedKeys: [id], amountIdr });
        case "ambiguous":
          return fail(u, { action: "hold", details: { reservationId: id, problem: "reservation_versions" }, relatedKeys: [id], amountIdr });
        case "found":
          if (found.status === "pending") {
            return fail(u, { action: "hold", details: { reservationId: id, problem: "reservation_pending" }, relatedKeys: [id], amountIdr });
          }
          return pass(u);
      }
    });
  },
};
