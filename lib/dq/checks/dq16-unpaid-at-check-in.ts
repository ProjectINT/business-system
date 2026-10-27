// DQ-16 unpaidAtCheckIn (v2): a villa is paid in full by the check-in day, OTA bookings too (decided
// 2026-10-18, confirmed for OTA 2026-10-27), so an active reservation that has checked in by today
// with received payments dated on or before check-in below A + PBJT − OTA − refund carried a debt at
// check-in. One flag per reservation, of one of two kinds: `paid_late` — the rest came later, the day
// it was paid in full and how late; `unpaid` — still not paid in full, the debt as of today. Information,
// not review: there is nothing for a person to resolve, and the money itself is already in the figures
// (received counts only what arrived). v1 had a second rule for each late payment (DQ-23), merged here.
// Payments count whatever their own flags, unless excluded, duplicate or pending.
import { nightsBetween, type CalendarDate } from "../../calc";
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { expectedPayout, fail, isActive, isOutUnit, pass, paymentsByReservation, skip, SKIP } from "./common";

export const dq16: Check = {
  id: "DQ-16",
  version: 2,
  title: "Unpaid at check-in",
  entity: "reservation",
  action: "info",
  engine: "ts",
  dependsOn: ["DQ-05", "DQ-25"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const payments = paymentsByReservation(ctx);
    return ctx.units("reservation").map((u) => {
      const { status, check_in, currency } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (status === null) return skip(u, SKIP.notParsed("status"));
      if (!isActive(u)) return skip(u, SKIP.cancelled);
      if (check_in === null) return skip(u, SKIP.notParsed("check_in"));
      if (check_in > ctx.today) return skip(u, SKIP.checkInAhead);
      const expected = expectedPayout(u);
      if (expected === null) return skip(u, SKIP.notParsed("amounts"));
      if (expected <= 0n) return pass(u);
      const date = (p: RowUnit<"payment">) => p.values.payment_date!; // parsed: paymentsByReservation keeps only those
      const mine = [...(u.recordKey === null ? [] : (payments.get(u.recordKey) ?? []))].sort((a, b) =>
        date(a) < date(b) ? -1 : date(a) > date(b) ? 1 : 0,
      );
      let byCheckIn = 0n;
      let later = 0n;
      let paidOn: CalendarDate | null = null; // the day the total reached what was due
      for (const p of mine) {
        if (date(p) <= check_in) byCheckIn += p.values.amount!;
        else later += p.values.amount!;
        if (paidOn === null && byCheckIn + later >= expected) paidOn = date(p);
      }
      if (byCheckIn >= expected) return pass(u);
      const shortfall = expected - byCheckIn;
      const base = { checkIn: check_in, expected, paidByCheckIn: byCheckIn, paidLater: later, shortfall, payments: mine.length };
      const relatedKeys = mine.map((p) => p.recordKey!).sort();
      const outstanding = expected - byCheckIn - later;
      const kind = paidOn === null ? { kind: "unpaid", outstanding } : { kind: "paid_late", paidOn, daysLate: nightsBetween(check_in, paidOn) };
      return fail(u, {
        details: { ...kind, ...base },
        relatedKeys,
        // paid late: what was missing at check-in; unpaid: what is owed today
        amountIdr: currency === "IDR" ? (paidOn === null ? outstanding : shortfall) : undefined,
      });
    });
  },
};
