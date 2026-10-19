// DQ-24 confirmedWithoutPayment: a confirmed reservation with no payment at all. A booking is
// confirmed when it is paid (2026-10-19), so either the payment has not reached the data yet or the
// status is wrong. Information only, whatever the check-in date: a debt at check-in is DQ-16's. A
// modified booking is not checked: its payment may sit on the original booking until a person links them.
import { nightsBetween, type CalendarDate } from "../../calc";
import type { Check, CheckContext, CheckResult } from "../types";
import { expectedPayout, fail, isOutUnit, pass, paymentsByReservation, skip, SKIP } from "./common";

export const dq24: Check = {
  id: "DQ-24",
  version: 1,
  title: "Confirmed without payment",
  entity: "reservation",
  action: "info",
  engine: "ts",
  dependsOn: ["DQ-05"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const payments = paymentsByReservation(ctx);
    return ctx.units("reservation").map((u) => {
      const { status, check_in, currency } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (status === null) return skip(u, SKIP.notParsed("status"));
      if (status !== "confirmed") return skip(u, SKIP.notConfirmed);
      const expected = expectedPayout(u);
      if (expected !== null && expected <= 0n) return pass(u);
      const mine = u.recordKey === null ? [] : (payments.get(u.recordKey) ?? []);
      if (mine.some((p) => p.values.amount! > 0n)) return pass(u);
      return fail(u, {
        details: {
          checkIn: check_in,
          daysToCheckIn: check_in === null ? null : nightsBetween(ctx.today as CalendarDate, check_in),
          expected,
          zeroPayments: mine.length,
        },
        relatedKeys: mine.map((p) => p.recordKey!).sort(),
        amountIdr: currency === "IDR" && expected !== null ? expected : undefined,
      });
    });
  },
};
