import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, EXPENSE, PAYMENT, PROPERTY, RESERVATION, datasetFrom } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq20 } from "./dq20-dated-in-future";

const ds = datasetFrom({
  property: [PROPERTY],
  commission_rule: [COMMISSION_RULE],
  reservation: [RESERVATION],
  payment: [
    { ...PAYMENT, payment_date: "2026-10-15" }, // today
    { ...PAYMENT, payment_id: "P0002", payment_date: "2026-10-16" },
    { ...PAYMENT, payment_id: "P0003", payment_date: "2026-10-16", status: "pending" },
    { ...PAYMENT, payment_id: "P0004", payment_date: "2026-10-16", property_id: "V999" },
  ],
  expense: [
    EXPENSE,
    { ...EXPENSE, expense_id: "E0002", expense_date: "2026-10-20" },
    { ...EXPENSE, expense_id: "E0003", expense_date: "2026-10-20", payment_status: "pending" },
  ],
});

describeContract(dq20, contextBefore(dq20, ds));

describe("DQ-20", () => {
  it("flags a payment received or an expense paid after today, with the days after", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-20", "P0001").outcome).toBe("pass");
    expect(resultFor(report, "DQ-20", "P0002")).toMatchObject({ outcome: "fail", details: { date: "2026-10-16", today: "2026-10-15", daysAfter: 1 }, amountIdr: 2550000n });
    expect(statusOf(report, "P0002")).toBe("review");
    expect(resultFor(report, "DQ-20", "E0001").outcome).toBe("pass");
    expect(resultFor(report, "DQ-20", "E0002")).toMatchObject({ outcome: "fail", details: { daysAfter: 5 }, amountIdr: 250000n });
  });

  it("skips what has not happened yet, rows already out, and alone unparsed values", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-20", "P0003").reason).toBe("payment status is not received");
    expect(resultFor(report, "DQ-20", "E0003").reason).toBe("expense not paid yet");
    expect(resultFor(report, "DQ-20", "P0004").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const bad = datasetFrom({
      payment: [{ ...PAYMENT, status: "" }, { ...PAYMENT, payment_id: "P0002", payment_date: "" }],
      expense: [{ ...EXPENSE, payment_status: "" }, { ...EXPENSE, expense_id: "E0002", expense_date: "" }],
    });
    expect(await skipsAlone(dq20, bad)).toEqual({
      P0001: "status not parsed (DQ-03)",
      P0002: "payment_date not parsed (DQ-03)",
      E0001: "payment_status not parsed (DQ-03)",
      E0002: "expense_date not parsed (DQ-03)",
    });
  });

  it("a later today clears the flags", async () => {
    const report = await runOn(ds, { today: "2026-11-05" });
    expect(report.results.get("DQ-20")!.filter((r) => r.outcome === "fail")).toEqual([]);
  });
});
