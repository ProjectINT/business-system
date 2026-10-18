import { describe, expect, it } from "vitest";
import type { Status, Verdict } from "../dq";
import { COMMISSION_RULE, datasetFrom, EXPENSE, PAYMENT, PROPERTY, RESERVATION } from "../dq/testing/fixture";
import { admit, calcStatus, toMoney } from "./admit";
import { snapshotOf } from "./testing/snapshot";

describe("calcStatus", () => {
  it.each<[Status, string | null]>([
    ["clean", "clean"],
    ["review", "review"],
    ["pending", "review"], // level 1 has no decisions: a row waiting for one is under review
    ["excluded", null],
    ["duplicate", null],
    ["superseded", null],
  ])("%s → %s", (status, expected) => {
    expect(calcStatus(status)).toBe(expected);
  });
});

describe("toMoney", () => {
  it("whole units into the currency's minor units", () => {
    expect(toMoney(4280874n, "IDR")).toEqual({ amount: 4280874n, currency: "IDR" });
    expect(toMoney(42n, "USD")).toEqual({ amount: 4200n, currency: "USD" });
  });

  it.each(["EUR", "idr", ""])("%j is not a known currency", (currency) => {
    expect(toMoney(1n, currency)).toBeNull();
  });
});

describe("admit on a run", () => {
  it("maps rows to the calculator input with their DQ status", async () => {
    const s = await snapshotOf({
      property: [PROPERTY],
      commission_rule: [COMMISSION_RULE],
      reservation: [
        RESERVATION,
        { ...RESERVATION, reservation_id: "R0002", check_in: "2026-09-20", check_out: "2026-09-22", channel: "Direct" }, // DQ-16 review: unpaid by check-in
        { ...RESERVATION, reservation_id: "R0003", property_id: "V999", check_in: "2026-09-25", check_out: "2026-09-27" }, // DQ-04 excluded
      ],
      payment: [PAYMENT],
      expense: [EXPENSE],
    });
    expect(s.input.reservations.map((r) => [r.reservationId, r.dqStatus])).toEqual([
      ["R0001", "clean"],
      ["R0002", "review"],
    ]);
    expect(s.input.reservations[0]).toEqual({
      reservationId: "R0001",
      propertyId: "V001",
      checkIn: "2026-09-10",
      checkOut: "2026-09-13",
      status: "confirmed",
      gross: { amount: 3000000n, currency: "IDR" },
      otaFee: { amount: 450000n, currency: "IDR" },
      refund: { amount: 0n, currency: "IDR" },
      channel: "OTA",
      dqStatus: "clean",
    });
    expect(s.input.payments).toEqual([
      {
        paymentId: "P0001",
        reservationId: "R0001",
        propertyId: "V001",
        paymentDate: "2026-09-10",
        amount: { amount: 2550000n, currency: "IDR" },
        dqStatus: "clean",
      },
    ]);
    expect(s.input.expenses).toEqual([
      {
        expenseId: "E0001",
        propertyId: "V001",
        expenseDate: "2026-09-12",
        amount: { amount: 250000n, currency: "IDR" },
        paymentStatus: "paid",
        dqStatus: "clean",
      },
    ]);
    expect(s.input.commissionRules).toEqual([
      {
        propertyId: "V001",
        effectiveFrom: "2026-09-01",
        effectiveTo: null,
        rate: expect.objectContaining({ num: 15n }),
        feeBasis: "gross_booking_value",
      },
    ]);
    expect(s.failures).toEqual([]);
  });

  it("a currency the calculator does not know: the checks admit it, the adapter reports it", async () => {
    const eur = { base_currency: "EUR" };
    const s = await snapshotOf({
      property: [{ ...PROPERTY, ...eur }],
      commission_rule: [COMMISSION_RULE],
      reservation: [{ ...RESERVATION, currency: "EUR" }],
      payment: [{ ...PAYMENT, currency: "EUR" }],
      expense: [{ ...EXPENSE, currency: "EUR" }],
    });
    expect(s.input.reservations).toEqual([]);
    expect(s.input.payments).toEqual([]);
    expect(s.input.expenses).toEqual([]);
    expect(s.failures).toEqual([
      { entity: "reservation", recordId: "R0001", propertyId: "V001", code: "UNKNOWN_CURRENCY", message: "Unknown currency: EUR" },
      { entity: "payment", recordId: "P0001", propertyId: "V001", code: "UNKNOWN_CURRENCY", message: "Unknown currency: EUR" },
      { entity: "expense", recordId: "E0001", propertyId: "V001", code: "UNKNOWN_CURRENCY", message: "Unknown currency: EUR" },
    ]);
  });
});

describe("admit contract", () => {
  const dataset = datasetFrom({ reservation: [{ ...RESERVATION, check_in: "someday" }] });
  const clean = (unitId: string): Verdict => ({ unitId, entity: "reservation", recordKey: null, status: "clean", ruleIds: [], decisionId: null });

  it("a row without a verdict is a bug of the caller", () => {
    expect(() => admit(dataset, [])).toThrow("reservations.csv:2 has no verdict");
  });

  it("an admitted row with an empty value means DQ-03 missed it", () => {
    expect(() => admit(dataset, [clean("reservations.csv:2")])).toThrow(
      "reservations.csv:2: check_in is empty in an admitted row; DQ-03 should have excluded it",
    );
  });
});
