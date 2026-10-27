import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { datasetFrom, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq09 } from "./dq09-refund-consistent";

const cancelled = { ...RESERVATION, status: "cancelled", refund_amount: "3000000" };

const ds = datasetFrom({
  property: [PROPERTY],
  reservation: [
    RESERVATION,
    { ...cancelled, reservation_id: "R0002" },
    { ...cancelled, reservation_id: "R0003", refund_amount: "0" },
    { ...RESERVATION, reservation_id: "R0004", refund_amount: "3900000" }, // confirmed, above the gross: R0072
    { ...RESERVATION, reservation_id: "R0005", refund_amount: "-1" },
    { ...RESERVATION, reservation_id: "R0006", refund_amount: "100" }, // confirmed with a refund
    { ...cancelled, reservation_id: "R0007", refund_amount: "3000001" },
    { ...RESERVATION, reservation_id: "R0008", refund_amount: "1", property_id: "V999" },
  ],
});

describeContract(dq09, contextBefore(dq09, ds));

describe("DQ-09", () => {
  it("passes no refund, and a cancellation refunded up to the gross", async () => {
    const report = await runOn(ds);
    for (const key of ["R0001", "R0002", "R0003"]) expect(resultFor(report, "DQ-09", key).outcome).toBe("pass");
  });

  it("excludes and names every problem: above the gross, negative, refund without a cancellation", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-09", "R0004")).toMatchObject({
      outcome: "fail",
      details: { refund: 3900000n, gross: 3000000n, status: "confirmed", problems: ["refund_above_gross", "refund_without_cancellation"] },
      amountIdr: 3000000n,
    });
    expect(resultFor(report, "DQ-09", "R0005").details).toMatchObject({ problems: ["refund_negative"] });
    expect(resultFor(report, "DQ-09", "R0006").details).toMatchObject({ problems: ["refund_without_cancellation"] });
    expect(resultFor(report, "DQ-09", "R0007").details).toMatchObject({ problems: ["refund_above_gross"] });
    expect(statusOf(report, "R0004")).toBe("excluded");
  });

  it("skips a row already out, and alone rows whose refund, gross or status did not parse", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-09", "R0008").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const bad = datasetFrom({
      reservation: [
        { ...RESERVATION, refund_amount: "" },
        { ...RESERVATION, reservation_id: "R0002", gross_booking_value: "" },
        { ...RESERVATION, reservation_id: "R0003", status: "" },
      ],
    });
    expect(await skipsAlone(dq09, bad)).toEqual({
      R0001: "refund_amount not parsed (DQ-03)",
      R0002: "gross_booking_value not parsed (DQ-03)",
      R0003: "status not parsed (DQ-03)",
    });
  });
});
