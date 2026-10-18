import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { apart, datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq14 } from "./dq14-payment-amount-matches";

const pay = (payment_id: string, reservation_id: string, amount: string) => ({ ...PAYMENT, payment_id, reservation_id, amount });

const ds = datasetFrom({
  property: [PROPERTY],
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
  ],
});

describeContract(dq14, contextBefore(dq14, ds));

describe("DQ-14", () => {
  it("passes a payment equal to GBV − OTA − refund, and zero for a cancellation", async () => {
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
    expect(resultFor(report, "DQ-14", "P0006").reason).toBe("row excluded or duplicate by an earlier rule"); // DQ-05 excluded it first
    expect(resultFor(report, "DQ-14", "P0007").reason).toBe("reservation has several versions (DQ-02)");
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
});
