import { describe, expect, it } from "vitest";
import { buildCases } from "../cases";
import { describeContract } from "../testing/contract";
import { datasetFrom, PAYMENT, PROPERTY, COMMISSION_RULE, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, resultsOf, runOn, statusOf } from "../testing/run";
import { dq01 } from "./dq01-exact-duplicate";
import { dq02 } from "./dq02-conflicting-versions";

const R0003 = { ...RESERVATION, reservation_id: "R0003", check_in: "2026-09-20", check_out: "2026-09-23" };

const ds = datasetFrom({
  property: [PROPERTY],
  commission_rule: [COMMISSION_RULE],
  reservation: [
    RESERVATION, // R0001, updated 01.09
    { ...RESERVATION, gross_booking_value: "3200000", updated_at: "2026-09-10" }, // the latest version of R0001
    { ...RESERVATION, gross_booking_value: "3100000", updated_at: "2026-09-05" }, // rows are not in time order
    RESERVATION, // exact copy: DQ-01, not a version
    { ...RESERVATION, reservation_id: "R0002", check_in: "2026-09-15", check_out: "2026-09-18" },
    R0003, // older: superseded
    { ...R0003, gross_booking_value: "3300000", updated_at: "2026-09-05" }, // two latest versions tie
    { ...R0003, gross_booking_value: "3400000", updated_at: "2026-09-05" },
    { ...RESERVATION, reservation_id: "" },
  ],
  payment: [
    { ...PAYMENT, reservation_id: "R0002" },
    { ...PAYMENT, reservation_id: "R0002", amount: "1" },
    { ...PAYMENT, reservation_id: "R0002", amount: "2" },
    { ...PAYMENT, payment_id: "P0002", amount: "2750000" }, // R0001's payout by its latest version: 3 200 000 − 450 000
  ],
});

describeContract(dq02, contextBefore(dq02, ds));

describe("DQ-02", () => {
  it("reservations: the latest updated_at stands by itself, older versions are superseded, in any row order", async () => {
    const report = await runOn(ds, { checks: [dq01, dq02] });
    const r0001 = resultsOf(report, "DQ-02").filter((r) => r.recordKey === "R0001");
    expect(r0001.map((r) => r.outcome)).toEqual(["fail", "pass", "fail", "skip"]);
    expect(r0001[0]).toMatchObject({
      action: "supersede",
      details: { versions: 3, updatedAt: "2026-09-01", latestUpdatedAt: "2026-09-10", latestUnitIds: ["reservations.csv:3"] },
      amountIdr: 3000000n,
    });
    expect(r0001[2]!.details).toMatchObject({ updatedAt: "2026-09-05", latestUpdatedAt: "2026-09-10" });
    expect(r0001[3]!.reason).toBe("exact duplicate of an earlier row (DQ-01)");
    expect(report.verdicts.filter((v) => v.recordKey === "R0001").map((v) => [v.status, v.ruleIds])).toEqual([
      ["superseded", ["DQ-02"]],
      ["clean", []],
      ["superseded", ["DQ-02"]],
      ["duplicate", ["DQ-01"]],
    ]);
  });

  it("a tie on the latest updated_at with different content goes to a human; the older version is still superseded", async () => {
    const report = await runOn(ds, { checks: [dq01, dq02] });
    const r0003 = resultsOf(report, "DQ-02").filter((r) => r.recordKey === "R0003");
    expect(r0003.map((r) => [r.outcome, r.action ?? null])).toEqual([
      ["fail", "supersede"],
      ["fail", null],
      ["fail", null],
    ]);
    expect(r0003[1]!.details).toEqual({
      caseKey: "V:reservation:R0003",
      versions: 2,
      otherUnitIds: ["reservations.csv:9"],
      updatedAt: "2026-09-05",
    });
    expect(report.verdicts.filter((v) => v.recordKey === "R0003").map((v) => v.status)).toEqual(["superseded", "pending", "pending"]);
    const [version] = buildCases(report).filter((c) => c.type === "version" && c.entity === "reservation");
    expect(version).toMatchObject({ caseKey: "V:reservation:R0003", unitIds: ["reservations.csv:8", "reservations.csv:9"] }); // not the superseded row
  });

  it("other entities have no updated_at: every version of a key goes to a human, as in v1", async () => {
    const report = await runOn(ds, { checks: [dq01, dq02] });
    const p = resultsOf(report, "DQ-02").filter((r) => r.recordKey === "P0001");
    expect(p.every((r) => r.outcome === "fail" && r.action === undefined)).toBe(true);
    expect(p[0]!.details).toMatchObject({ versions: 3, otherUnitIds: ["payments.csv:3", "payments.csv:4"], updatedAt: null });
  });

  it("a reservation version without updated_at cannot be ordered: a human decides", async () => {
    const report = await runOn(
      datasetFrom({ reservation: [RESERVATION, { ...RESERVATION, gross_booking_value: "1", updated_at: "" }] }),
      { checks: [dq01, dq02] },
    );
    expect(resultsOf(report, "DQ-02").map((r) => [r.outcome, r.action ?? null])).toEqual([
      ["fail", null],
      ["fail", null],
    ]);
  });

  it("passes a single version and skips a row without a key", async () => {
    const report = await runOn(ds, { checks: [dq01, dq02] });
    expect(statusOf(report, "R0002")).toBe("clean");
    const noKey = resultsOf(report, "DQ-02").find((r) => r.recordKey === null)!;
    expect(noKey).toMatchObject({ outcome: "skip", reason: "row has no natural key (DQ-03)" });
  });

  it("in a full run the older versions are out of every later rule: no self-overlap, the payment finds one reservation", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-05", "P0002").outcome).toBe("pass"); // not `hold` for several versions
    expect(resultFor(report, "DQ-14", "P0002").outcome).toBe("pass"); // amounts read from the version that stands
    const overlaps = resultsOf(report, "DQ-12").filter((r) => r.recordKey === "R0001");
    expect(overlaps.map((r) => r.outcome)).toEqual(["skip", "pass", "skip", "skip"]);
    expect(overlaps[0]!.reason).toBe("row excluded, duplicate or superseded by an earlier rule");
  });
});
