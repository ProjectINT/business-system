import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { apart, datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runAlone, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq16 } from "./dq16-unpaid-at-check-in";

const pay = (payment_id: string, reservation_id: string, payment_date: string, amount = "2550000", extra: Record<string, string> = {}) => ({
  ...PAYMENT,
  payment_id,
  reservation_id,
  payment_date,
  amount,
  ...extra,
});

// apart(): R0001 1–4 Sep, R0002 5–8, R0003 9–12, R0004 13–16, R0005 17–20, R0006 21–24, R0007 25–28, R0008 29 Sep–2 Oct
const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002", base_currency: "USD" }],
  reservation: apart([
    RESERVATION, // paid on the check-in day
    { ...RESERVATION, reservation_id: "R0002" }, // paid the day after
    { ...RESERVATION, reservation_id: "R0003" }, // never paid
    { ...RESERVATION, reservation_id: "R0004", status: "cancelled", refund_amount: "3000000" },
    { ...RESERVATION, reservation_id: "R0005" }, // part before, part after
    { ...RESERVATION, reservation_id: "R0006", gross_booking_value: "1000", ota_fee: "2000" }, // nothing to pay (DQ-08 flags it)
    { ...RESERVATION, reservation_id: "R0007", property_id: "V002", currency: "USD" }, // unpaid, in USD
    { ...RESERVATION, reservation_id: "R0008", property_id: "V999" },
  ]).concat([{ ...RESERVATION, reservation_id: "R0009", check_in: "2026-10-20", check_out: "2026-10-23" }]), // check-in still ahead
  payment: [
    pay("P0001", "R0001", "2026-09-01"),
    pay("P0002", "R0002", "2026-09-06"),
    pay("P0003", "R0005", "2026-09-16", "1000000"),
    pay("P0004", "R0005", "2026-09-19", "1550000"),
    pay("P0005", "R0003", "2026-09-09", "2550000", { property_id: "V999" }), // excluded: does not count
    pay("P0006", "R0007", "2026-09-30", "1", { currency: "USD" }),
  ],
});

describeContract(dq16, contextBefore(dq16, ds));

describe("DQ-16", () => {
  it("passes a reservation paid in full by the check-in day, and one with nothing to pay", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-16", "R0001").outcome).toBe("pass");
    expect(resultFor(report, "DQ-16", "R0006").outcome).toBe("pass");
  });

  it("flags a debt as of check-in: what was due, paid by then, paid later, and the shortfall", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-16", "R0002")).toMatchObject({
      outcome: "fail",
      details: { checkIn: "2026-09-05", expected: 2550000n, paidByCheckIn: 0n, paidLater: 2550000n, shortfall: 2550000n, payments: 1 },
      relatedKeys: ["P0002"],
      amountIdr: 2550000n,
    });
    expect(statusOf(report, "R0002")).toBe("review");
    expect(resultFor(report, "DQ-16", "R0003").details).toMatchObject({ paidByCheckIn: 0n, paidLater: 0n, payments: 0 });
    expect(resultFor(report, "DQ-16", "R0003").relatedKeys).toEqual([]);
    expect(resultFor(report, "DQ-16", "R0005").details).toMatchObject({ paidByCheckIn: 1000000n, paidLater: 1550000n, shortfall: 1550000n, payments: 2 });
    expect(resultFor(report, "DQ-16", "R0007").amountIdr).toBeUndefined();
  });

  it("skips cancellations, check-ins still ahead, rows already out; a later today moves the line", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-16", "R0004").reason).toBe("cancelled reservation");
    expect(resultFor(report, "DQ-16", "R0009").reason).toBe("check-in is still ahead");
    expect(resultFor(report, "DQ-16", "R0008").reason).toBe("row excluded or duplicate by an earlier rule");
    const later = await runOn(ds, { today: "2026-10-20" });
    expect(resultFor(later, "DQ-16", "R0009").outcome).toBe("fail");
  });

  it("alone: skips unparsed status, check-in and amounts; a row without a key has no payments", async () => {
    const bad = datasetFrom({
      reservation: [
        { ...RESERVATION, status: "" },
        { ...RESERVATION, reservation_id: "R0002", check_in: "" },
        { ...RESERVATION, reservation_id: "R0003", ota_fee: "" },
        { ...RESERVATION, reservation_id: "" },
      ],
      payment: [PAYMENT],
    });
    const noKey = (await runAlone(dq16, bad)).find((r) => r.recordKey === null)!;
    expect(noKey).toMatchObject({ outcome: "fail", details: { payments: 0 } });
    expect(await skipsAlone(dq16, bad)).toEqual({
      R0001: "status not parsed (DQ-03)",
      R0002: "check_in not parsed (DQ-03)",
      R0003: "amounts not parsed (DQ-03)",
    });
  });
});
