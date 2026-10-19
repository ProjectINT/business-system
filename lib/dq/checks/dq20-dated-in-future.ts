// DQ-20 datedInFuture: a payment received, or an expense paid, on a date after today. Money cannot
// have come in or gone out on a day that has not come yet, so the date is wrong; flagged.
import { nightsBetween, type CalendarDate } from "../../calc";
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { amountIdrOf, fail, isOutUnit, pass, skip, SKIP } from "./common";

function after(ctx: CheckContext, u: RowUnit, date: CalendarDate): CheckResult {
  if (date <= ctx.today) return pass(u);
  return fail(u, { details: { date, today: ctx.today, daysAfter: nightsBetween(ctx.today as CalendarDate, date) }, amountIdr: amountIdrOf(u) });
}

export const dq20: Check = {
  id: "DQ-20",
  version: 1,
  title: "Dated in the future",
  entity: ["payment", "expense"],
  action: "review",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const payments = ctx.units("payment").map((u) => {
      const { status, payment_date } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (status === null) return skip(u, SKIP.notParsed("status"));
      if (status !== "received") return skip(u, SKIP.notReceived);
      if (payment_date === null) return skip(u, SKIP.notParsed("payment_date"));
      return after(ctx, u, payment_date);
    });
    const expenses = ctx.units("expense").map((u) => {
      const { payment_status, expense_date } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (payment_status === null) return skip(u, SKIP.notParsed("payment_status"));
      if (payment_status !== "paid") return skip(u, SKIP.notPaid);
      if (expense_date === null) return skip(u, SKIP.notParsed("expense_date"));
      return after(ctx, u, expense_date);
    });
    return [...payments, ...expenses];
  },
};
