import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { datasetFrom, EXPENSE, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq06 } from "./dq06-currency-matches-property";

const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002", base_currency: "USD" }],
  reservation: [
    RESERVATION,
    { ...RESERVATION, reservation_id: "R0002", currency: "USD", gross_booking_value: "4000000", check_in: "2026-09-10", check_out: "2026-09-14" },
    { ...RESERVATION, reservation_id: "R0003", property_id: "V002" }, // IDR at a USD villa
    { ...RESERVATION, reservation_id: "R0004", property_id: "V009" },
    { ...RESERVATION, reservation_id: "R0005", currency: "USD", check_out: "2026-09-10" }, // no nights
  ],
  payment: [PAYMENT, { ...PAYMENT, payment_id: "P0002", currency: "USD" }],
  expense: [EXPENSE, { ...EXPENSE, expense_id: "E0002", currency: "USD" }],
});

describeContract(dq06, contextBefore(dq06, ds));

describe("DQ-06", () => {
  it("passes a row in the villa's currency", async () => {
    const report = await runOn(ds);
    for (const key of ["R0001", "P0001", "E0001"]) expect(resultFor(report, "DQ-06", key).outcome).toBe("pass");
  });

  it("excludes a reservation in another currency, with the amount per night", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-06", "R0002")).toMatchObject({
      outcome: "fail",
      details: { currency: "USD", baseCurrency: "IDR", amount: 4000000n, nights: 4, perNight: 1000000n },
    });
    expect(resultFor(report, "DQ-06", "R0002").amountIdr).toBeUndefined();
    expect(statusOf(report, "R0002")).toBe("excluded");
    expect(resultFor(report, "DQ-06", "R0003")).toMatchObject({ details: { currency: "IDR", baseCurrency: "USD" }, amountIdr: 3000000n });
    expect(resultFor(report, "DQ-06", "R0005").details).toMatchObject({ nights: 0, perNight: null });
  });

  it("excludes a payment or expense in another currency, without nights", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-06", "P0002").details).toEqual({ currency: "USD", baseCurrency: "IDR", amount: 2550000n });
    expect(resultFor(report, "DQ-06", "E0002").details).toEqual({ currency: "USD", baseCurrency: "IDR", amount: 250000n });
  });

  it("skips a row of an unknown villa (DQ-04) and, alone, rows whose villa or currency did not parse", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-06", "R0004").reason).toBe("row excluded or duplicate by an earlier rule");
    const bad = datasetFrom({
      property: [PROPERTY],
      reservation: [{ ...RESERVATION, property_id: "" }, { ...RESERVATION, reservation_id: "R0002", currency: "" }, { ...RESERVATION, reservation_id: "R0003", property_id: "V009" }],
    });
    expect(await skipsAlone(dq06, bad)).toEqual({
      R0001: "property_id not parsed (DQ-03)",
      R0002: "currency not parsed (DQ-03)",
      R0003: "property not found (DQ-04)",
    });
  });
});
