import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { apart, datasetFrom, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq10 } from "./dq10-ota-rate-range";

const ds = datasetFrom({
  property: [PROPERTY],
  reservation: apart([
    RESERVATION, // 15 %
    { ...RESERVATION, reservation_id: "R0002", gross_booking_value: "4000000", ota_fee: "1000000" }, // exactly 25 %
    { ...RESERVATION, reservation_id: "R0003", gross_booking_value: "4000000", ota_fee: "1000001" }, // just above
    { ...RESERVATION, reservation_id: "R0004", ota_fee: "0" },
    { ...RESERVATION, reservation_id: "R0005", ota_fee: "-5" }, // DQ-08's
    { ...RESERVATION, reservation_id: "R0006", gross_booking_value: "0" }, // DQ-07's
  ]),
});

describeContract(dq10, contextBefore(dq10, ds));

describe("DQ-10", () => {
  it("passes a rate up to 25 % inclusive", async () => {
    const report = await runOn(ds);
    for (const key of ["R0001", "R0002", "R0004"]) expect(resultFor(report, "DQ-10", key).outcome).toBe("pass");
  });

  it("flags a rate above 25 %, in basis points without floating point", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-10", "R0003")).toMatchObject({
      outcome: "fail",
      details: { otaFee: 1000001n, gross: 4000000n, rateBps: 2500, maxBps: 2500 },
      amountIdr: 4000000n,
    });
    expect(statusOf(report, "R0003")).toBe("review");
    const big = datasetFrom({ property: [PROPERTY], reservation: [{ ...RESERVATION, gross_booking_value: "1000", ota_fee: "999" }] });
    expect(resultFor(await runOn(big), "DQ-10", "R0001").details).toMatchObject({ rateBps: 9990 });
  });

  it("skips a fee out of bounds (DQ-08), a row already out, and alone a zero gross or unparsed values", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-10", "R0005").reason).toBe("OTA fee out of bounds (DQ-08)");
    expect(resultFor(report, "DQ-10", "R0006").reason).toBe("row excluded or duplicate by an earlier rule");
    const bad = datasetFrom({
      reservation: [
        { ...RESERVATION, ota_fee: "" },
        { ...RESERVATION, reservation_id: "R0002", gross_booking_value: "" },
        { ...RESERVATION, reservation_id: "R0003", gross_booking_value: "0", ota_fee: "0" },
      ],
    });
    expect(await skipsAlone(dq10, bad)).toEqual({
      R0001: "ota_fee not parsed (DQ-03)",
      R0002: "gross_booking_value not parsed (DQ-03)",
      R0003: "gross booking value is not positive (DQ-07)",
    });
  });
});
