import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, datasetFrom, EXPENSE, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, outcomeOf, resultFor, runOn, statusOf } from "../testing/run";
import { dq03 } from "./dq03-schema-and-format";

const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "VILLA-2" }],
  commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, property_id: "V002", management_fee_rate: "17%" }],
  reservation: [
    RESERVATION,
    { ...RESERVATION, reservation_id: "R0002", check_in: "2026-13-01" },
    { ...RESERVATION, reservation_id: "R02", property_id: "V1" },
    { ...RESERVATION, reservation_id: "" },
    { ...RESERVATION, reservation_id: "R0005", gross_booking_value: "100.50" },
  ],
  payment: [PAYMENT, { ...PAYMENT, payment_id: "P0002", reservation_id: "X0001" }],
  expense: [EXPENSE, { ...EXPENSE, expense_id: "E0002", payment_status: "maybe" }],
});

describeContract(dq03, contextBefore(dq03, ds));

describe("DQ-03", () => {
  it("passes rows that parse and have well-formed ids", async () => {
    const report = await runOn(ds, { checks: [dq03] });
    for (const key of ["V001", "V001@2026-09-01", "R0001", "P0001", "E0001"]) expect(outcomeOf(report, "DQ-03", key)).toBe("pass");
    expect(statusOf(report, "R0001")).toBe("clean");
  });

  it("excludes a row with a parse issue and reports the issue as a fact", async () => {
    const report = await runOn(ds, { checks: [dq03] });
    expect(resultFor(report, "DQ-03", "R0002")).toMatchObject({
      outcome: "fail",
      entity: "reservation",
      details: { issues: [{ field: "check_in", value: "2026-13-01", message: "not a calendar date YYYY-MM-DD" }] },
      amountIdr: 3000000n,
    });
    expect(statusOf(report, "R0002")).toBe("excluded");
    expect(resultFor(report, "DQ-03", "R0005").details).toEqual({
      issues: [{ field: "gross_booking_value", value: "100.50", message: "not a whole amount" }],
    });
    expect(resultFor(report, "DQ-03", "V002@2026-09-01").outcome).toBe("fail");
    expect(resultFor(report, "DQ-03", "E0002").outcome).toBe("fail");
  });

  it("excludes ids outside the house format, in any column that holds one", async () => {
    const report = await runOn(ds, { checks: [dq03] });
    expect(resultFor(report, "DQ-03", "R02").details).toEqual({
      issues: [
        { field: "reservation_id", value: "R02", message: "not in the format ^R\\d{4}$" },
        { field: "property_id", value: "V1", message: "not in the format ^V\\d{3}$" },
      ],
    });
    expect(resultFor(report, "DQ-03", "VILLA-2").outcome).toBe("fail");
    expect(resultFor(report, "DQ-03", "P0002").details).toEqual({
      issues: [{ field: "reservation_id", value: "X0001", message: "not in the format ^R\\d{4}$" }],
    });
  });

  it("excludes a row without a natural key", async () => {
    const report = await runOn(ds, { checks: [dq03] });
    const noKey = report.results.get("DQ-03")!.find((r) => r.recordKey === null)!;
    expect(noKey.outcome).toBe("fail");
    expect(noKey.details).toEqual({ issues: [{ field: "reservation_id", value: "", message: "empty" }] });
  });

});
