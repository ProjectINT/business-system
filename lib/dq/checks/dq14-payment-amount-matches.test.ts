import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { apart, COMMISSION_RULE, datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import type { CheckContext } from "../types";
import { dq14 } from "./dq14-payment-amount-matches";

const pay = (payment_id: string, reservation_id: string, amount: string) => ({ ...PAYMENT, payment_id, reservation_id, amount });

const ds = datasetFrom({
  property: [PROPERTY],
  commission_rule: [COMMISSION_RULE],
  reservation: apart([
    RESERVATION, // expected 2 550 000
    { ...RESERVATION, reservation_id: "R0002", status: "cancelled", refund_amount: "3000000" }, // expected 0
    { ...RESERVATION, reservation_id: "R0003", ota_fee: "-100000" }, // expected 3 100 000 > gross (R0102)
    { ...RESERVATION, reservation_id: "R0004" },
    { ...RESERVATION, reservation_id: "R0004", gross_booking_value: "1" },
  ]),
  payment: [
    PAYMENT,
    pay("P0002", "R0001", "2000000"),
    pay("P0003", "R0002", "0"),
    pay("P0004", "R0002", "100"),
    pay("P0005", "R0003", "3100000"),
    pay("P0006", "R0099", "1"),
    pay("P0007", "R0004", "2550000"),
    { ...pay("P0008", "R0001", "1"), status: "pending" }, // not money yet (DQ-25)
  ],
});

describeContract(dq14, contextBefore(dq14, ds));

describe("DQ-14", () => {
  it("passes a payment equal to GBV + PBJT − OTA − refund, and zero for a cancellation", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-14", "P0001").outcome).toBe("pass");
    expect(resultFor(report, "DQ-14", "P0003").outcome).toBe("pass");
  });

  it("flags a payment that differs from the payout, or exceeds the gross", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-14", "P0002")).toMatchObject({
      outcome: "fail",
      details: { amount: 2000000n, expected: 2550000n, gross: 3000000n, difference: -550000n, aboveGross: false },
      relatedKeys: ["R0001"],
      amountIdr: 2000000n,
    });
    expect(statusOf(report, "P0002")).toBe("review");
    expect(resultFor(report, "DQ-14", "P0004").details).toMatchObject({ expected: 0n, difference: 100n });
    expect(resultFor(report, "DQ-14", "P0005").details).toEqual({ amount: 3100000n, expected: 3100000n, gross: 3000000n, difference: 0n, aboveGross: true });
  });

  it("skips payments of a missing or excluded reservation, of two versions, and alone unparsed values", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-14", "P0006").reason).toBe("row excluded, duplicate or superseded by an earlier rule"); // DQ-05 excluded it first
    expect(resultFor(report, "DQ-14", "P0007").reason).toBe("reservation has several versions (DQ-02)");
    expect(resultFor(report, "DQ-14", "P0008").reason).toBe("payment status is not received");
    const bad = datasetFrom({
      reservation: [{ ...RESERVATION, gross_booking_value: "" }],
      payment: [{ ...PAYMENT, reservation_id: "" }, pay("P0002", "R0001", ""), pay("P0003", "R0001", "1"), pay("P0004", "R0009", "1")],
    });
    expect(await skipsAlone(dq14, bad)).toEqual({
      P0001: "reservation_id not parsed (DQ-03)",
      P0002: "amount not parsed (DQ-03)",
      P0003: "reservation amounts not parsed (DQ-03)",
      P0004: "reservation missing or excluded (DQ-05)",
    });
  });

  it("PBJT is in the payout (the event feed brings it): P101 4 180 000 = 4 400 000 + 440 000 − 660 000 passes", async () => {
    const feed = datasetFrom({
      property: [PROPERTY],
      commission_rule: [COMMISSION_RULE],
      reservation: [{ ...RESERVATION, gross_booking_value: "4400000", ota_fee: "660000" }],
      payment: [{ ...PAYMENT, amount: "4180000" }, pay("P0002", "R0001", "4840000"), pay("P0003", "R0001", "4840001")],
    });
    const ctx = await contextBefore(dq14, feed)();
    const units = ((e: Parameters<CheckContext["units"]>[0]) =>
      e === "reservation" ? ctx.units("reservation").map((u) => ({ ...u, values: { ...u.values, pbjt: 440000n } })) : ctx.units(e)) as CheckContext["units"];
    const results = await dq14.run({ ...ctx, units });
    const of = (key: string) => results.find((r) => r.recordKey === key)!;
    expect(of("P0001").outcome).toBe("pass");
    expect(of("P0002").details).toMatchObject({ expected: 4180000n, difference: 660000n, aboveGross: false }); // stay + PBJT is the ceiling
    expect(of("P0003").details).toMatchObject({ aboveGross: true });
  });
});
