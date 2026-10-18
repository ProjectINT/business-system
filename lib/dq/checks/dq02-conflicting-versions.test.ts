import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { datasetFrom, PAYMENT, RESERVATION } from "../testing/fixture";
import { contextBefore, resultsOf, runOn, statusOf } from "../testing/run";
import { dq01 } from "./dq01-exact-duplicate";
import { dq02 } from "./dq02-conflicting-versions";

const ds = datasetFrom({
  reservation: [
    RESERVATION,
    { ...RESERVATION, gross_booking_value: "3100000", updated_at: "2026-09-05" }, // version 2 of R0001
    RESERVATION, // exact copy: DQ-01, not a version
    { ...RESERVATION, reservation_id: "R0002" },
    { ...RESERVATION, reservation_id: "" },
  ],
  payment: [PAYMENT, { ...PAYMENT, amount: "1" }, { ...PAYMENT, amount: "2" }],
});

describeContract(dq02, contextBefore(dq02, ds));

describe("DQ-02", () => {
  it("asks a human about every live version of a key, with the case key and the other versions", async () => {
    const report = await runOn(ds, { checks: [dq01, dq02] });
    const r0001 = resultsOf(report, "DQ-02").filter((r) => r.recordKey === "R0001");
    expect(r0001.map((r) => r.outcome)).toEqual(["fail", "fail", "skip"]);
    expect(r0001[0]).toMatchObject({
      details: { caseKey: "V:reservation:R0001", versions: 2, otherUnitIds: ["reservations.csv:3"], updatedAt: "2026-09-01" },
      amountIdr: 3000000n,
    });
    expect(r0001[1]!.details).toMatchObject({ otherUnitIds: ["reservations.csv:2"], updatedAt: "2026-09-05" });
    expect(r0001[2]!.reason).toBe("exact duplicate of an earlier row (DQ-01)");
    expect(report.verdicts.filter((v) => v.recordKey === "R0001").map((v) => v.status)).toEqual(["pending", "pending", "duplicate"]);
  });

  it("handles three versions, and rows without updated_at", async () => {
    const report = await runOn(ds, { checks: [dq01, dq02] });
    const p = resultsOf(report, "DQ-02").filter((r) => r.recordKey === "P0001");
    expect(p.every((r) => r.outcome === "fail")).toBe(true);
    expect(p[0]!.details).toMatchObject({ versions: 3, otherUnitIds: ["payments.csv:3", "payments.csv:4"], updatedAt: null });
  });

  it("passes a single version and skips a row without a key", async () => {
    const report = await runOn(ds, { checks: [dq01, dq02] });
    expect(statusOf(report, "R0002")).toBe("clean");
    const noKey = resultsOf(report, "DQ-02").find((r) => r.recordKey === null)!;
    expect(noKey).toMatchObject({ outcome: "skip", reason: "row has no natural key (DQ-03)" });
  });
});
