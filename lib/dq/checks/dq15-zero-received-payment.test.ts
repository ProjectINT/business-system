import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq15 } from "./dq15-zero-received-payment";

const ds = datasetFrom({
  property: [PROPERTY],
  reservation: [{ ...RESERVATION, status: "cancelled", refund_amount: "3000000" }], // a zero payment matches its payout (DQ-14)
  payment: [
    PAYMENT,
    { ...PAYMENT, payment_id: "P0002", amount: "0" },
    { ...PAYMENT, payment_id: "P0003", amount: "0", status: "pending" },
    { ...PAYMENT, payment_id: "P0004", amount: "0", property_id: "V999" },
  ],
});

describeContract(dq15, contextBefore(dq15, ds));

describe("DQ-15", () => {
  it("reports a zero payment marked received as information; the status stays clean", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-15", "P0001").outcome).toBe("pass");
    expect(resultFor(report, "DQ-15", "P0002")).toMatchObject({ outcome: "fail", details: { status: "received", reservationId: "R0001" } });
    expect(resultFor(report, "DQ-15", "P0003").outcome).toBe("pass");
    expect(statusOf(report, "P0002")).toBe("clean");
  });

  it("skips a row already out, and alone unparsed values", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-15", "P0004").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const bad = datasetFrom({ payment: [{ ...PAYMENT, amount: "" }, { ...PAYMENT, payment_id: "P0002", status: "" }] });
    expect(await skipsAlone(dq15, bad)).toEqual({ P0001: "amount not parsed (DQ-03)", P0002: "status not parsed (DQ-03)" });
  });
});
