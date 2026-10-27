import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, datasetFrom, EXPENSE, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq04 } from "./dq04-property-exists";

const ds = datasetFrom({
  property: [PROPERTY, PROPERTY, { ...PROPERTY, property_id: "VILLA" }], // V001 twice (duplicate), VILLA fails DQ-03
  commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, property_id: "V002" }],
  reservation: [RESERVATION, { ...RESERVATION, reservation_id: "R0002", property_id: "V002" }, { ...RESERVATION, reservation_id: "R0003", property_id: "" }],
  payment: [PAYMENT, { ...PAYMENT, payment_id: "P0002", property_id: "V003" }],
  expense: [EXPENSE, { ...EXPENSE, expense_id: "E0002", property_id: "V777" }],
});

describeContract(dq04, contextBefore(dq04, ds));

describe("DQ-04", () => {
  it("passes rows of a known villa, the duplicate property row notwithstanding", async () => {
    const report = await runOn(ds);
    for (const key of ["V001@2026-09-01", "R0001", "P0001", "E0001"]) expect(resultFor(report, "DQ-04", key).outcome).toBe("pass");
  });

  it("excludes rows of an unknown villa with the villa and the amount", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-04", "R0002")).toMatchObject({ outcome: "fail", details: { propertyId: "V002" }, amountIdr: 3000000n });
    expect(resultFor(report, "DQ-04", "V002@2026-09-01")).toMatchObject({ outcome: "fail", details: { propertyId: "V002" } });
    expect(resultFor(report, "DQ-04", "V002@2026-09-01").amountIdr).toBeUndefined();
    expect(resultFor(report, "DQ-04", "P0002")).toMatchObject({ outcome: "fail", amountIdr: 2550000n });
    expect(resultFor(report, "DQ-04", "E0002")).toMatchObject({ outcome: "fail", details: { propertyId: "V777" }, amountIdr: 250000n });
    expect(statusOf(report, "R0002")).toBe("excluded");
  });

  it("a property row excluded by DQ-03 does not exist for its references", async () => {
    const bad = datasetFrom({ property: [{ ...PROPERTY, property_id: "V001", owner_id: "" }], reservation: [RESERVATION] });
    const report = await runOn(bad);
    expect(statusOf(report, "V001")).toBe("excluded");
    expect(resultFor(report, "DQ-04", "R0001").outcome).toBe("fail");
  });

  it("skips a row already out, and alone a row whose villa did not parse", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-04", "R0003").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    expect(await skipsAlone(dq04, ds)).toEqual({ R0003: "property_id not parsed (DQ-03)" });
  });
});
