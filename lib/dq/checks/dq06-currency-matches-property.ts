// DQ-06 currencyMatchesProperty: the row's currency differs from the villa's base currency. Excluded:
// without an exchange rate the amount cannot enter the villa's figures. R0061 says USD 4 280 874 for
// four nights, which by size is an IDR amount; the per-night figure in the details shows that.
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { amountIdrOf, fail, isOutUnit, nightsOf, pass, propertyIndex, skip, SKIP } from "./common";

function amountOf(u: RowUnit): bigint | null {
  return u.entity === "reservation" ? (u.values as RowUnit<"reservation">["values"]).gross_booking_value : (u.values as { amount: bigint | null }).amount;
}

export const dq06: Check = {
  id: "DQ-06",
  version: 1,
  title: "Currency matches the property",
  entity: ["reservation", "payment", "expense"],
  action: "exclude",
  engine: "ts",
  dependsOn: ["DQ-04"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const properties = propertyIndex(ctx);
    const out: CheckResult[] = [];
    for (const entity of ["reservation", "payment", "expense"] as const) {
      for (const u of ctx.units(entity)) {
        const { property_id, currency } = u.values;
        if (isOutUnit(ctx, u)) out.push(skip(u, SKIP.out));
        else if (property_id === null) out.push(skip(u, SKIP.notParsed("property_id")));
        else if (currency === null) out.push(skip(u, SKIP.notParsed("currency")));
        else {
          const property = properties.get(property_id);
          if (property === undefined) out.push(skip(u, SKIP.propertyUnknown));
          else if (property.values.base_currency === currency) out.push(pass(u));
          else {
            const amount = amountOf(u);
            const details: Record<string, unknown> = { currency, baseCurrency: property.values.base_currency, amount };
            if (u.entity === "reservation") {
              const nights = nightsOf(u as RowUnit<"reservation">);
              details.nights = nights;
              details.perNight = amount !== null && nights !== null && nights > 0 ? amount / BigInt(nights) : null;
            }
            out.push(fail(u, { details, amountIdr: amountIdrOf(u) }));
          }
        }
      }
    }
    return out;
  },
};
