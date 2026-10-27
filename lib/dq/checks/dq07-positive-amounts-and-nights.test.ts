import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { datasetFrom, EXPENSE, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq07 } from "./dq07-positive-amounts-and-nights";

const ds = datasetFrom({
  property: [PROPERTY],
  reservation: [
    RESERVATION,
    { ...RESERVATION, reservation_id: "R0002", gross_booking_value: "0" },
    { ...RESERVATION, reservation_id: "R0003", check_out: "2026-09-10" }, // zero nights
    { ...RESERVATION, reservation_id: "R0004", check_out: "2026-09-08" }, // check-out before check-in
    { ...RESERVATION, reservation_id: "R0005", gross_booking_value: "1", check_out: "2026-09-11" }, // smallest valid stay
  ],
  payment: [PAYMENT, { ...PAYMENT, payment_id: "P0002", amount: "0" }, { ...PAYMENT, payment_id: "P0003", amount: "-1" }],
  expense: [EXPENSE, { ...EXPENSE, expense_id: "E0002", amount: "0" }, { ...EXPENSE, expense_id: "E0003", amount: "-5" }],
});

describeContract(dq07, contextBefore(dq07, ds));

describe("DQ-07", () => {
  it("reservations: gross must be positive and the stay at least one night", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-07", "R0001").outcome).toBe("pass");
    expect(resultFor(report, "DQ-07", "R0005").outcome).toBe("pass");
    expect(resultFor(report, "DQ-07", "R0002")).toMatchObject({ outcome: "fail", details: { gross: 0n, nights: 3 }, amountIdr: 0n });
    expect(resultFor(report, "DQ-07", "R0003")).toMatchObject({ outcome: "fail", details: { gross: 3000000n, nights: 0 } });
    expect(resultFor(report, "DQ-07", "R0004")).toMatchObject({ outcome: "fail", details: { nights: -2 } });
    expect(statusOf(report, "R0004")).toBe("excluded");
  });

  it("payments may be zero but not negative; expenses must be positive", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-07", "P0002").outcome).toBe("pass");
    expect(resultFor(report, "DQ-07", "P0003")).toMatchObject({ outcome: "fail", details: { amount: -1n }, amountIdr: -1n });
    expect(resultFor(report, "DQ-07", "E0002")).toMatchObject({ outcome: "fail", details: { amount: 0n } });
    expect(resultFor(report, "DQ-07", "E0003").outcome).toBe("fail");
  });

  it("skips a row already out, and alone rows whose amount or dates did not parse", async () => {
    const bad = datasetFrom({
      reservation: [{ ...RESERVATION, gross_booking_value: "" }, { ...RESERVATION, reservation_id: "R0002", check_in: "x" }],
      payment: [{ ...PAYMENT, amount: "" }],
      expense: [{ ...EXPENSE, amount: "abc" }],
    });
    expect(await skipsAlone(dq07, bad)).toEqual({
      R0001: "gross_booking_value not parsed (DQ-03)",
      R0002: "check_in / check_out not parsed (DQ-03)",
      P0001: "amount not parsed (DQ-03)",
      E0001: "amount not parsed (DQ-03)",
    });
    const report = await runOn(bad);
    expect(resultFor(report, "DQ-07", "P0001").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
  });
});
