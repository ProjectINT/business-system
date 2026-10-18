import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, datasetFrom, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runAlone, runOn, skipsAlone, statusOf } from "../testing/run";
import { conflictGroups, dq12, groupKey, overlapPairs, stayCandidates, staysOverlap, type StayCandidate } from "./dq12-stay-overlap";

const res = (reservation_id: string, check_in: string, check_out: string, extra: Record<string, string> = {}) => ({
  ...RESERVATION,
  reservation_id,
  check_in,
  check_out,
  ...extra,
});

// VALIDATION_PLAN.md 9.3: the boundary cases of the half-open interval.
const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002" }],
  commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, property_id: "V002" }],
  reservation: [
    res("R0001", "2026-09-01", "2026-09-05"),
    res("R0002", "2026-09-05", "2026-09-08"), // check-in on R0001's check-out day: no overlap
    res("R0003", "2026-09-04", "2026-09-08"), // one shared night with R0001 (04.09), three with R0002
    res("R0004", "2026-09-07", "2026-09-10"), // chains onto R0002 and R0003
    res("R0005", "2026-09-20", "2026-09-27"), // same dates as R0006: not a duplicate
    res("R0006", "2026-09-20", "2026-09-27", { gross_booking_value: "1000000" }),
    res("R0007", "2026-10-01", "2026-10-11"), // R0008 inside it
    res("R0008", "2026-10-03", "2026-10-05", { status: "modified" }),
    res("R0009", "2026-10-01", "2026-10-11", { status: "cancelled" }), // a cancellation blocks nothing
    res("R0010", "2026-09-01", "2026-09-05", { property_id: "V002" }), // another villa
    res("R0011", "2026-09-01", "2026-09-05", { property_id: "V999" }), // out by DQ-04
    res("R0012", "2026-11-01", "2026-11-01"), // no stay: out by DQ-07
    res("R0013", "2026-11-10", "2026-11-12"), // free
  ],
});

describeContract(dq12, contextBefore(dq12, ds));

describe("DQ-12 boundaries (9.3)", () => {
  it("check-out and check-in on the same day do not overlap", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-12", "R0001").relatedKeys).toEqual(["R0003"]);
    expect(resultFor(report, "DQ-12", "R0002").relatedKeys).toEqual(["R0003", "R0004"]);
  });

  it("one shared night is an overlap of one night", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-12", "R0001").details).toEqual({
      caseKey: "V001:R0001,R0002,R0003,R0004",
      pairs: [{ with: "R0003", from: "2026-09-04", to: "2026-09-05", nights: 1, kind: "partial" }],
    });
    expect(statusOf(report, "R0001")).toBe("pending");
  });

  it("same dates are same_dates, not a duplicate; a stay inside another is partial or modified_version", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-12", "R0005").details).toEqual({
      caseKey: "V001:R0005,R0006",
      pairs: [{ with: "R0006", from: "2026-09-20", to: "2026-09-27", nights: 7, kind: "same_dates" }],
    });
    expect(resultFor(report, "DQ-01", "R0006").outcome).toBe("pass");
    expect(resultFor(report, "DQ-12", "R0007").details).toEqual({
      caseKey: "V001:R0007,R0008",
      pairs: [{ with: "R0008", from: "2026-10-03", to: "2026-10-05", nights: 2, kind: "modified_version" }],
    });
  });

  it("a cancellation, another villa, and excluded rows do not block; a free reservation passes", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-12", "R0009")).toMatchObject({ outcome: "skip", reason: "cancelled reservation" });
    expect(resultFor(report, "DQ-12", "R0010").outcome).toBe("pass");
    expect(resultFor(report, "DQ-12", "R0011").reason).toBe("row excluded or duplicate by an earlier rule");
    expect(resultFor(report, "DQ-12", "R0012").reason).toBe("row excluded or duplicate by an earlier rule");
    expect(resultFor(report, "DQ-12", "R0013").outcome).toBe("pass");
    expect(statusOf(report, "R0013")).toBe("clean");
  });

  it("groups are connected components with a stable key; amounts are the gross", async () => {
    const report = await runOn(ds);
    const groups = new Set(report.results.get("DQ-12")!.filter((r) => r.outcome === "fail").map((r) => (r.details as { caseKey: string }).caseKey));
    expect([...groups].sort()).toEqual(["V001:R0001,R0002,R0003,R0004", "V001:R0005,R0006", "V001:R0007,R0008"]);
    expect(resultFor(report, "DQ-12", "R0006").amountIdr).toBe(1000000n);
    expect(groupKey("V003", ["R0029", "R0017"])).toBe("V003:R0017,R0029");
  });

  it("two live versions of one id (DQ-02) each pair with the others, never with each other", async () => {
    const versions = datasetFrom({
      property: [PROPERTY],
      reservation: [res("R0001", "2026-09-01", "2026-09-05"), res("R0001", "2026-09-02", "2026-09-06"), res("R0002", "2026-09-04", "2026-09-08")],
    });
    const report = await runOn(versions);
    const r0001 = report.results.get("DQ-12")!.filter((r) => r.recordKey === "R0001");
    expect(r0001.map((r) => r.relatedKeys)).toEqual([["R0002"], ["R0002"]]);
    expect(resultFor(report, "DQ-12", "R0002").relatedKeys).toEqual(["R0001"]);
  });

  it("alone: skips unparsed values, empty stays and rows without a key", async () => {
    const bad = datasetFrom({
      reservation: [
        res("R0001", "2026-09-01", "2026-09-05", { status: "" }),
        res("R0002", "2026-09-01", "2026-09-05", { property_id: "" }),
        res("R0003", "x", "2026-09-05"),
        res("R0004", "2026-09-05", "2026-09-05"),
        res("", "2026-09-01", "2026-09-05"),
      ],
    });
    expect(await skipsAlone(dq12, bad)).toEqual({
      R0001: "status not parsed (DQ-03)",
      R0002: "property_id not parsed (DQ-03)",
      R0003: "check_in / check_out not parsed (DQ-03)",
      R0004: "no stay: check-out is not after check-in (DQ-07)",
      "reservations.csv:6": "row has no natural key (DQ-03)",
    });
    expect(await runAlone(dq12, bad)).toHaveLength(5);
  });

  it("the SQL version is not here yet", async () => {
    await expect(dq12.run({} as never)).rejects.toThrow(/phase 7b/);
  });
});

describe("overlap helpers", () => {
  const stay = (key: string, checkIn: string, checkOut: string, propertyId = "V001", status: "confirmed" | "modified" = "confirmed"): StayCandidate =>
    ({ key, checkIn, checkOut, propertyId, status, unit: {} }) as unknown as StayCandidate;

  it("staysOverlap is symmetric and half-open", () => {
    const a = stay("A", "2026-09-01", "2026-09-05");
    expect(staysOverlap(a, stay("B", "2026-09-05", "2026-09-08"))).toBe(false);
    expect(staysOverlap(stay("B", "2026-09-05", "2026-09-08"), a)).toBe(false);
    expect(staysOverlap(a, stay("C", "2026-09-04", "2026-09-08"))).toBe(true);
    expect(staysOverlap(stay("C", "2026-09-04", "2026-09-08"), a)).toBe(true);
    expect(staysOverlap(a, stay("D", "2026-08-01", "2026-09-02"))).toBe(true);
  });

  it("overlapPairs orders pairs and never pairs across villas; conflictGroups separates components", () => {
    const pairs = overlapPairs([
      stay("R0003", "2026-09-04", "2026-09-08"),
      stay("R0001", "2026-09-01", "2026-09-05"),
      stay("R0009", "2026-09-20", "2026-09-22", "V002"),
      stay("R0008", "2026-09-21", "2026-09-23", "V002", "modified"),
      stay("R0002", "2026-09-21", "2026-09-23"), // V001, alone
    ]);
    expect(pairs.map((p) => `${p.a}/${p.b}:${p.kind}`)).toEqual(["R0001/R0003:partial", "R0008/R0009:modified_version"]);
    const groups = conflictGroups(pairs);
    expect(groups.get("R0001")).toEqual({ caseKey: "V001:R0001,R0003", propertyId: "V001", keys: ["R0001", "R0003"] });
    expect(groups.get("R0003")).toBe(groups.get("R0001"));
    expect(groups.get("R0009")!.caseKey).toBe("V002:R0008,R0009");
    expect(groups.has("R0002")).toBe(false);
    expect(conflictGroups([]).size).toBe(0);
  });

  it("stayCandidates reads the context once", async () => {
    const ctx = await contextBefore(dq12, ds)();
    const { candidates, skipped } = stayCandidates(ctx);
    expect(candidates.map((c) => c.key)).toEqual(["R0001", "R0002", "R0003", "R0004", "R0005", "R0006", "R0007", "R0008", "R0010", "R0013"]);
    expect(skipped).toHaveLength(3);
  });
});
