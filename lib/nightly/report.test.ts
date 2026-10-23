// What the report does beyond case_public.json (golden.test.ts covers that case): the window of
// report_months, villas and months without activity, held money, the trace of a held reservation
// and of a month with two rates, the order of the exceptions.
import { describe, expect, it } from "vitest";
import { runCase, type ReportView } from "./index";
import { figures, rawCase, rawEvent, rawPayment, ZERO_FIGURES, type Raw } from "./testing/fixtures";

function report(events: Raw[], payments: Raw[] = [], overrides: Raw = {}): ReportView {
  return runCase(rawCase({ reservation_events: events, payments, ...overrides }));
}

const codes = (r: ReportView) => r.exceptions.map((e) => `${e.record_type} ${e.record_id} ${e.code}`);

/** R101 accrues 2 200 000 / 220 000 / 330 000 per month; 374 000 fee in November, 440 000 in December. */
const R101_NOVEMBER = figures(2_200_000, 220_000, 330_000, 374_000, 1_496_000, 0);
const R101_DECEMBER = figures(2_200_000, 220_000, 330_000, 440_000, 1_430_000, 0);

describe("the window of report_months (plan 4.2)", () => {
  it("a night outside the window is not counted and the reservation is reported once; the window's nights still count", () => {
    const r = report([rawEvent()], [], { report_months: ["2026-11"] });
    expect(r.monthly).toEqual({ "2026-11": R101_NOVEMBER });
    expect(r.total).toEqual(R101_NOVEMBER);
    expect(r.by_property).toEqual({ V01: { "2026-11": R101_NOVEMBER }, V02: { "2026-11": ZERO_FIGURES } });
    expect(codes(r)).toEqual(["reservation R101 OUTSIDE_REPORT_MONTHS"]);
  });

  it("the trace keeps every month of the stay, inside the window or not", () => {
    const r = report([rawEvent()], [], { report_months: ["2026-11"] });
    expect(r.trace.R101?.nights).toBe(4);
    expect(Object.keys(r.trace.R101?.monthly ?? {})).toEqual(["2026-11", "2026-12"]);
  });

  it("a received payment outside the window is not counted and is reported once", () => {
    const r = report([rawEvent()], [rawPayment()], { report_months: ["2026-11"] });
    expect(r.monthly["2026-11"]?.cash_received_idr).toBe(0);
    expect(r.total.cash_received_idr).toBe(0);
    expect(codes(r)).toEqual(["reservation R101 OUTSIDE_REPORT_MONTHS", "payment P101 OUTSIDE_REPORT_MONTHS"]);
  });

  it("cash is placed by the month of payment_date, not by the stay", () => {
    const r = report([rawEvent()], [rawPayment({ payment_date: "2026-11-01" })]);
    expect(r.monthly["2026-11"]?.cash_received_idr).toBe(4_180_000);
    expect(r.monthly["2026-12"]?.cash_received_idr).toBe(0);
    expect(r.exceptions).toEqual([]);
  });

  it("held and unmatched money counts whatever its date, without a window exception: it is not a period figure", () => {
    const payments = [
      rawPayment({ payment_id: "P1", status: "pending", payment_date: "2027-03-01", amount_idr: 50_000 }),
      rawPayment({ payment_id: "P2", reservation_id: "R999", payment_date: "2025-01-01", amount_idr: 100_000 }),
    ];
    const r = report([rawEvent()], payments);
    expect(r.cash_held_idr).toBe(50_000);
    expect(r.cash_unmatched_idr).toBe(100_000);
    expect(codes(r)).toEqual(["payment P1 PENDING_PAYMENT", "payment P2 UNMATCHED_PAYMENT"]);
  });

  it("a month of the window without activity is a row of zeros, in monthly and under every villa", () => {
    const r = report([rawEvent()], [], { report_months: ["2026-11", "2026-12", "2027-01"] });
    expect(r.monthly).toEqual({ "2026-11": R101_NOVEMBER, "2026-12": R101_DECEMBER, "2027-01": ZERO_FIGURES });
    expect(r.by_property.V02).toEqual({ "2026-11": ZERO_FIGURES, "2026-12": ZERO_FIGURES, "2027-01": ZERO_FIGURES });
    expect(r.total).toEqual(figures(4_400_000, 440_000, 660_000, 814_000, 2_926_000, 0));
  });

  it("months come out sorted whatever the order of report_months", () => {
    const r = report([rawEvent()], [], { report_months: ["2026-12", "2026-11"] });
    expect(Object.keys(r.monthly)).toEqual(["2026-11", "2026-12"]);
    expect(Object.keys(r.by_property.V01 ?? {})).toEqual(["2026-11", "2026-12"]);
  });
});

describe("by_property", () => {
  it("lists every villa of properties, with zeros for one without activity, and no other", () => {
    const properties = [
      { property_id: "V03", base_currency: "IDR" },
      { property_id: "V01", base_currency: "IDR" },
    ];
    const r = report([rawEvent()], [], { properties });
    expect(Object.keys(r.by_property)).toEqual(["V01", "V03"]);
    expect(r.by_property.V03).toEqual({ "2026-11": ZERO_FIGURES, "2026-12": ZERO_FIGURES });
    expect(r.monthly).toEqual({ "2026-11": R101_NOVEMBER, "2026-12": R101_DECEMBER });
  });

  it("owner_estimate is the formula even when the OTA fee exceeds the rest: nothing is clamped (ТЗ 8)", () => {
    const one = rawEvent({ check_in: "2026-11-10", check_out: "2026-11-11", accommodation_gross_idr: 100, pbjt_idr: 0, ota_fee_idr: 200 });
    const r = report([one]);
    expect(r.monthly["2026-11"]).toEqual(figures(100, 0, 200, 17, -117, 0));
    expect(r.total.owner_estimate_idr).toBe(-117);
  });
});

describe("money that is not confirmed", () => {
  it("cash_held sums pending payments, payments of held reservations and payments of unknown status; cash_unmatched sums the unmatched", () => {
    const events = [rawEvent(), rawEvent({ source_event_id: "E_R303", reservation_id: "R303", currency: "USD" })];
    const payments = [
      rawPayment(), // received for R101: cash
      rawPayment({ payment_id: "P2", status: "pending", amount_idr: 50_000 }),
      rawPayment({ payment_id: "P3", reservation_id: "R303", amount_idr: 70_000 }),
      rawPayment({ payment_id: "P4", status: "refunded", amount_idr: 30_000 }),
      rawPayment({ payment_id: "P5", reservation_id: "R999", amount_idr: 100_000 }),
      rawPayment({ payment_id: "P6", reservation_id: "R998", amount_idr: 100_000 }),
    ];
    const r = report(events, payments);
    expect(r.cash_held_idr).toBe(50_000 + 70_000 + 30_000);
    expect(r.cash_unmatched_idr).toBe(200_000);
    expect(r.total.cash_received_idr).toBe(4_180_000);
    expect(codes(r)).toEqual([
      "reservation R303 CURRENCY_MISMATCH",
      "payment P2 PENDING_PAYMENT",
      "payment P3 PAYMENT_HELD",
      "payment P4 UNKNOWN_STATUS",
      "payment P5 UNMATCHED_PAYMENT",
      "payment P6 UNMATCHED_PAYMENT",
    ]);
  });

  it("a conflicting payment is in no figure: an exception only", () => {
    const r = report([rawEvent()], [rawPayment(), rawPayment({ amount_idr: 1 })]);
    expect(r.total.cash_received_idr).toBe(0);
    expect(r.cash_held_idr).toBe(0);
    expect(r.cash_unmatched_idr).toBe(0);
    expect(codes(r)).toEqual(["payment P101 CONFLICTING_PAYMENT"]);
  });
});

describe("trace", () => {
  it("a held reservation accrues nothing: its row names the version that failed, zero nights, no months", () => {
    const r = report([rawEvent({ currency: "USD" })], [rawPayment()]);
    expect(r.monthly).toEqual({ "2026-11": ZERO_FIGURES, "2026-12": ZERO_FIGURES });
    expect(r.cash_held_idr).toBe(4_180_000);
    expect(r.trace).toEqual({
      R101: { selected_source_event_id: "E_R101_V2", superseded_source_event_ids: [], hold: true, nights: 0, monthly: {} },
    });
  });

  it("a reservation without a usable version has no selected id, and still lists the versions it superseded", () => {
    const v1 = rawEvent({ source_event_id: "E_R101_V1", updated_at: "2026-11-19T09:00:00Z" });
    const twin = rawEvent({ source_event_id: "E_R101_V2b", accommodation_gross_idr: 4_500_000 });
    const r = report([v1, rawEvent(), twin]);
    expect(r.trace.R101).toEqual({
      selected_source_event_id: null,
      superseded_source_event_ids: ["E_R101_V1"],
      hold: true,
      nights: 0,
      monthly: {},
    });
    expect(codes(r)).toEqual(["reservation R101 AMBIGUOUS_VERSION"]);
  });

  it("a rule that changes inside a month shows both rates of the month, and the month's fee is the sum of the nights", () => {
    const commission_rules = [
      { property_id: "V01", effective_from: "2026-11-01", effective_to: "2026-11-29", rate_bps: 1700 },
      { property_id: "V01", effective_from: "2026-11-30", effective_to: "2026-12-31", rate_bps: 2000 },
    ];
    const r = report([rawEvent()], [], { commission_rules });
    expect(r.trace.R101?.monthly).toEqual({
      "2026-11": { nights: 2, rate_bps: [1700, 2000], accommodation_gross_idr: 2_200_000, management_fee_idr: 187_000 + 220_000 },
      "2026-12": { nights: 2, rate_bps: [2000], accommodation_gross_idr: 2_200_000, management_fee_idr: 440_000 },
    });
    expect(r.monthly["2026-11"]?.management_fee_idr).toBe(407_000);
    expect(r.total.management_fee_idr).toBe(847_000);
  });

  it("has a row for every reservation of the input, by id", () => {
    const events = [
      rawEvent({ source_event_id: "E_R202", reservation_id: "R202", property_id: "V02", check_in: "2026-12-10", check_out: "2026-12-12" }),
      rawEvent(),
      rawEvent({ source_event_id: "E_R050", reservation_id: "R050", status: "cancelled" }),
    ];
    expect(Object.keys(report(events).trace)).toEqual(["R050", "R101", "R202"]);
  });
});

describe("exceptions", () => {
  it("are one list by record: reservations by id, then payments by id, the window code after the record's other codes", () => {
    const events = [rawEvent(), rawEvent({ source_event_id: "E_R050", reservation_id: "R050", status: "cancelled" })];
    const payments = [rawPayment(), rawPayment({ payment_id: "P050", reservation_id: "R050" })];
    const r = report(events, payments, { report_months: ["2026-11"] });
    expect(codes(r)).toEqual([
      "reservation R050 UNKNOWN_STATUS",
      "reservation R101 OUTSIDE_REPORT_MONTHS",
      "payment P050 PAYMENT_HELD",
      "payment P101 OUTSIDE_REPORT_MONTHS",
    ]);
    expect(r.exceptions.every((e) => e.action === "hold")).toBe(true);
  });

  it("pass the dedup counters through", () => {
    const r = report([rawEvent(), rawEvent()], [rawPayment(), rawPayment()]);
    expect(r.dedup).toEqual({ reservation_event_duplicates: 1, superseded_reservation_versions: 0, payment_duplicates: 1 });
  });
});
