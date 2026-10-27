import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES } from "../../calc";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, datasetFrom, PROPERTY } from "../testing/fixture";
import { contextBefore, resultFor, runAlone, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq22 } from "./dq22-commission-rule-overlap";

const rule = (property_id: string, effective_from: string, effective_to: string, rate = "0.15") => ({
  ...COMMISSION_RULE,
  property_id,
  effective_from,
  effective_to,
  management_fee_rate: rate,
});

const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002" }, { ...PROPERTY, property_id: "V003" }],
  commission_rule: [
    rule("V001", "2026-09-01", "2026-09-30"),
    rule("V001", "2026-09-15", "", "0.17"), // overlaps the first from 15.09, open-ended
    rule("V001", "2026-10-01", "2026-12-31", "0.2"), // overlaps the open-ended one
    rule("V002", "2026-09-01", "2026-09-30"),
    rule("V002", "2026-10-01", ""), // adjacent, no shared date
    rule("V003", "2026-09-01", "2026-09-30"),
    rule("V003", "2026-09-30", ""), // shares exactly one date: effective_to is inclusive
    rule("V003", "2026-09-01", "2026-09-30"), // exact duplicate → DQ-01
    rule("V007", "2026-09-20", "2026-10-31"), // two bounded periods, listed later-first
    rule("V007", "2026-09-01", "2026-09-30"),
  ],
});

const latestStart = { policies: { ...DEFAULT_POLICIES, commissionRuleOverlap: "latest-start" as const } };

describeContract(dq22, contextBefore(dq22, ds));

describe("DQ-22", () => {
  it("default 'ambiguous': flags both rules of an overlap, no rule is in force on the shared dates", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-22", "V001@2026-09-01")).toMatchObject({
      outcome: "fail",
      relatedKeys: ["V001@2026-09-15"],
      details: { overlaps: [{ other: "V001@2026-09-15", from: "2026-09-15", to: "2026-09-30", inForce: null }] },
    });
    expect(statusOf(report, "V001@2026-09-01")).toBe("review"); // a flag: both rules stay in the data
  });

  it("'latest-start': names the rule in force on the shared dates", async () => {
    const report = await runOn(ds, latestStart);
    expect(resultFor(report, "DQ-22", "V001@2026-09-01")).toMatchObject({
      outcome: "fail",
      relatedKeys: ["V001@2026-09-15"],
      details: {
        rate: "0.15",
        overlaps: [{ other: "V001@2026-09-15", from: "2026-09-15", to: "2026-09-30", inForce: "V001@2026-09-15" }],
      },
    });
    expect(resultFor(report, "DQ-22", "V001@2026-09-15").details).toEqual({
      rate: "0.17",
      overlaps: [
        { other: "V001@2026-09-01", from: "2026-09-15", to: "2026-09-30", inForce: "V001@2026-09-15" },
        { other: "V001@2026-10-01", from: "2026-10-01", to: "2026-12-31", inForce: "V001@2026-10-01" },
      ],
    });
    expect(resultFor(report, "DQ-22", "V001@2026-10-01").details).toMatchObject({
      overlaps: [{ other: "V001@2026-09-15", from: "2026-10-01", to: "2026-12-31", inForce: "V001@2026-10-01" }],
    });
  });

  it("adjacent periods do not overlap; a shared end date does", async () => {
    const report = await runOn(ds, latestStart);
    expect(resultFor(report, "DQ-22", "V002@2026-09-01").outcome).toBe("pass");
    expect(resultFor(report, "DQ-22", "V002@2026-10-01").outcome).toBe("pass");
    expect(resultFor(report, "DQ-22", "V003@2026-09-30")).toMatchObject({
      outcome: "fail",
      details: { overlaps: [{ other: "V003@2026-09-01", from: "2026-09-30", to: "2026-09-30", inForce: "V003@2026-09-30" }] },
    });
  });

  it("two bounded periods: the overlap ends with the earlier end", async () => {
    const report = await runOn(ds, latestStart);
    expect(resultFor(report, "DQ-22", "V007@2026-09-20").details).toMatchObject({
      overlaps: [{ other: "V007@2026-09-01", from: "2026-09-20", to: "2026-09-30", inForce: "V007@2026-09-20" }],
    });
    expect(resultFor(report, "DQ-22", "V007@2026-09-01").details).toMatchObject({ overlaps: [{ to: "2026-09-30" }] });
  });

  it("skips a duplicate copy, and two open-ended rules overlap without an end", async () => {
    const report = await runOn(ds);
    const v003 = report.results.get("DQ-22")!.filter((r) => r.recordKey === "V003@2026-09-01");
    expect(v003.map((r) => r.outcome)).toEqual(["fail", "skip"]);
    expect(v003[1]!.reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const open = datasetFrom({ commission_rule: [rule("V001", "2026-10-01", ""), rule("V001", "2026-09-01", ""), rule("V001", "2026-09-15", "")] });
    const r = await runOn(open, latestStart);
    expect(resultFor(r, "DQ-22", "V001@2026-09-01").details).toMatchObject({
      overlaps: [
        { other: "V001@2026-09-15", from: "2026-09-15", to: null, inForce: "V001@2026-09-15" },
        { other: "V001@2026-10-01", from: "2026-10-01", to: null, inForce: "V001@2026-10-01" },
      ],
    });
    expect(resultFor(r, "DQ-22", "V001@2026-09-15").relatedKeys).toEqual(["V001@2026-09-01", "V001@2026-10-01"]); // sorted, not in row order
  });

  it("alone: skips rows whose property or start date did not parse; an unparsed rate is null in the details", async () => {
    const bad = datasetFrom({
      commission_rule: [
        { ...COMMISSION_RULE, property_id: "" },
        { ...COMMISSION_RULE, effective_from: "soon" },
        COMMISSION_RULE,
        { ...COMMISSION_RULE, effective_from: "2026-09-10", management_fee_rate: "17%" },
      ],
    });
    expect(await skipsAlone(dq22, bad)).toEqual({
      "commission_rules.csv:2": "property_id not parsed (DQ-03)",
      "V001@soon": "effective_from not parsed (DQ-03)",
    });
    const alone = await runAlone(dq22, bad);
    expect(alone.find((r) => r.recordKey === "V001@2026-09-10")!.details).toMatchObject({ rate: null });
    expect(alone.find((r) => r.recordKey === "V001@2026-09-01")!.details).toMatchObject({ rate: "0.15" });
  });

  it("the SQL version is not here yet", async () => {
    await expect(dq22.run({} as never)).rejects.toThrow(/phase 7b/);
  });
});
