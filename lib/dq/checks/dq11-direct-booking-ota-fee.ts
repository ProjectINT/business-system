// DQ-11 directBookingOtaFee: a direct booking with a non-zero "OTA fee". A flag and a question for
// the finance director (PLAN.md 14): what the fee means on a booking that did not come through a channel.
import type { Check, CheckContext, CheckResult } from "../types";
import { fail, isOutUnit, pass, skip, SKIP } from "./common";

export const dq11: Check = {
  id: "DQ-11",
  version: 1,
  title: "OTA fee on a direct booking",
  entity: "reservation",
  action: "review",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07", "DQ-09"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    return ctx.units("reservation").map((u) => {
      const { channel, ota_fee, currency } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (channel === null) return skip(u, SKIP.notParsed("channel"));
      if (ota_fee === null) return skip(u, SKIP.notParsed("ota_fee"));
      if (channel === "OTA") return skip(u, SKIP.otaChannel);
      if (ota_fee === 0n) return pass(u);
      return fail(u, { details: { channel, otaFee: ota_fee }, amountIdr: currency === "IDR" ? ota_fee : undefined });
    });
  },
};
