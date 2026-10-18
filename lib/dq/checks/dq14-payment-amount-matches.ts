// DQ-14 paymentAmountMatches: the payment equals what the channel should pay out, GBV − OTA − refund
// (zero for a cancellation), and does not exceed the gross. P0051 equals its payout but exceeds the
// gross, because R0102's OTA fee is negative (DQ-08).
import type { Check, CheckContext, CheckResult } from "../types";
import { amountIdrOf, expectedPayout, fail, isOutUnit, pass, reservationLookup, skip, SKIP } from "./common";

export const dq14: Check = {
  id: "DQ-14",
  version: 1,
  title: "Payment matches the expected payout",
  entity: "payment",
  action: "review",
  engine: "ts",
  dependsOn: ["DQ-05"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const lookup = reservationLookup(ctx);
    return ctx.units("payment").map((u) => {
      const { reservation_id: id, amount } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (id === null) return skip(u, SKIP.notParsed("reservation_id"));
      if (amount === null) return skip(u, SKIP.notParsed("amount"));
      const found = lookup(id);
      if (found.kind === "ambiguous") return skip(u, SKIP.reservationAmbiguous);
      if (found.kind !== "found") return skip(u, SKIP.reservationUnknown);
      const expected = expectedPayout(found.row);
      const gross = found.row.values.gross_booking_value;
      if (expected === null || gross === null) return skip(u, SKIP.notParsed("reservation amounts"));
      if (amount === expected && amount <= gross) return pass(u);
      return fail(u, {
        details: { amount, expected, gross, difference: amount - expected, aboveGross: amount > gross },
        relatedKeys: [id],
        amountIdr: amountIdrOf(u),
      });
    });
  },
};
