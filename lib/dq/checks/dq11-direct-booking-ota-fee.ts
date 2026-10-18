// DQ-11 directBookingOtaFee: a direct booking with a non-zero "OTA fee". Information only: on a direct
// booking the fee tops up the marketing budget of our own sales channel and is deducted from the owner
// balance like an OTA fee (PLAN.md 15, 2026-10-19). Payments arrive net of it, as for OTA.
import type { Check, CheckContext, CheckResult } from "../types";
import { fail, isOutUnit, pass, skip, SKIP } from "./common";

export const dq11: Check = {
  id: "DQ-11",
  version: 2,
  title: "Marketing fee on a direct booking",
  entity: "reservation",
  action: "info",
  engine: "ts",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07", "DQ-09"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    return ctx.units("reservation").map((u) => {
      const { channel, ota_fee } = u.values;
      if (isOutUnit(ctx, u)) return skip(u, SKIP.out);
      if (channel === null) return skip(u, SKIP.notParsed("channel"));
      if (ota_fee === null) return skip(u, SKIP.notParsed("ota_fee"));
      if (channel === "OTA") return skip(u, SKIP.otaChannel);
      if (ota_fee === 0n) return pass(u);
      return fail(u, { details: { channel, otaFee: ota_fee } });
    });
  },
};
