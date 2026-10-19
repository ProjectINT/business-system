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
    { ...RESERVATION, reservation_id: "R0002", check_in: "2026-09-20", check_out: "2026-09-23" },
    { ...RESERVATION, reservation_id: "R0003", property_id: "V002", check_in: "2026-10-20", check_out: "2026-10-22" }, // check-in still ahead
  ],
  payment: [
    PAYMENT,
    { ...PAYMENT, payment_id: "P0002", reservation_id: "R0002", payment_date: "2026-09-25", amount: "1000000" }, // DQ-23 review
    { ...PAYMENT, payment_id: "P0003", reservation_id: "R0009", payment_date: "2026-09-11", amount: "700" }, // no reservation
    { ...PAYMENT, payment_id: "P0004", reservation_id: "R0009", property_id: "V002", payment_date: "someday" }, // no date
    { ...PAYMENT, payment_id: "P0005", reservation_id: "R0009", property_id: "", payment_date: "2026-09-12" }, // no villa
    { ...PAYMENT, payment_id: "P0006", reservation_id: "R0001", currency: "USD", amount: "10" }, // not in IDR
  ],
});

describe("reconciliationOf", () => {
  it("rows: the line of the calculator with check-in, DQ status, rules and the payments counted", () => {
    const r = reconciliationOf(snapshot, filtersOf(snapshot));
    expect(r.rows.map((l) => [l.reservationId, l.checkIn, l.status, l.received.amount, l.dqStatus, l.ruleIds, l.paymentIds])).toEqual([
      ["R0001", "2026-09-10", "matched", 2550000n, "clean", [], ["P0001"]],
      ["R0002", "2026-09-20", "underpaid", 1000000n, "review", ["DQ-16"], ["P0002"]],
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

  it("unallocated payments: excluded ones of the selected villas and period; no date — always; other currency not summed", () => {
    const all = reconciliationOf(snapshot, filtersOf(snapshot));
    expect(all.unallocated.map((u) => [u.paymentId, u.reservationId, u.propertyId, u.paymentDate, u.amount, u.ruleIds])).toEqual([
      ["P0003", "R0009", "V001", "2026-09-11", idr(700n), ["DQ-05"]],
      ["P0004", "R0009", "V002", null, idr(2550000n), ["DQ-03"]],
      ["P0005", "R0009", null, "2026-09-12", idr(2550000n), ["DQ-03"]],
      ["P0006", "R0001", "V001", "2026-09-10", { amount: 1000n, currency: "USD" }, ["DQ-06"]],
    ]);
    expect(all.unallocatedAmount).toEqual(idr(700n + 2550000n + 2550000n));

    const v001 = reconciliationOf(snapshot, filtersOf(snapshot, { property: "V001", from: "2026-09-11", to: "2026-09-30" }));
    expect(v001.unallocated.map((u) => u.paymentId)).toEqual(["P0003"]);
    const october = reconciliationOf(snapshot, filtersOf(snapshot, { property: "V002", from: "2026-10-01", to: "2026-10-31" }));
    expect(october.unallocated.map((u) => u.paymentId)).toEqual(["P0004"]);
  });

  it("an unparsed amount is listed, not summed", async () => {
    const s = await snapshotOf({ property: [PROPERTY], payment: [{ ...PAYMENT, amount: "n/a" }] });
    const r = reconciliationOf(s, filtersOf(s));
    expect(r.unallocated.map((u) => [u.paymentId, u.amount])).toEqual([["P0001", null]]);
    expect(r.unallocatedAmount).toEqual(idr(0n));
  });
});
