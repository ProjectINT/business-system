import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, PROPERTY, RESERVATION, datasetFrom } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq13, modificationCaseKey } from "./dq13-modified-without-origin";

const ds = datasetFrom({
  property: [PROPERTY],
  commission_rule: [COMMISSION_RULE],
  reservation: [
    RESERVATION,
    { ...RESERVATION, reservation_id: "R0002", status: "modified", updated_at: "2026-09-20" },
    { ...RESERVATION, reservation_id: "R0003", status: "cancelled" },
    { ...RESERVATION, reservation_id: "R0004", status: "modified", property_id: "V999" },
  ],
});

describeContract(dq13, contextBefore(dq13, ds));

describe("DQ-13", () => {
  it("every modified reservation waits for a human; the others are skipped", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-13", "R0002")).toMatchObject({
      outcome: "fail",
      details: { status: "modified", propertyId: "V001", updatedAt: "2026-09-20" },
      amountIdr: 3000000n,
    });
    expect(statusOf(report, "R0002")).toBe("pending");
    expect(resultFor(report, "DQ-13", "R0001").reason).toBe("status is not modified");
    expect(resultFor(report, "DQ-13", "R0003").reason).toBe("status is not modified");
    expect(modificationCaseKey("R0002")).toBe("M:R0002");
  });

  it("skips a modified reservation already out, and alone one whose status did not parse", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-13", "R0004").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    expect(statusOf(report, "R0004")).toBe("excluded");
    expect(await skipsAlone(dq13, datasetFrom({ reservation: [{ ...RESERVATION, status: "" }] }))).toEqual({ R0001: "status not parsed (DQ-03)" });
  });
});
