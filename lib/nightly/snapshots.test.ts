import { describe, expect, it } from "vitest";
import publicCase from "../../final-test/case_public.json";
import { parseCase } from "./schema";
import { selectSnapshots, type PaymentDecision, type Snapshots } from "./snapshots";
import { rawCase, rawEvent, rawPayment, type Raw } from "./testing/fixtures";

function run(events: Raw[], payments: Raw[] = [], overrides: Raw = {}): Snapshots {
  return selectSnapshots(parseCase(rawCase({ reservation_events: events, payments, ...overrides })));
}

const codes = (s: Snapshots) => s.exceptions.map((e) => `${e.record_type} ${e.record_id} ${e.code}`);

const chosen = (s: Snapshots, reservation_id: string) => {
  const r = s.reservations.find((x) => x.reservation_id === reservation_id);
  if (r === undefined) throw new Error(`no decision for ${reservation_id}`);
  return { hold: r.hold, selected: r.snapshot?.source_event_id ?? null, superseded: r.superseded };
};

const received = (s: Snapshots) =>
  s.payments
    .filter((p): p is Extract<PaymentDecision, { bucket: "received" }> => p.bucket === "received")
    .map((p) => [p.payment.payment_id, p.property_id, p.payment.amount_idr] as const);

const NO_DEDUP = { reservation_event_duplicates: 0, superseded_reservation_versions: 0, payment_duplicates: 0 };

describe("selectSnapshots on case_public.json (plan, phase 1)", () => {
  const s = selectSnapshots(parseCase(publicCase));

  it("accepts exactly R101 = E_R101_V2 and R202; R303 is on hold", () => {
    expect(s.reservations.map((r) => r.reservation_id)).toEqual(["R101", "R202", "R303"]);
    expect(chosen(s, "R101")).toEqual({ hold: false, selected: "E_R101_V2", superseded: ["E_R101_V1"] });
    expect(chosen(s, "R202")).toEqual({ hold: false, selected: "E_R202", superseded: [] });
    expect(chosen(s, "R303")).toEqual({ hold: true, selected: "E_R303", superseded: [] });
  });

  it("carries the night lines of each accepted reservation", () => {
    const nights = (reservation_id: string) => {
      const r = s.reservations.find((x) => x.reservation_id === reservation_id);
      return r !== undefined && !r.hold ? r.nights.map((n) => [n.night, n.rate_bps, n.management_fee_idr]) : null;
    };
    expect(nights("R101")).toEqual([
      ["2026-11-29", 1700, 187_000n],
      ["2026-11-30", 1700, 187_000n],
      ["2026-12-01", 2000, 220_000n],
      ["2026-12-02", 2000, 220_000n],
    ]);
    expect(nights("R202")).toEqual([
      ["2026-12-10", 1000, 100_000n],
      ["2026-12-11", 1000, 100_000n],
    ]);
    expect(nights("R303")).toBeNull();
  });

  it("counts dedup 1 / 1 / 1", () => {
    expect(s.dedup).toEqual({
      reservation_event_duplicates: 1,
      superseded_reservation_versions: 1,
      payment_duplicates: 1,
    });
  });

  it("places each payment once: P101 and P202 received, P303 held, P404 unmatched", () => {
    expect(s.payments.map((p) => [p.payment.payment_id, p.bucket])).toEqual([
      ["P101", "received"],
      ["P202", "received"],
      ["P303", "held"],
      ["P404", "unmatched"],
    ]);
    expect(received(s)).toEqual([
      ["P101", "V01", 4_180_000n],
      ["P202", "V02", 2_200_000n],
    ]);
  });

  it("lists three exceptions, all hold", () => {
    expect(s.exceptions).toEqual([
      { record_type: "reservation", record_id: "R303", code: "CURRENCY_MISMATCH", action: "hold" },
      { record_type: "payment", record_id: "P303", code: "PENDING_PAYMENT", action: "hold" },
      { record_type: "payment", record_id: "P404", code: "UNMATCHED_PAYMENT", action: "hold" },
    ]);
  });
});

describe("F2: duplicates and versions", () => {
  it("a repeated payment is counted once and does not double the amount", () => {
    for (const copies of [2, 3]) {
      const s = run([rawEvent()], Array.from({ length: copies }, () => rawPayment()));
      expect(received(s)).toEqual([["P101", "V01", 4_180_000n]]);
      expect(s.dedup.payment_duplicates).toBe(copies - 1);
      expect(s.exceptions).toEqual([]);
    }
  });

  it("a repeated event is counted once", () => {
    const s = run([rawEvent(), rawEvent(), rawEvent()]);
    expect(s.reservations).toHaveLength(1);
    expect(chosen(s, "R101")).toEqual({ hold: false, selected: "E_R101_V2", superseded: [] });
    expect(s.dedup).toEqual({ ...NO_DEDUP, reservation_event_duplicates: 2 });
    expect(s.exceptions).toEqual([]);
  });

  it("a newer version supersedes the older one and the two are not summed", () => {
    const v1 = rawEvent({ source_event_id: "E_R101_V1", updated_at: "2026-11-19T09:00:00Z", status: "confirmed", accommodation_gross_idr: 4000000 });
    const s = run([v1, rawEvent()]);
    expect(s.reservations).toHaveLength(1);
    expect(chosen(s, "R101")).toEqual({ hold: false, selected: "E_R101_V2", superseded: ["E_R101_V1"] });
    expect(s.reservations[0]?.snapshot?.accommodation_gross_idr).toBe(4_400_000n);
    expect(s.dedup).toEqual({ ...NO_DEDUP, superseded_reservation_versions: 1 });
  });

  it("the latest of three versions wins whatever the input order", () => {
    const v1 = rawEvent({ source_event_id: "E_R101_V1", updated_at: "2026-11-19T09:00:00Z" });
    const v3 = rawEvent({ source_event_id: "E_R101_V3", updated_at: "2026-11-21T10:00:00Z", accommodation_gross_idr: 4800000 });
    const s = run([v3, rawEvent(), v1]);
    expect(chosen(s, "R101")).toEqual({ hold: false, selected: "E_R101_V3", superseded: ["E_R101_V1", "E_R101_V2"] });
    expect(s.dedup.superseded_reservation_versions).toBe(2);
  });

  it("the comparison is by instant, not by string: an offset spelling of a later time still wins", () => {
    const later = rawEvent({ source_event_id: "E_R101_V3", updated_at: "2026-11-20T13:00:00+04:00", pbjt_idr: 450000 });
    expect(chosen(run([rawEvent(), later]), "R101").selected).toBe("E_R101_V3");
  });

  it("equal updated_at with different content is AMBIGUOUS_VERSION: hold, no snapshot, older versions still superseded", () => {
    const v1 = rawEvent({ source_event_id: "E_R101_V1", updated_at: "2026-11-19T09:00:00Z" });
    const twin = rawEvent({ source_event_id: "E_R101_V2b", accommodation_gross_idr: 4500000 });
    const s = run([v1, rawEvent(), twin], [rawPayment()]);
    expect(chosen(s, "R101")).toEqual({ hold: true, selected: null, superseded: ["E_R101_V1"] });
    expect(s.dedup).toEqual({ ...NO_DEDUP, superseded_reservation_versions: 1 });
    expect(codes(s)).toEqual(["reservation R101 AMBIGUOUS_VERSION", "payment P101 PAYMENT_HELD"]);
    expect(s.payments.map((p) => p.bucket)).toEqual(["held"]);
  });

  it("equal updated_at with the same content under two ids is one version: the smaller id, no exception", () => {
    const twin = rawEvent({ source_event_id: "E_R101_V2b" });
    for (const events of [[rawEvent(), twin], [twin, rawEvent()]]) {
      const s = run(events);
      expect(chosen(s, "R101")).toEqual({ hold: false, selected: "E_R101_V2", superseded: ["E_R101_V2b"] });
      expect(s.dedup).toEqual({ ...NO_DEDUP, superseded_reservation_versions: 1 });
      expect(s.exceptions).toEqual([]);
    }
  });

  it("the same instant written differently is the same content", () => {
    const s = run([rawEvent(), rawEvent({ updated_at: "2026-11-20T12:00:00+04:00" }), rawEvent({ extra: "ignored" })]);
    expect(s.dedup).toEqual({ ...NO_DEDUP, reservation_event_duplicates: 2 });
    expect(s.exceptions).toEqual([]);
  });

  it("different content under one source_event_id is CONFLICTING_EVENT: the reservation is held even with a clean newer version", () => {
    const v1 = rawEvent({ source_event_id: "E_R101_V1", updated_at: "2026-11-19T09:00:00Z" });
    const v1Other = rawEvent({ source_event_id: "E_R101_V1", updated_at: "2026-11-19T09:00:00Z", pbjt_idr: 1 });
    const s = run([v1, v1Other, rawEvent()], [rawPayment()]);
    expect(chosen(s, "R101")).toEqual({ hold: true, selected: null, superseded: [] });
    expect(s.dedup).toEqual(NO_DEDUP);
    expect(codes(s)).toEqual(["reservation R101 CONFLICTING_EVENT", "payment P101 PAYMENT_HELD"]);
  });

  it("a conflicting event naming two reservations holds both", () => {
    const s = run([rawEvent(), rawEvent({ reservation_id: "R102", property_id: "V02" })]);
    expect(s.reservations.map((r) => [r.reservation_id, r.hold])).toEqual([
      ["R101", true],
      ["R102", true],
    ]);
    expect(codes(s)).toEqual(["reservation R101 CONFLICTING_EVENT", "reservation R102 CONFLICTING_EVENT"]);
  });
});

describe("checks of the chosen snapshot", () => {
  it("an unknown villa is UNKNOWN_PROPERTY and nothing else", () => {
    const s = run([rawEvent({ property_id: "V09", currency: "USD" })]);
    expect(chosen(s, "R101")).toEqual({ hold: true, selected: "E_R101_V2", superseded: [] });
    expect(codes(s)).toEqual(["reservation R101 UNKNOWN_PROPERTY"]);
  });

  it.each([
    ["USD booking on an IDR villa", { currency: "USD" }, {}],
    ["IDR booking on a USD villa", {}, { base_currency: "USD" }],
    ["USD booking on a USD villa: the report is in rupiah", { currency: "USD" }, { base_currency: "USD" }],
    ["unknown currency", { currency: "EUR" }, {}],
  ])("%s is CURRENCY_MISMATCH", (_name, event, property) => {
    const properties = [{ property_id: "V01", base_currency: "IDR", ...property }];
    expect(codes(run([rawEvent(event)], [], { properties }))).toEqual(["reservation R101 CURRENCY_MISMATCH"]);
  });

  it.each(["2026-11-29", "2026-11-28"])("check_out %s on or before check_in is INVALID_STAY", (check_out) =>
    expect(codes(run([rawEvent({ check_out })]))).toEqual(["reservation R101 INVALID_STAY"]),
  );

  it.each(["cancelled", "Confirmed", "", "booked"])("status %j is UNKNOWN_STATUS", (status) =>
    expect(codes(run([rawEvent({ status })]))).toEqual(["reservation R101 UNKNOWN_STATUS"]),
  );

  it.each(["confirmed", "modified"])("status %s is accepted", (status) => {
    const s = run([rawEvent({ status })]);
    expect(chosen(s, "R101").hold).toBe(false);
    expect(s.exceptions).toEqual([]);
  });

  it("reports every failed check of one snapshot, in check order, with one decision", () => {
    const s = run([rawEvent({ currency: "USD", check_out: "2026-11-29", status: "cancelled" })]);
    expect(s.reservations).toHaveLength(1);
    expect(codes(s)).toEqual([
      "reservation R101 CURRENCY_MISMATCH",
      "reservation R101 INVALID_STAY",
      "reservation R101 UNKNOWN_STATUS",
    ]);
  });

  it("a night without a rule holds the reservation, and its payment with it", () => {
    const commission_rules = [{ property_id: "V01", effective_from: "2026-11-01", effective_to: "2026-11-30", rate_bps: 1700 }];
    const s = run([rawEvent()], [rawPayment()], { commission_rules });
    expect(chosen(s, "R101")).toEqual({ hold: true, selected: "E_R101_V2", superseded: [] });
    expect(s.payments.map((p) => p.bucket)).toEqual(["held"]);
    expect(codes(s)).toEqual(["reservation R101 NO_COMMISSION_RULE", "payment P101 PAYMENT_HELD"]);
  });

  it("the rules are checked only on a sound snapshot: a USD booking without rules reports CURRENCY_MISMATCH alone", () => {
    expect(codes(run([rawEvent({ currency: "USD" })], [], { commission_rules: [] }))).toEqual(["reservation R101 CURRENCY_MISMATCH"]);
  });

  it("checks only the latest version: a corrected booking after a USD one is accepted", () => {
    const usd = rawEvent({ source_event_id: "E_R101_V1", updated_at: "2026-11-19T09:00:00Z", currency: "USD" });
    const s = run([usd, rawEvent()]);
    expect(chosen(s, "R101")).toEqual({ hold: false, selected: "E_R101_V2", superseded: ["E_R101_V1"] });
    expect(s.exceptions).toEqual([]);
  });
});

describe("payments", () => {
  it("received for an accepted reservation is the villa's cash", () => {
    const s = run([rawEvent()], [rawPayment()]);
    expect(received(s)).toEqual([["P101", "V01", 4_180_000n]]);
    expect(s.exceptions).toEqual([]);
  });

  it("pending is held, even for a reservation nobody sent", () => {
    const s = run([rawEvent()], [rawPayment({ status: "pending" }), rawPayment({ payment_id: "P2", reservation_id: "R999", status: "pending" })]);
    expect(s.payments.map((p) => p.bucket)).toEqual(["held", "held"]);
    expect(codes(s)).toEqual(["payment P101 PENDING_PAYMENT", "payment P2 PENDING_PAYMENT"]);
  });

  it.each(["refunded", "Received", ""])("status %j is held with UNKNOWN_STATUS", (status) => {
    const s = run([rawEvent()], [rawPayment({ status })]);
    expect(s.payments.map((p) => p.bucket)).toEqual(["held"]);
    expect(codes(s)).toEqual(["payment P101 UNKNOWN_STATUS"]);
  });

  it("received for an unknown reservation is unmatched", () => {
    const s = run([rawEvent()], [rawPayment({ reservation_id: "R999" })]);
    expect(s.payments.map((p) => [p.bucket, p.payment.amount_idr])).toEqual([["unmatched", 4_180_000n]]);
    expect(codes(s)).toEqual(["payment P101 UNMATCHED_PAYMENT"]);
  });

  it("received for a reservation on hold is held, whichever way it is held", () => {
    const usd = run([rawEvent({ currency: "USD" })], [rawPayment()]);
    expect(usd.payments.map((p) => p.bucket)).toEqual(["held"]);
    expect(codes(usd)).toEqual(["reservation R101 CURRENCY_MISMATCH", "payment P101 PAYMENT_HELD"]);

    const conflict = run([rawEvent(), rawEvent({ pbjt_idr: 1 })], [rawPayment()]);
    expect(conflict.payments.map((p) => p.bucket)).toEqual(["held"]);
    expect(codes(conflict)).toEqual(["reservation R101 CONFLICTING_EVENT", "payment P101 PAYMENT_HELD"]);
  });

  it("different content under one payment_id is CONFLICTING_PAYMENT: no bucket, no duplicate counted", () => {
    const s = run([rawEvent()], [rawPayment(), rawPayment({ amount_idr: 4180001 }), rawPayment()]);
    expect(s.payments).toEqual([]);
    expect(s.dedup).toEqual(NO_DEDUP);
    expect(codes(s)).toEqual(["payment P101 CONFLICTING_PAYMENT"]);
  });
});

describe("determinism", () => {
  const events = [
    rawEvent({ source_event_id: "E_R101_V1", updated_at: "2026-11-19T09:00:00Z", status: "confirmed" }),
    rawEvent({ source_event_id: "E_R101_V1", updated_at: "2026-11-19T09:00:00Z", status: "confirmed" }),
    rawEvent(),
    rawEvent({ source_event_id: "E_R202", reservation_id: "R202", property_id: "V02", check_in: "2026-12-10", check_out: "2026-12-12" }),
    rawEvent({ source_event_id: "E_R303", reservation_id: "R303", currency: "USD" }),
    rawEvent({ source_event_id: "E_R050", reservation_id: "R050", status: "cancelled" }),
  ];
  const payments = [
    rawPayment(),
    rawPayment(),
    rawPayment({ payment_id: "P202", reservation_id: "R202" }),
    rawPayment({ payment_id: "P303", status: "pending" }),
    rawPayment({ payment_id: "P404", reservation_id: "R999" }),
    rawPayment({ payment_id: "P050", reservation_id: "R050" }),
  ];
  const rotate = <T>(list: T[], by: number) => [...list.slice(by), ...list.slice(0, by)];

  it("gives the same result for any order of the input, with every list sorted by id", () => {
    const expected = run(events, payments);
    expect(expected.reservations.map((r) => r.reservation_id)).toEqual(["R050", "R101", "R202", "R303"]);
    expect(expected.payments.map((p) => p.payment.payment_id)).toEqual(["P050", "P101", "P202", "P303", "P404"]);
    expect(codes(expected)).toEqual([
      "reservation R050 UNKNOWN_STATUS",
      "reservation R303 CURRENCY_MISMATCH",
      "payment P050 PAYMENT_HELD",
      "payment P303 PENDING_PAYMENT",
      "payment P404 UNMATCHED_PAYMENT",
    ]);
    for (const by of [1, 2, 3, 4, 5]) {
      expect(run(rotate(events, by), rotate(payments, by))).toEqual(expected);
      expect(run([...events].reverse(), [...payments].reverse())).toEqual(expected);
    }
  });
});
