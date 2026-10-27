import { describe, expect, it } from "vitest";
import { idr } from "../calc";
import { COMMISSION_RULE, PAYMENT, PROPERTY, RESERVATION } from "../dq/testing/fixture";
import { reconciliationOf } from "./reconciliation";
import { filtersOf, snapshotOf } from "./testing/snapshot";

const snapshot = await snapshotOf({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002" }],
  commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, property_id: "V002" }],
  reservation: [
    RESERVATION, // expected 2 550 000, paid on check-in → matched
    { ...RESERVATION, reservation_id: "R0002", check_in: "2026-09-20", check_out: "2026-09-23", status: "modified" }, // DQ-13: waits for a decision
    { ...RESERVATION, reservation_id: "R0003", property_id: "V002", check_in: "2026-10-20", check_out: "2026-10-22" }, // check-in still ahead
    { ...RESERVATION, reservation_id: "R0004", property_id: "V777", check_in: "2026-10-01", check_out: "2026-10-03" }, // DQ-04 excluded
  ],
  payment: [
    PAYMENT,
    { ...PAYMENT, payment_id: "P0002", reservation_id: "R0002", payment_date: "2026-09-25", amount: "1000000" }, // waits with its reservation (DQ-05 hold)
    { ...PAYMENT, payment_id: "P0003", reservation_id: "R0009", payment_date: "2026-09-11", amount: "700" }, // no reservation
    { ...PAYMENT, payment_id: "P0004", reservation_id: "R0009", property_id: "V002", payment_date: "someday" }, // no date
    { ...PAYMENT, payment_id: "P0005", reservation_id: "R0009", property_id: "", payment_date: "2026-09-12" }, // no villa
    { ...PAYMENT, payment_id: "P0006", reservation_id: "R0001", currency: "USD", amount: "10" }, // not in IDR
    { ...PAYMENT, payment_id: "P0007", reservation_id: "R0001", property_id: "V002", payment_date: "2026-09-11", amount: "300", status: "pending" }, // held: not money yet; under review (DQ-19)
    { ...PAYMENT, payment_id: "P0008", reservation_id: "R0001", payment_date: "2026-09-12", amount: "400", status: "refunded" }, // held: unknown status
    { ...PAYMENT, payment_id: "P0009", reservation_id: "R0004", payment_date: "2026-10-02", amount: "500" }, // held: its reservation is excluded
  ],
});

describe("reconciliationOf", () => {
  it("rows: the line of the calculator with check-in, DQ status, rules and the payments counted", () => {
    const r = reconciliationOf(snapshot, filtersOf(snapshot));
    expect(r.rows.map((l) => [l.reservationId, l.checkIn, l.status, l.received.amount, l.dqStatus, l.ruleIds, l.paymentIds])).toEqual([
      ["R0001", "2026-09-10", "matched", 2550000n, "clean", [], ["P0001"]],
      ["R0002", "2026-09-20", "underpaid", 1000000n, "pending", ["DQ-13", "DQ-16"], ["P0002"]], // DQ-16: the debt at check-in, a note
      ["R0003", "2026-10-20", "not_due", 0n, "clean", ["DQ-24"], []], // confirmed with no payment: a note, not a debt yet
    ]);
    expect(r.rows[0]).toMatchObject({ propertyId: "V001", checkOut: "2026-09-13", reservationStatus: "confirmed", expected: idr(2550000n) });
    expect(r.byStatus).toEqual({ matched: 1, not_received: 0, underpaid: 1, overpaid: 0, not_due: 1 });
    expect(r.underReview).toEqual({ expected: idr(2550000n), received: idr(1000000n), difference: idr(-1550000n) });
    expect(r.failures).toEqual({ calc: [], data: [] });
  });

  it("failures of the adapter, by the selected villas", () => {
    const failing = { ...snapshot, failures: [{ entity: "payment" as const, recordId: "P0009", propertyId: "V002", code: "UNKNOWN_CURRENCY", message: "x" }] };
    expect(reconciliationOf(failing, filtersOf(snapshot)).failures.data).toHaveLength(1);
    expect(reconciliationOf(failing, filtersOf(snapshot, { property: "V001" })).failures.data).toEqual([]);
  });

  it("without records under review their payments are not counted", () => {
    const r = reconciliationOf(snapshot, filtersOf(snapshot, { review: "off" }));
    expect(r.rows.map((l) => [l.reservationId, l.paymentIds])).toEqual([
      ["R0001", ["P0001"]],
      ["R0003", []],
    ]);
    expect(r.expected).toEqual(idr(2550000n * 2n));
  });

  it("held and unallocated payments of the selected villas and period, each with its reason; the rest excluded stays out of both", () => {
    const all = reconciliationOf(snapshot, filtersOf(snapshot));
    expect(all.apart.unallocated.map((u) => [u.paymentId, u.reservationId, u.propertyId, u.paymentDate, u.amount, u.reason, u.ruleIds])).toEqual([
      ["P0003", "R0009", "V001", "2026-09-11", idr(700n), "missing", ["DQ-05"]],
    ]);
    expect(all.apart.held.map((u) => [u.paymentId, u.reservationId, u.amount, u.reason, u.ruleIds])).toEqual([
      ["P0007", "R0001", idr(300n), "pending", ["DQ-25", "DQ-19"]], // admitted, under review; not compared with the payout (DQ-14)
      ["P0008", "R0001", idr(400n), "unknown_status", ["DQ-25"]],
      ["P0009", "R0004", idr(500n), "reservation_excluded", ["DQ-05"]],
    ]);
    expect(all.apart.unallocatedAmount).toEqual(idr(700n));
    expect(all.apart.heldAmount).toEqual(idr(1200n));
    // P0004, P0005 (DQ-03) and P0006 (DQ-06) are wrong rows: excluded, neither held nor unallocated

    const v001 = reconciliationOf(snapshot, filtersOf(snapshot, { property: "V001", from: "2026-09-12", to: "2026-09-30" }));
    expect(v001.apart.unallocated).toEqual([]);
    expect(v001.apart.held.map((u) => u.paymentId)).toEqual(["P0008"]);
    expect(reconciliationOf(snapshot, filtersOf(snapshot, { from: "2026-10-01", to: "2026-10-31" })).apart.held.map((u) => u.paymentId)).toEqual(["P0009"]);
    // a pending payment the checks admitted follows the review switch, as the calculator's pending does
    const off = reconciliationOf(snapshot, filtersOf(snapshot, { review: "off" }));
    expect(off.apart.held.map((u) => u.paymentId)).toEqual(["P0008", "P0009"]);
  });

  it("a payment in another currency is listed, not summed", async () => {
    const usd = { ...PROPERTY, property_id: "V002", base_currency: "USD" };
    const s = await snapshotOf({ property: [PROPERTY, usd], payment: [{ ...PAYMENT, property_id: "V002", currency: "USD", reservation_id: "R0099" }] });
    const r = reconciliationOf(s, filtersOf(s));
    expect(r.apart.unallocated.map((u) => [u.paymentId, u.amount])).toEqual([["P0001", { amount: 255000000n, currency: "USD" }]]);
    expect(r.apart.unallocatedAmount).toEqual(idr(0n));
  });
});
