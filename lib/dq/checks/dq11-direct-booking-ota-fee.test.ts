import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { apart, datasetFrom, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone } from "../testing/run";
import { dq11 } from "./dq11-direct-booking-ota-fee";

const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002", base_currency: "USD" }],
  reservation: apart([
    RESERVATION, // OTA
    { ...RESERVATION, reservation_id: "R0002", channel: "Direct", ota_fee: "0" },
    { ...RESERVATION, reservation_id: "R0003", channel: "Direct" }, // Direct with a fee
    { ...RESERVATION, reservation_id: "R0004", channel: "Direct", property_id: "V002", currency: "USD" },
    { ...RESERVATION, reservation_id: "R0005", channel: "Direct", property_id: "V999" },
  ]),
});

describeContract(dq11, contextBefore(dq11, ds));

describe("DQ-11", () => {
  it("skips channel OTA, passes a direct booking without a fee", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-11", "R0001")).toMatchObject({ outcome: "skip", reason: "channel is OTA" });
    expect(resultFor(report, "DQ-11", "R0002").outcome).toBe("pass");
  });

  it("reports a direct booking with a fee (the marketing fee) as information; it sets no status", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-11", "R0003")).toMatchObject({ outcome: "fail", details: { channel: "Direct", otaFee: 450000n } });
    expect(resultFor(report, "DQ-11", "R0003").amountIdr).toBeUndefined();
    expect(report.verdicts.find((v) => v.recordKey === "R0003")?.ruleIds).not.toContain("DQ-11");
    expect(resultFor(report, "DQ-11", "R0004").outcome).toBe("fail");
  });

  it("skips a row already out, and alone rows whose channel or fee did not parse", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-11", "R0005").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const bad = datasetFrom({ reservation: [{ ...RESERVATION, channel: "" }, { ...RESERVATION, reservation_id: "R0002", channel: "Direct", ota_fee: "" }] });
    expect(await skipsAlone(dq11, bad)).toEqual({ R0001: "channel not parsed (DQ-03)", R0002: "ota_fee not parsed (DQ-03)" });
  });
});
