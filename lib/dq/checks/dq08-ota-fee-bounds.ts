// DQ-08 otaFeeBounds: 0 ≤ OTA fee ≤ gross. A flag (R0102: −100 000): the booking is real, the fee is
// in question, so the reservation stays in the figures and in DQ-12's area.
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { amountIdrOf, fail, isOutUnit, pass, skip, SKIP } from "./common";

export function otaOutOfBounds(r: RowUnit<"reservation">): boolean {
  const { ota_fee, gross_booking_value } = r.values;
  return ota_fee !== null && gross_booking_value !== null && (ota_fee < 0n || ota_fee > gross_booking_value);
}

export const dq08: Check = {
  id: "DQ-08",
  version: 1,
  title: "OTA fee within bounds",
  entity: "reservation",
  action: "review",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07", "DQ-09"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    return ctx.units("reservation").map((u) => {
      const { ota_fee, gross_booking_value } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (ota_fee === null) return skip(u, SKIP.notParsed("ota_fee"));
      if (gross_booking_value === null) return skip(u, SKIP.notParsed("gross_booking_value"));
      if (!otaOutOfBounds(u)) return pass(u);
      return fail(u, { details: { otaFee: ota_fee, gross: gross_booking_value }, amountIdr: amountIdrOf(u) });
    });
  },
};
