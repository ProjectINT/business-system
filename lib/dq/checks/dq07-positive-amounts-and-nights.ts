// DQ-07 positiveAmountsAndNights: a reservation needs a positive gross and at least one night, an
// expense a positive amount, a payment a non-negative one (a zero payment is DQ-15's, an `info`).
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { amountIdrOf, fail, isOutUnit, nightsOf, pass, skip, SKIP } from "./common";

function reservation(ctx: CheckContext, u: RowUnit<"reservation">): CheckResult {
  const gross = u.values.gross_booking_value;
  if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
  if (gross === null) return skip(u, SKIP.notParsed("gross_booking_value"));
  const nights = nightsOf(u);
  if (nights === null) return skip(u, SKIP.notParsed("check_in / check_out"));
  if (gross > 0n && nights > 0) return pass(u);
  return fail(u, { details: { gross, nights }, amountIdr: amountIdrOf(u) });
}

function money(ctx: CheckContext, u: RowUnit<"payment"> | RowUnit<"expense">, min: bigint): CheckResult {
  const amount = u.values.amount;
  if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
  if (amount === null) return skip(u, SKIP.notParsed("amount"));
  return amount >= min ? pass(u) : fail(u, { details: { amount }, amountIdr: amountIdrOf(u) });
}

export const dq07: Check = {
  id: "DQ-07",
  version: 1,
  title: "Positive amounts and nights",
  entity: ["reservation", "payment", "expense"],
  action: "exclude",
  engine: "ts",
  dependsOn: ["DQ-01", "DQ-02", "DQ-03"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    return [
      ...ctx.units("reservation").map((u) => reservation(ctx, u)),
      ...ctx.units("payment").map((u) => money(ctx, u, 0n)),
      ...ctx.units("expense").map((u) => money(ctx, u, 1n)),
    ];
  },
};
