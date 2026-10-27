import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { apart, COMMISSION_RULE, datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runAlone, runOn, skipsAlone } from "../testing/run";
import { dq24 } from "./dq24-confirmed-without-payment";

const pay = (payment_id: string, reservation_id: string, extra: Record<string, string> = {}) => ({ ...PAYMENT, payment_id, reservation_id, ...extra });

// apart(): R0001 1–4 Sep, R0002 5–8, R0003 9–12, R0004 13–16, R0005 17–20, R0006 21–24, R0007 25–28; today 15 Oct
const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002", base_currency: "USD" }],
  commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, property_id: "V002" }],
  reservation: apart([
    RESERVATION, // paid
    { ...RESERVATION, reservation_id: "R0002" }, // never paid, check-in passed
    { ...RESERVATION, reservation_id: "R0003" }, // only a zero payment
    { ...RESERVATION, reservation_id: "R0004", status: "cancelled", refund_amount: "3000000" },
    { ...RESERVATION, reservation_id: "R0005", status: "modified" },
    { ...RESERVATION, reservation_id: "R0006", gross_booking_value: "1000", ota_fee: "2000" }, // nothing to pay (DQ-08 flags it)
    { ...RESERVATION, reservation_id: "R0007", property_id: "V002", currency: "USD" }, // unpaid, in USD
    { ...RESERVATION, reservation_id: "R0010" }, // only a pending payment: not a payment yet
  ]).concat([
    { ...RESERVATION, reservation_id: "R0008", check_in: "2026-10-20", check_out: "2026-10-23" }, // check-in still ahead
    { ...RESERVATION, reservation_id: "R0009", property_id: "V999" },
  ]),
  payment: [
    pay("P0001", "R0001", { payment_date: "2026-09-20" }), // late, still a payment
    pay("P0002", "R0003", { amount: "0" }),
    pay("P0003", "R0002", { property_id: "V999" }), // excluded: does not count
    pay("P0004", "R0010", { status: "pending" }),
  ],
});

describeContract(dq24, contextBefore(dq24, ds));

describe("DQ-24", () => {
  it("passes a confirmed reservation with a payment, whatever its date, and one with nothing to pay", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-24", "R0001").outcome).toBe("pass");
    expect(resultFor(report, "DQ-24", "R0006").outcome).toBe("pass");
  });

  it("notes a confirmed reservation without money, before and after check-in; the status stays", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-24", "R0002")).toMatchObject({
      outcome: "fail",
      details: { checkIn: "2026-09-05", daysToCheckIn: -40, expected: 2550000n, zeroPayments: 0 },
      relatedKeys: [],
      amountIdr: 2550000n,
    });
    expect(resultFor(report, "DQ-24", "R0003")).toMatchObject({ outcome: "fail", details: { zeroPayments: 1 }, relatedKeys: ["P0002"] });
    expect(resultFor(report, "DQ-24", "R0007")).toMatchObject({ outcome: "fail" });
    expect(resultFor(report, "DQ-24", "R0010")).toMatchObject({ outcome: "fail", details: { zeroPayments: 0 } });
    expect(resultFor(report, "DQ-24", "R0007").amountIdr).toBeUndefined();
    expect(resultFor(report, "DQ-24", "R0008")).toMatchObject({ outcome: "fail", details: { checkIn: "2026-10-20", daysToCheckIn: 5 } });
    expect(report.verdicts.find((v) => v.recordKey === "R0008")!.ruleIds).not.toContain("DQ-24");
  });

  it("skips cancelled and modified reservations and rows already out", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-24", "R0004").reason).toBe("status is not confirmed");
    expect(resultFor(report, "DQ-24", "R0005").reason).toBe("status is not confirmed");
    expect(resultFor(report, "DQ-24", "R0009").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
  });

  it("alone: skips an unparsed status; unparsed dates or amounts still get the note; a row without a key has no payments", async () => {
    const bad = datasetFrom({
      reservation: [
        { ...RESERVATION, status: "" },
        { ...RESERVATION, reservation_id: "R0002", check_in: "", ota_fee: "" },
        { ...RESERVATION, reservation_id: "" },
      ],
      payment: [PAYMENT],
    });
    const noKey = (await runAlone(dq24, bad)).find((r) => r.recordKey === null)!;
    expect(noKey).toMatchObject({ outcome: "fail", relatedKeys: [] });
    expect(await skipsAlone(dq24, bad)).toEqual({ R0001: "status not parsed (DQ-03)" });
    const noDates = (await runAlone(dq24, bad)).find((r) => r.recordKey === "R0002")!;
    expect(noDates).toMatchObject({ outcome: "fail", details: { checkIn: null, daysToCheckIn: null, expected: null } });
    expect(noDates.amountIdr).toBeUndefined();
  });
});
