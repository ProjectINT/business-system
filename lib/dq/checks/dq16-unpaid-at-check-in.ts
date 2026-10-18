// DQ-16 unpaidAtCheckIn: a villa is paid in full before check-in (decided 2026-10-18), so an active
// reservation that has checked in by the as-of date with payments dated on or before check-in below
// GBV − OTA − refund carries a debt as of check-in. A payment on the check-in day is on time; a
// payment after it is DQ-23's. Payments count whatever their own flags, unless excluded or duplicate.
import type { Check, CheckContext, CheckResult } from "../types";
import { expectedPayout, fail, isActive, isOutUnit, pass, paymentsByReservation, skip, SKIP } from "./common";

export const dq16: Check = {
  id: "DQ-16",
  version: 1,
  title: "Unpaid at check-in",
  entity: "reservation",
  action: "review",
  engine: "ts",
  dependsOn: ["DQ-05"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const payments = paymentsByReservation(ctx);
    return ctx.units("reservation").map((u) => {
      const { status, check_in, currency } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (status === null) return skip(u, SKIP.notParsed("status"));
      if (!isActive(u)) return skip(u, SKIP.cancelled);
      if (check_in === null) return skip(u, SKIP.notParsed("check_in"));
      if (check_in > ctx.asOf) return skip(u, SKIP.checkInAfterAsOf);
      const expected = expectedPayout(u);
      if (expected === null) return skip(u, SKIP.notParsed("amounts"));
      if (expected <= 0n) return pass(u);
      let byCheckIn = 0n;
      let later = 0n;
      const mine = u.recordKey === null ? [] : (payments.get(u.recordKey) ?? []);
      for (const p of mine) {
        if (p.values.payment_date! <= check_in) byCheckIn += p.values.amount!;
        else later += p.values.amount!;
      }
      if (byCheckIn >= expected) return pass(u);
      const shortfall = expected - byCheckIn;
      return fail(u, {
        details: { checkIn: check_in, expected, paidByCheckIn: byCheckIn, paidLater: later, shortfall, payments: mine.length },
        relatedKeys: mine.map((p) => p.recordKey!).sort(),
        amountIdr: currency === "IDR" ? shortfall : undefined,
      });
    });
  },
};
