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
    { ...RESERVATION, reservation_id: "R0002", property_id: "V002", check_in: "2026-09-20", check_out: "2026-09-22", status: "modified" }, // no payment; DQ-13 pending — under review at level 1
    { ...RESERVATION, reservation_id: "R0003", property_id: "V777", check_in: "2026-09-24", check_out: "2026-09-26" }, // DQ-04 excluded
    { ...RESERVATION, reservation_id: "R0004", check_in: "2026-09-27", check_out: "2026-09-28", currency: "USD" }, // DQ-06 excluded
    { ...RESERVATION, reservation_id: "R0005", check_in: "2026-09-29", check_out: "soon" }, // DQ-03, no date
  ],
  payment: [PAYMENT, PAYMENT], // the copy is a duplicate
  expense: [EXPENSE, { ...EXPENSE, expense_id: "E0002", property_id: "V002", expense_date: "2026-10-02", payment_status: "pending" }],
});

describe("dashboardOf", () => {
  const d = dashboardOf(snapshot, filtersOf(snapshot));

  it("rows per villa with name, cluster, clean figures, the part under review and the flag count", () => {
    const row = (p: (typeof d.properties)[number]) => [
      p.propertyId,
      p.name,
      p.cluster,
      p.nights,
      p.gross.amount,
      p.underReview.nights,
      p.underReview.gross.amount,
      p.flags,
    ];
    expect(d.properties.map(row)).toEqual([
      ["V001", "Villa 01", "Seminyak", 3, 3000000n, 0, 0n, 0],
      ["V002", "Villa 01", "Ubud", 0, 0n, 2, 3000000n, 1],
    ]);
    expect(d.totals).toMatchObject({ nights: 3, gross: idr(3000000n), flags: 1 });
    expect(d.totals.underReview).toMatchObject({ nights: 2, gross: idr(3000000n) });
    expect(d.headline.operatingExpenses).toEqual(idr(500000n));
  });

  it("without records under review the clean ones remain, the part under review is the same", () => {
    const off = dashboardOf(snapshot, filtersOf(snapshot, { review: "off" }));
    expect(off.headline.gross).toEqual(idr(3000000n));
    expect(off.underReview).toEqual(d.underReview);
  });

  it("the rows do not follow the switch: clean figures and the part under review either way", () => {
    const off = dashboardOf(snapshot, filtersOf(snapshot, { review: "off" }));
    expect(off.properties).toEqual(d.properties);
    expect(off.totals).toEqual(d.totals);
  });

  it("a villa missing from the property list keeps its row with blanks", () => {
    const partial = dashboardOf({ ...snapshot, properties: snapshot.properties.slice(1) }, filtersOf(snapshot));
    expect(partial.properties[0]).toMatchObject({ propertyId: "V001", name: null, cluster: null });
  });

  it("each row lists the records behind its figures; the part under review lists its own", () => {
    const [v001, v002] = d.properties;
    expect(v001?.sources.stays.map((s) => [s.reservationId, s.nights, s.gross.amount])).toEqual([["R0001", 3, 3000000n]]);
    expect(v001?.sources.payments.map((p) => p.paymentId)).toEqual(["P0001"]);
    expect(v001?.sources.expenses.map((e) => [e.expenseId, e.category])).toEqual([["E0001", "cleaning"]]);
    expect(v001?.sources.reconciliation.map((l) => [l.reservationId, l.status])).toEqual([["R0001", "matched"]]);
    expect(v001?.underReviewSources.reconciliation).toEqual([]); // nothing under review changes R0001
    expect(v002?.sources.stays).toEqual([]);
    expect(v002?.underReviewSources.stays.map((s) => s.reservationId)).toEqual(["R0002"]);
    // R0002 under review, nothing paid: the whole expected payout 3 000 000 − 450 000 is the change
    expect(v002?.underReviewSources.reconciliation.map((l) => [l.reservationId, l.difference.amount])).toEqual([
      ["R0002", -2550000n],
    ]);
  });

  it("an expense whose source row is not found has no category", () => {
    const rows = { ...snapshot.dataset.rows, expense: [] };
    const bare = dashboardOf({ ...snapshot, dataset: { ...snapshot.dataset, rows } }, filtersOf(snapshot));
    expect(bare.properties[0]?.sources.expenses.map((e) => e.category)).toEqual([null]);
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

describe("money apart from cash received (PLAN.md 7.4)", () => {
  it("a pending payment and one for an excluded reservation are held; one for a missing reservation is unallocated; none is received", async () => {
    const s = await snapshotOf({
      property: [PROPERTY],
      commission_rule: [COMMISSION_RULE],
      reservation: [RESERVATION, { ...RESERVATION, reservation_id: "R0002", property_id: "V777", check_in: "2026-09-20", check_out: "2026-09-22" }],
      payment: [
        PAYMENT, // received
        { ...PAYMENT, payment_id: "P0002", amount: "100", status: "pending" },
        { ...PAYMENT, payment_id: "P0003", reservation_id: "R0002", amount: "200" }, // R0002 excluded (DQ-04)
        { ...PAYMENT, payment_id: "P0004", reservation_id: "R0099", amount: "300" },
      ],
    });
    const d = dashboardOf(s, filtersOf(s));
    expect(d.headline.received).toEqual(idr(2550000n));
    expect(d.headline.pending).toEqual(idr(100n));
    expect(d.apart.held.map((p) => [p.paymentId, p.reason])).toEqual([
      ["P0002", "pending"],
      ["P0003", "reservation_excluded"],
    ]);
    expect(d.apart.heldAmount).toEqual(idr(300n)); // 100 pending + 200 for the excluded reservation
    expect(d.apart.unallocated.map((p) => [p.paymentId, p.reason])).toEqual([["P0004", "missing"]]);
    expect(d.apart.unallocatedAmount).toEqual(idr(300n));
    expect(d.outside.records.map((r) => r.recordKey)).toEqual(["R0002"]); // held and unallocated payments are not "outside"
    expect(s.records.filter((r) => r.entity === "payment").map((r) => r.money)).toEqual(["received", "held", "held", "unallocated"]);
  });
});
