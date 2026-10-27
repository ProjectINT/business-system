import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { apart, COMMISSION_RULE, datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runAlone, runOn, skipsAlone, statusOf } from "../testing/run";
import type { CheckContext } from "../types";
import { dq16 } from "./dq16-unpaid-at-check-in";

const pay = (payment_id: string, reservation_id: string, payment_date: string, amount = "2550000", extra: Record<string, string> = {}) => ({
  ...PAYMENT,
  payment_id,
  reservation_id,
  payment_date,
  amount,
  ...extra,
});

// apart(): R0001 1–4 Sep, R0002 5–8, R0003 9–12, R0004 13–16, R0005 17–20, R0006 21–24, R0007 25–28, R0008 29 Sep–2 Oct, R0010 3–6 Oct
const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002", base_currency: "USD" }],
  commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, property_id: "V002" }],
  reservation: apart([
    RESERVATION, // paid on the check-in day
    { ...RESERVATION, reservation_id: "R0002", channel: "Direct" }, // paid the day after
    { ...RESERVATION, reservation_id: "R0003" }, // never paid
    { ...RESERVATION, reservation_id: "R0004", status: "cancelled", refund_amount: "3000000" },
    { ...RESERVATION, reservation_id: "R0005" }, // part before, the rest in two payments after
    { ...RESERVATION, reservation_id: "R0006", gross_booking_value: "1000", ota_fee: "2000" }, // nothing to pay (DQ-08 flags it)
    { ...RESERVATION, reservation_id: "R0007", property_id: "V002", currency: "USD" }, // part paid, in USD
    { ...RESERVATION, reservation_id: "R0008", property_id: "V999" },
    { ...RESERVATION, reservation_id: "R0010" }, // only a pending payment: not money yet
  ]).concat([{ ...RESERVATION, reservation_id: "R0009", check_in: "2026-10-20", check_out: "2026-10-23" }]), // check-in still ahead
  payment: [
    pay("P0001", "R0001", "2026-09-01"),
    pay("P0002", "R0002", "2026-09-06"),
    pay("P0003", "R0005", "2026-09-16", "1000000"),
    pay("P0004", "R0005", "2026-09-25", "50000"), // listed out of date order; paid on top of the full amount
    pay("P0010", "R0005", "2026-09-19", "1550000"), // with this one the total reaches 2 550 000
    pay("P0005", "R0003", "2026-09-09", "2550000", { property_id: "V999" }), // excluded: does not count
    pay("P0006", "R0007", "2026-09-30", "1", { property_id: "V002", currency: "USD" }),
    pay("P0007", "R0010", "2026-10-03", "2550000", { status: "pending" }),
  ],
});

describeContract(dq16, contextBefore(dq16, ds));

describe("DQ-16", () => {
  it("passes a reservation paid in full by the check-in day, and one with nothing to pay", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-16", "R0001").outcome).toBe("pass");
    expect(resultFor(report, "DQ-16", "R0006").outcome).toBe("pass");
  });

  it("paid late: the day it was paid in full and how many days after check-in; a note, the record stays clean", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-16", "R0002")).toMatchObject({
      outcome: "fail",
      details: {
        kind: "paid_late",
        checkIn: "2026-09-05",
        expected: 2550000n,
        paidByCheckIn: 0n,
        paidLater: 2550000n,
        shortfall: 2550000n,
        payments: 1,
        paidOn: "2026-09-06",
        daysLate: 1,
      },
      relatedKeys: ["P0002"],
      amountIdr: 2550000n,
    });
    expect(statusOf(report, "R0002")).toBe("clean"); // information: nothing to resolve; Direct bookings and OTA alike
    expect(statusOf(report, "P0002")).toBe("clean"); // the late payment itself carries no flag (DQ-23 merged here)
    expect(resultFor(report, "DQ-16", "R0005").details).toMatchObject({
      kind: "paid_late",
      paidByCheckIn: 1000000n,
      paidLater: 1600000n,
      shortfall: 1550000n,
      payments: 3,
      paidOn: "2026-09-19",
      daysLate: 2,
    });
    expect(resultFor(report, "DQ-16", "R0005").relatedKeys).toEqual(["P0003", "P0004", "P0010"]);
  });

  it("unpaid: the debt as of today; a pending payment does not close it", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-16", "R0003")).toMatchObject({
      details: { kind: "unpaid", paidByCheckIn: 0n, paidLater: 0n, outstanding: 2550000n, payments: 0 },
      relatedKeys: [],
      amountIdr: 2550000n,
    });
    expect(resultFor(report, "DQ-16", "R0010").details).toMatchObject({ kind: "unpaid", outstanding: 2550000n, payments: 0 });
    expect(resultFor(report, "DQ-16", "R0007")).toMatchObject({ details: { kind: "unpaid", paidLater: 1n, outstanding: 2549999n } });
    expect(resultFor(report, "DQ-16", "R0007").amountIdr).toBeUndefined();
  });

  it("skips cancellations, check-ins still ahead, rows already out; a later today moves the line", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-16", "R0004").reason).toBe("cancelled reservation");
    expect(resultFor(report, "DQ-16", "R0009").reason).toBe("check-in is still ahead");
    expect(resultFor(report, "DQ-16", "R0008").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const later = await runOn(ds, { today: "2026-10-20" });
    expect(resultFor(later, "DQ-16", "R0009").outcome).toBe("fail");
  });

  it("PBJT is in what was due (the event feed brings it): A 4 400 000 + PBJT 440 000 − OTA 660 000 = 4 180 000", async () => {
    const feed = datasetFrom({
      property: [PROPERTY],
      commission_rule: [COMMISSION_RULE],
      reservation: [{ ...RESERVATION, gross_booking_value: "4400000", ota_fee: "660000" }],
      payment: [pay("P0001", "R0001", "2026-09-10", "4180000")],
    });
    const ctx = await contextBefore(dq16, feed)();
    const units = ((e: Parameters<CheckContext["units"]>[0]) =>
      e === "reservation" ? ctx.units("reservation").map((u) => ({ ...u, values: { ...u.values, pbjt: 440000n } })) : ctx.units(e)) as CheckContext["units"];
    expect((await dq16.run({ ...ctx, units }))[0]!.outcome).toBe("pass");
    const unparsed = ((e: Parameters<CheckContext["units"]>[0]) =>
      e === "reservation" ? ctx.units("reservation").map((u) => ({ ...u, values: { ...u.values, pbjt: null } })) : ctx.units(e)) as CheckContext["units"];
    expect((await dq16.run({ ...ctx, units: unparsed }))[0]!.reason).toBe("amounts not parsed (DQ-03)");
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
    expect(noKey).toMatchObject({ outcome: "fail", details: { kind: "unpaid", payments: 0 } });
    expect(await skipsAlone(dq16, bad)).toEqual({
      R0001: "status not parsed (DQ-03)",
      R0002: "check_in not parsed (DQ-03)",
      R0003: "amounts not parsed (DQ-03)",
    });
  });
});
