// DQ-19 paymentPropertyMatches: the villa on the payment is the villa of its reservation.
import type { Check, CheckContext, CheckResult } from "../types";
import { amountIdrOf, fail, isOutUnit, pass, reservationLookup, skip, SKIP } from "./common";

export const dq19: Check = {
  id: "DQ-19",
  version: 1,
  title: "Payment's property matches the reservation's",
  entity: "payment",
  action: "review",
  engine: "ts",
  dependsOn: ["DQ-05"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const lookup = reservationLookup(ctx);
    return ctx.units("payment").map((u) => {
      const { reservation_id: id, property_id } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (id === null) return skip(u, SKIP.notParsed("reservation_id"));
      if (property_id === null) return skip(u, SKIP.notParsed("property_id"));
      const found = lookup(id);
      if (found.kind === "ambiguous") return skip(u, SKIP.reservationAmbiguous);
      if (found.kind !== "found") return skip(u, SKIP.reservationUnknown);
      const reservationProperty = found.row.values.property_id;
      if (reservationProperty === property_id) return pass(u);
      return fail(u, { details: { paymentProperty: property_id, reservationProperty }, relatedKeys: [id], amountIdr: amountIdrOf(u) });
    });
  },
};
