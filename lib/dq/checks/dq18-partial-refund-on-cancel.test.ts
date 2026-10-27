import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, PROPERTY, RESERVATION, datasetFrom } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq18 } from "./dq18-partial-refund-on-cancel";

const cancelled = { ...RESERVATION, status: "cancelled" };
const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002", base_currency: "USD" }],
  commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, property_id: "V002" }],
  reservation: [
    RESERVATION,
    { ...cancelled, reservation_id: "R0002", refund_amount: "3000000" },
    { ...cancelled, reservation_id: "R0003", refund_amount: "0" },
    { ...cancelled, reservation_id: "R0004", refund_amount: "1000000" },
    { ...cancelled, reservation_id: "R0005", refund_amount: "1000000", property_id: "V002", currency: "USD" },
    { ...cancelled, reservation_id: "R0006", refund_amount: "1", property_id: "V999" },
  ],
});

describeContract(dq18, contextBefore(dq18, ds));

describe("DQ-18", () => {
  it("passes a full refund and no refund; skips what is not a cancellation", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-18", "R0001").reason).toBe("not a cancellation");
    expect(resultFor(report, "DQ-18", "R0002").outcome).toBe("pass");
    expect(resultFor(report, "DQ-18", "R0003").outcome).toBe("pass");
  });

  it("flags a partial refund with the retained part as the amount in question", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-18", "R0004")).toMatchObject({ outcome: "fail", details: { gross: 3000000n, refund: 1000000n, retained: 2000000n }, amountIdr: 2000000n });
    expect(statusOf(report, "R0004")).toBe("review");
    expect(resultFor(report, "DQ-18", "R0005").amountIdr).toBeUndefined();
  });

  it("skips a row already out, and alone unparsed values", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-18", "R0006").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const bad = datasetFrom({
      reservation: [
        { ...RESERVATION, status: "" },
        { ...cancelled, reservation_id: "R0002", refund_amount: "" },
        { ...cancelled, reservation_id: "R0003", gross_booking_value: "" },
      ],
    });
    expect(await skipsAlone(dq18, bad)).toEqual({
      R0001: "status not parsed (DQ-03)",
      R0002: "refund_amount not parsed (DQ-03)",
      R0003: "gross_booking_value not parsed (DQ-03)",
    });
  });
});
