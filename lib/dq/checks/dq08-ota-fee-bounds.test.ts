import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, PROPERTY, RESERVATION, apart, datasetFrom } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq08 } from "./dq08-ota-fee-bounds";

const ds = datasetFrom({
  property: [PROPERTY],
  commission_rule: [COMMISSION_RULE],
  reservation: apart([
    RESERVATION,
    { ...RESERVATION, reservation_id: "R0002", ota_fee: "-100000" },
    { ...RESERVATION, reservation_id: "R0003", ota_fee: "3000001" },
    { ...RESERVATION, reservation_id: "R0004", ota_fee: "3000000" }, // equal to the gross: allowed
    { ...RESERVATION, reservation_id: "R0005", ota_fee: "0" },
    { ...RESERVATION, reservation_id: "R0006", ota_fee: "-1", property_id: "V999" }, // out by DQ-04
  ]),
});

describeContract(dq08, contextBefore(dq08, ds));

describe("DQ-08", () => {
  it("passes a fee between zero and the gross, both ends included", async () => {
    const report = await runOn(ds);
    for (const key of ["R0001", "R0004", "R0005"]) expect(resultFor(report, "DQ-08", key).outcome).toBe("pass");
  });

  it("flags a negative fee or a fee above the gross; the reservation stays, under review", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-08", "R0002")).toMatchObject({ outcome: "fail", details: { otaFee: -100000n, gross: 3000000n }, amountIdr: 3000000n });
    expect(resultFor(report, "DQ-08", "R0003")).toMatchObject({ outcome: "fail", details: { otaFee: 3000001n } });
    expect(statusOf(report, "R0002")).toBe("review");
    expect(statusOf(report, "R0003")).toBe("review");
  });

  it("skips a row already out, and alone rows whose fee or gross did not parse", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-08", "R0006").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const bad = datasetFrom({ reservation: [{ ...RESERVATION, ota_fee: "" }, { ...RESERVATION, reservation_id: "R0002", gross_booking_value: "" }] });
    expect(await skipsAlone(dq08, bad)).toEqual({ R0001: "ota_fee not parsed (DQ-03)", R0002: "gross_booking_value not parsed (DQ-03)" });
  });
});
