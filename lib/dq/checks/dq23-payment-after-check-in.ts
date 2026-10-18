// DQ-23 paymentAfterCheckIn: a payment dated after the check-in day of its reservation. With payment
// due before check-in (decided 2026-10-18) this is the other side of DQ-16's debt. In the sample no
// payment is dated before check-in and the amounts equal GBV − OTA: these look like channel payout
// dates, not guest payments — a question for the finance director.
import { nightsBetween } from "../../calc";
import type { Check, CheckContext, CheckResult } from "../types";
import { amountIdrOf, fail, isOutUnit, pass, reservationLookup, skip, SKIP } from "./common";

export const dq23: Check = {
  id: "DQ-23",
  version: 1,
  title: "Payment after check-in",
  entity: "payment",
  action: "review",
  engine: "ts",
  dependsOn: ["DQ-05"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const lookup = reservationLookup(ctx);
    return ctx.units("payment").map((u) => {
      const { reservation_id: id, amount, payment_date } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (amount === null) return skip(u, SKIP.notParsed("amount"));
      if (amount === 0n) return skip(u, SKIP.zeroPayment);
      if (id === null) return skip(u, SKIP.notParsed("reservation_id"));
      if (payment_date === null) return skip(u, SKIP.notParsed("payment_date"));
      const found = lookup(id);
      if (found.kind === "ambiguous") return skip(u, SKIP.reservationAmbiguous);
      if (found.kind !== "found") return skip(u, SKIP.reservationUnknown);
      const { check_in, check_out } = found.row.values;
      if (check_in === null || check_out === null) return skip(u, SKIP.notParsed("reservation dates"));
      if (payment_date <= check_in) return pass(u);
      return fail(u, {
        details: {
          paymentDate: payment_date,
          checkIn: check_in,
          checkOut: check_out,
          daysAfterCheckIn: nightsBetween(check_in, payment_date),
          daysAfterCheckOut: nightsBetween(check_out, payment_date),
        },
        relatedKeys: [id],
        amountIdr: amountIdrOf(u),
      });
    });
  },
};
