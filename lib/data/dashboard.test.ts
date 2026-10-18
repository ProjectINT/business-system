import { describe, expect, it } from "vitest";
import { idr } from "../calc";
import { COMMISSION_RULE, EXPENSE, PAYMENT, PROPERTY, RESERVATION } from "../dq/testing/fixture";
import { dashboardOf, headlineDiff, headlineOf, outsideOf } from "./dashboard";
import { filtersOf, snapshotOf } from "./testing/snapshot";

const V002 = { ...PROPERTY, property_id: "V002", cluster: "Ubud" };

const snapshot = await snapshotOf({
  property: [PROPERTY, V002, { ...PROPERTY, property_id: "V003", base_currency: "" }], // V003: no currency → excluded
  commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, property_id: "V002" }, { ...COMMISSION_RULE, property_id: "V009" }],
  reservation: [
    RESERVATION, // V001, clean, paid on check-in
    { ...RESERVATION, reservation_id: "R0002", property_id: "V002", check_in: "2026-09-20", check_out: "2026-09-22" }, // no payment: DQ-16 review
    { ...RESERVATION, reservation_id: "R0003", property_id: "V777", check_in: "2026-09-24", check_out: "2026-09-26" }, // DQ-04 excluded
    { ...RESERVATION, reservation_id: "R0004", check_in: "2026-09-27", check_out: "2026-09-28", currency: "USD" }, // DQ-06 excluded
    { ...RESERVATION, reservation_id: "R0005", check_in: "2026-09-29", check_out: "soon" }, // DQ-03, no date
  ],
  payment: [PAYMENT, PAYMENT], // the copy is a duplicate
  expense: [EXPENSE, { ...EXPENSE, expense_id: "E0002", property_id: "V002", expense_date: "2026-10-02", payment_status: "pending" }],
});

describe("dashboardOf", () => {
  const d = dashboardOf(snapshot, filtersOf(snapshot));

  it("rows per villa with name, cluster, figures and the flag count", () => {
    expect(d.properties.map((p) => [p.propertyId, p.name, p.cluster, p.nights, p.gross.amount, p.grossUnderReview.amount, p.flags])).toEqual([
      ["V001", "Villa 01", "Seminyak", 3, 3000000n, 0n, 0],
      ["V002", "Villa 01", "Ubud", 2, 3000000n, 3000000n, 1],
    ]);
    expect(d.totals).toMatchObject({ nights: 5, gross: idr(6000000n), grossUnderReview: idr(3000000n), flags: 1 });
    expect(d.headline.operatingExpenses).toEqual(idr(500000n));
  });

  it("without records under review the clean ones remain, the part under review is the same", () => {
    const off = dashboardOf(snapshot, filtersOf(snapshot, { review: "off" }));
    expect(off.headline.gross).toEqual(idr(3000000n));
    expect(off.underReview).toEqual(d.underReview);
    expect(off.properties.find((p) => p.propertyId === "V002")?.gross).toEqual(idr(0n));
  });

  it("a villa missing from the property list keeps its row with blanks", () => {
    const partial = dashboardOf({ ...snapshot, properties: snapshot.properties.slice(1) }, filtersOf(snapshot));
    expect(partial.properties[0]).toMatchObject({ propertyId: "V001", name: null, cluster: null });
  });

  it("failures: of the calculator and of the adapter, by the selected villas", () => {
    const failing = { ...snapshot, failures: [{ entity: "payment" as const, recordId: "P0009", propertyId: "V002", code: "UNKNOWN_CURRENCY", message: "x" }] };
    expect(dashboardOf(failing, filtersOf(snapshot)).failures.data).toHaveLength(1);
    expect(dashboardOf(failing, filtersOf(snapshot, { property: "V001" })).failures.data).toEqual([]);
    expect(d.failures.calc).toEqual([]);
  });
});

describe("outsideOf", () => {
  it("excluded and duplicate rows of the three money files; a row without a date shows in any period", () => {
    const out = outsideOf(snapshot, filtersOf(snapshot));
    expect(out.records.map((r) => r.recordKey)).toEqual(["P0001", "R0003", "R0004", "R0005"]);
    expect(out.groups).toEqual([
      // R0003 3 000 000 IDR; R0004 in USD is counted apart; R0005 has no check-out but an amount
      { entity: "reservation", status: "excluded", count: 3, amount: idr(6000000n), otherCurrency: 1 },
      { entity: "payment", status: "duplicate", count: 1, amount: idr(2550000n), otherCurrency: 0 },
    ]);
    const october = outsideOf(snapshot, filtersOf(snapshot, { from: "2026-10-01", to: "2026-10-02" }));
    expect(october.records.map((r) => r.recordKey)).toEqual(["R0005"]);
  });

  it("a villa filter shows only the rows of selected villas", () => {
    expect(outsideOf(snapshot, filtersOf(snapshot, { property: "V001" })).records.map((r) => r.recordKey)).toEqual([
      "P0001",
      "R0004",
      "R0005",
    ]);
    expect(outsideOf(snapshot, filtersOf(snapshot, { property: "V002" })).groups).toEqual([]);
  });
});

describe("headline", () => {
  it("headlineDiff subtracts every field", () => {
    const h = headlineOf(dashboardOf(snapshot, filtersOf(snapshot)).overview.portfolio);
    const zero = headlineDiff(h, h);
    expect(Object.values(zero).every((v) => (typeof v === "number" ? v === 0 : v.amount === 0n))).toBe(true);
    expect(Object.keys(zero)).toEqual(Object.keys(h));
  });
});
