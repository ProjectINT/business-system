import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq25 } from "./dq25-payment-status";

const ds = datasetFrom({
  property: [PROPERTY],
  commission_rule: [COMMISSION_RULE],
  reservation: [RESERVATION],
  payment: [
    PAYMENT,
    { ...PAYMENT, payment_id: "P0002", status: "pending" },
    { ...PAYMENT, payment_id: "P0003", status: "refunded" },
    { ...PAYMENT, payment_id: "P0004", status: "pending", currency: "USD" },
    { ...PAYMENT, payment_id: "P0005", property_id: "V999", status: "pending" },
  ],
});

describeContract(dq25, contextBefore(dq25, ds));

describe("DQ-25", () => {
  it("received is money: pass", async () => {
    expect(resultFor(await runOn(ds), "DQ-25", "P0001").outcome).toBe("pass");
  });

  it("pending is not money yet: a note, the payment stays in the data", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-25", "P0002")).toMatchObject({ outcome: "fail", action: "info", details: { status: "pending" }, amountIdr: 2550000n });
    expect(statusOf(report, "P0002")).toBe("clean");
  });

  it("any other status is excluded, its amount in question", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-25", "P0003")).toMatchObject({ outcome: "fail", details: { status: "refunded" }, amountIdr: 2550000n });
    expect(resultFor(report, "DQ-25", "P0003").action).toBeUndefined(); // the rule's own: exclude
    expect(statusOf(report, "P0003")).toBe("excluded");
  });

  it("skips rows already out; alone, an unparsed status", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-25", "P0004").reason).toBe("row excluded, duplicate or superseded by an earlier rule"); // DQ-06: USD
    expect(resultFor(report, "DQ-25", "P0005").reason).toBe("row excluded, duplicate or superseded by an earlier rule"); // DQ-04: V999
    expect(await skipsAlone(dq25, datasetFrom({ payment: [{ ...PAYMENT, status: "" }] }))).toEqual({ P0001: "status not parsed (DQ-03)" });
  });
});
