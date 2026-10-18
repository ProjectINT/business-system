import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq23 } from "./dq23-payment-after-check-in";

const pay = (payment_id: string, payment_date: string, extra: Record<string, string> = {}) => ({ ...PAYMENT, payment_id, payment_date, ...extra });

// R0001: 10–13 Sep
const ds = datasetFrom({
  property: [PROPERTY],
  reservation: [RESERVATION],
  payment: [
    pay("P0001", "2026-09-10"), // on the check-in day
    pay("P0002", "2026-09-11"),
    pay("P0003", "2026-09-20"), // after check-out
    pay("P0004", "2026-09-01"), // before: fine
    pay("P0005", "2026-09-11", { amount: "0" }),
    pay("P0006", "2026-09-11", { reservation_id: "R0099" }),
  ],
});

describeContract(dq23, contextBefore(dq23, ds));

describe("DQ-23", () => {
  it("passes a payment on or before the check-in day", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-23", "P0001").outcome).toBe("pass");
    expect(resultFor(report, "DQ-23", "P0004").outcome).toBe("pass");
  });

  it("flags a payment after check-in with the days after check-in and after check-out", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-23", "P0002")).toMatchObject({
      outcome: "fail",
      details: { paymentDate: "2026-09-11", checkIn: "2026-09-10", checkOut: "2026-09-13", daysAfterCheckIn: 1, daysAfterCheckOut: -2 },
      relatedKeys: ["R0001"],
      amountIdr: 2550000n,
    });
    expect(statusOf(report, "P0002")).toBe("review");
    expect(resultFor(report, "DQ-23", "P0003").details).toMatchObject({ daysAfterCheckIn: 10, daysAfterCheckOut: 7 });
  });

  it("skips zero payments, rows already out, and alone unparsed values and unknown reservations", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-23", "P0005").reason).toBe("zero payment (DQ-15)");
    expect(resultFor(report, "DQ-23", "P0006").reason).toBe("row excluded or duplicate by an earlier rule");
    const bad = datasetFrom({
      reservation: [RESERVATION, { ...RESERVATION, reservation_id: "R0002", check_in: "" }, { ...RESERVATION, reservation_id: "R0003" }, { ...RESERVATION, reservation_id: "R0003", ota_fee: "1" }],
      payment: [
        pay("P0001", "2026-09-11", { amount: "" }),
        pay("P0002", "2026-09-11", { reservation_id: "" }),
        pay("P0003", ""),
        pay("P0004", "2026-09-11", { reservation_id: "R0099" }),
        pay("P0005", "2026-09-11", { reservation_id: "R0002" }),
        pay("P0006", "2026-09-11", { reservation_id: "R0003" }),
      ],
    });
    expect(await skipsAlone(dq23, bad)).toEqual({
      P0001: "amount not parsed (DQ-03)",
      P0002: "reservation_id not parsed (DQ-03)",
      P0003: "payment_date not parsed (DQ-03)",
      P0004: "reservation missing or excluded (DQ-05)",
      P0005: "reservation dates not parsed (DQ-03)",
      P0006: "reservation has several versions (DQ-02)",
    });
  });
});
