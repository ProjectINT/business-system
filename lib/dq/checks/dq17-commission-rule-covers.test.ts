import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES } from "../../calc";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, datasetFrom, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq17 } from "./dq17-commission-rule-covers";

const rule = (property_id: string, effective_from: string, effective_to: string, rate = "0.15") => ({
  ...COMMISSION_RULE,
  property_id,
  effective_from,
  effective_to,
  management_fee_rate: rate,
});
const res = (reservation_id: string, property_id: string, check_in: string, check_out: string, status = "confirmed") => ({
  ...RESERVATION,
  reservation_id,
  property_id,
  check_in,
  check_out,
  status,
});

const ds = datasetFrom({
  property: ["V001", "V002", "V003", "V004", "V005", "V006"].map((property_id) => ({ ...PROPERTY, property_id })),
  commission_rule: [
    rule("V001", "2026-09-01", "2026-09-30"),
    rule("V001", "2026-10-01", "", "0.17"),
    rule("V003", "2026-09-01", "2026-09-15"), // V003 has a gap after 15.09
    rule("V004", "2026-09-01", "", "0.1"),
    rule("V004", "2026-09-01", "", "0.2"), // same key, other content: DQ-02, both live
    rule("V005", "2026-09-01", "2026-09-30"),
    rule("V006", "2026-09-01", "2026-09-30"),
    rule("V006", "2026-09-15", "", "0.17"), // overlap (DQ-22): no rate by default, the later rule under latest-start
  ],
  reservation: [
    res("R0001", "V001", "2026-09-10", "2026-09-13"),
    res("R0002", "V001", "2026-09-28", "2026-10-02"), // crosses the rate change
    res("R0003", "V001", "2026-10-05", "2026-10-08"),
    res("R0004", "V002", "2026-09-10", "2026-09-13"), // villa without rules
    res("R0005", "V003", "2026-09-14", "2026-09-17"), // runs into the gap
    res("R0006", "V004", "2026-09-10", "2026-09-13"), // two rules start the same day
    res("R0007", "V001", "2026-09-10", "2026-09-13", "cancelled"),
    res("R0008", "V999", "2026-09-10", "2026-09-13"),
    res("R0009", "V005", "2026-09-30", "2026-10-01"), // one night on the rule's last day; nothing after
    res("R0010", "V006", "2026-09-20", "2026-09-23"), // two rules cover every night
  ],
});

describeContract(dq17, contextBefore(dq17, ds));

describe("DQ-17", () => {
  it("passes a stay covered by one rule, including the rule's last day", async () => {
    const report = await runOn(ds);
    for (const key of ["R0001", "R0003", "R0009"]) expect(resultFor(report, "DQ-17", key).outcome).toBe("pass");
  });

  it("two rules with different start dates on a night: ambiguous by default, the later one under 'latest-start'", async () => {
    expect(resultFor(await runOn(ds), "DQ-17", "R0010").details).toEqual({ problem: "ambiguous", date: "2026-09-20" });
    const latestStart = await runOn(ds, { policies: { ...DEFAULT_POLICIES, commissionRuleOverlap: "latest-start" } });
    expect(resultFor(latestStart, "DQ-17", "R0010").outcome).toBe("pass");
  });

  it("a rate change inside the stay is fine: each night takes its own rule", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-17", "R0002").outcome).toBe("pass"); // 0.15 until 30.09, 0.17 from 01.10
  });

  it("excludes a stay with a night without a rule, naming the first such night: at check-in or in a gap", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-17", "R0004")).toMatchObject({ outcome: "fail", details: { problem: "no_rule", date: "2026-09-10" }, amountIdr: 3000000n });
    expect(statusOf(report, "R0004")).toBe("excluded"); // no rate, no fee: ТЗ п. 14 of the final test
    expect(resultFor(report, "DQ-17", "R0005").details).toEqual({ problem: "no_rule", date: "2026-09-16" });
  });

  it("the final test's R101: a rule ending 30.11 and a stay 29.11–03.12 → 01.12, the first night without one; 17 % and 20 % joined at 30.11 / 01.12 pass", async () => {
    const r101 = datasetFrom({
      property: [PROPERTY],
      commission_rule: [rule("V001", "2026-11-01", "2026-11-30", "0.17")],
      reservation: [res("R0101", "V001", "2026-11-29", "2026-12-03")],
    });
    expect(resultFor(await runOn(r101), "DQ-17", "R0101").details).toEqual({ problem: "no_rule", date: "2026-12-01" });
    const both = datasetFrom({
      property: [PROPERTY],
      commission_rule: [rule("V001", "2026-11-01", "2026-11-30", "0.17"), rule("V001", "2026-12-01", "2026-12-31", "0.2")],
      reservation: [res("R0101", "V001", "2026-11-29", "2026-12-03")],
    });
    expect(resultFor(await runOn(both), "DQ-17", "R0101").outcome).toBe("pass");
  });

  it("two live versions of a rule starting the same day are ambiguous (DQ-02 holds them)", async () => {
    const report = await runOn(ds);
    expect(report.verdicts.filter((v) => v.recordKey === "V004@2026-09-01").map((v) => v.status)).toEqual(["pending", "pending"]);
    expect(resultFor(report, "DQ-17", "R0006").details).toEqual({ problem: "ambiguous", date: "2026-09-10" });
  });

  it("skips cancellations, rows already out, and alone unparsed values, unknown villas and empty stays", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-17", "R0007").reason).toBe("cancelled reservation");
    expect(resultFor(report, "DQ-17", "R0008").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const bad = datasetFrom({
      property: [PROPERTY],
      commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, property_id: "" }],
      reservation: [
        { ...RESERVATION, status: "" },
        { ...RESERVATION, reservation_id: "R0002", property_id: "" },
        { ...RESERVATION, reservation_id: "R0003", check_in: "" },
        { ...RESERVATION, reservation_id: "R0004", property_id: "V009" },
        { ...RESERVATION, reservation_id: "R0005", check_out: "2026-09-10" },
      ],
    });
    expect(await skipsAlone(dq17, bad)).toEqual({
      R0001: "status not parsed (DQ-03)",
      R0002: "property_id not parsed (DQ-03)",
      R0003: "check_in / check_out not parsed (DQ-03)",
      R0004: "property not found (DQ-04)",
      R0005: "no stay: check-out is not after check-in (DQ-07)",
    });
  });
});
