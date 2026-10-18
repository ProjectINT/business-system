// DQ-10 otaRateRange: the OTA fee as a share of the gross is at most 25 %. A fee already outside
// [0, gross] is DQ-08's and is skipped here, so one problem is reported once.
import { exceedsShare, idr, parseRate } from "../../calc";
import type { Check, CheckContext, CheckResult } from "../types";
import { amountIdrOf, fail, isOutUnit, pass, skip, SKIP } from "./common";
import { otaOutOfBounds } from "./dq08-ota-fee-bounds";

export const OTA_RATE_MAX = parseRate("0.25");

export const dq10: Check = {
  id: "DQ-10",
  version: 1,
  title: "OTA rate within 0–25 %",
  entity: "reservation",
  action: "review",
  engine: "ts",
  dependsOn: ["DQ-08"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    return ctx.units("reservation").map((u) => {
      const { ota_fee, gross_booking_value: gross } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (ota_fee === null) return skip(u, SKIP.notParsed("ota_fee"));
      if (gross === null) return skip(u, SKIP.notParsed("gross_booking_value"));
      if (otaOutOfBounds(u)) return skip(u, SKIP.otaOutOfBounds);
      if (gross <= 0n) return skip(u, SKIP.noGross);
      if (!exceedsShare(idr(ota_fee), idr(gross), OTA_RATE_MAX)) return pass(u);
      // basis points, exact in integers: 1 bp = 0.01 %
      return fail(u, { details: { otaFee: ota_fee, gross, rateBps: Number((ota_fee * 10000n) / gross), maxBps: 2500 }, amountIdr: amountIdrOf(u) });
    });
  },
};
