// The model of the /events page against the report it explains: the same report as runCase, the parts
// of every figure add up to it, the fates of the rows agree with `dedup`, every rupiah of the payments
// file is in exactly one kind. The public case against docs/EVENTS_VISUALIZATION_PLAN.md, section 7;
// the demo case final-test/variants/all-exceptions.json against its hand-made numbers.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import publicCase from "../../final-test/case_public.json";
import demoCase from "../../final-test/variants/all-exceptions.json";
import { toView } from "../calc";
import { explainCase, METRIC_KEYS, type Explanation } from "./explain";
import { runCase } from "./index";
import { figures, rawCase, rawEvent, rawPayment, type Raw } from "./testing/fixtures";

const sum = (values: readonly bigint[]) => values.reduce((a, b) => a + b, 0n);

/** Every cell of the report, by_property, monthly and total, against the parts the model lists for it. */
function expectCellsAddUp(m: Explanation) {
  for (const c of m.cells) {
    const figures =
      c.property_id !== null ? m.report.by_property[c.property_id]![c.month!]! : c.month !== null ? m.report.monthly[c.month]! : m.report.total;
    const nights = (k: "accommodation_gross_idr" | "pbjt_idr" | "ota_fee_idr" | "management_fee_idr") => sum(c.nights.map((n) => n[k].amount));
    expect(nights("accommodation_gross_idr")).toBe(figures.accommodation_gross_idr.amount);
    expect(nights("pbjt_idr")).toBe(figures.pbjt_liability_idr.amount);
    expect(nights("ota_fee_idr")).toBe(figures.ota_fee_idr.amount);
    expect(nights("management_fee_idr")).toBe(figures.management_fee_idr.amount);
    expect(figures.owner_estimate_idr.amount).toBe(
      figures.accommodation_gross_idr.amount - figures.ota_fee_idr.amount - figures.management_fee_idr.amount,
    );
    expect(sum(c.payments.map((p) => p.amount_idr.amount))).toBe(figures.cash_received_idr.amount);
  }
  // villas × months + months + the period
  expect(m.cells).toHaveLength(m.properties.length * m.report_months.length + m.report_months.length + 1);
}

function expectControlsAgree(m: Explanation) {
  const e = m.controls.events;
  expect(e.rows).toBe(m.events.length);
  expect(e.selected + e.superseded + e.duplicate + e.candidate + e.blocked + e.rejected).toBe(e.rows);
  expect(e.duplicate).toBe(m.report.dedup.reservation_event_duplicates);
  expect(e.superseded).toBe(m.report.dedup.superseded_reservation_versions);
  expect(e.bookings).toBe(Object.keys(m.report.trace).length);
  expect(e.in_figures + e.held_bookings).toBe(e.bookings);
  const p = m.controls.payments;
  expect(sum(Object.values(p.kinds).map((k) => k.amount.amount))).toBe(p.amount.amount);
  expect(sum(m.payments.map((x) => x.amount_idr.amount))).toBe(p.amount.amount);
  expect(Object.values(p.kinds).reduce((n, k) => n + k.rows, 0)).toBe(p.rows);
  expect(p.kinds.duplicate.rows).toBe(m.report.dedup.payment_duplicates);
  expect(p.kinds.held.amount.amount).toBe(m.report.cash_held_idr.amount);
  expect(p.kinds.unmatched.amount.amount).toBe(m.report.cash_unmatched_idr.amount);
  expect(p.kinds.received.amount.amount).toBe(m.report.total.cash_received_idr.amount);
}

const fateOf = (m: Explanation, id: string) => m.events.filter((e) => e.source_event_id === id).map((e) => e.fate);
const paymentFateOf = (m: Explanation, id: string) => m.payments.filter((p) => p.payment_id === id).map((p) => p.fate);
const amount = (n: number) => ({ amount: BigInt(n), currency: "IDR" });

describe("explainCase: the public case (plan, section 7)", () => {
  const m = explainCase(publicCase);

  it("the report is runCase's, and without decisions as computed is the same", () => {
    expect(toView(m.report)).toEqual(runCase(publicCase));
    expect(m.as_computed).toBe(m.report);
    expect(m.disputes).toEqual([]);
    expect(m.applied).toEqual([]);
  });

  it("events: 5 rows → 1 duplicate → 1 superseded → 3 bookings → 1 held → 2 in figures, 6 nights", () => {
    expect(m.controls.events).toEqual({
      rows: 5,
      selected: 3,
      superseded: 1,
      duplicate: 1,
      candidate: 0,
      blocked: 0,
      rejected: 0,
      bookings: 3,
      held_bookings: 1,
      in_figures: 2,
      nights: 6,
    });
    expect(fateOf(m, "E_R101_V1")).toEqual([{ kind: "superseded", by: "E_R101_V2" }, { kind: "duplicate", of: 0 }]);
    expect(fateOf(m, "E_R101_V2")).toEqual([{ kind: "selected", in_figures: true }]);
    expect(fateOf(m, "E_R303")).toEqual([{ kind: "selected", in_figures: false }]);
  });

  it("payments: 10 710 000 = received 6 380 000 + duplicate 4 180 000 + held 50 000 + unmatched 100 000", () => {
    const k = m.controls.payments.kinds;
    expect(m.controls.payments.amount).toEqual(amount(10_710_000));
    expect([k.received.amount, k.duplicate.amount, k.held.amount, k.unmatched.amount]).toEqual(
      [6_380_000, 4_180_000, 50_000, 100_000].map(amount),
    );
    expect(k.outside.rows + k.conflicting.rows + k.rejected.rows).toBe(0);
    expect(paymentFateOf(m, "P202")).toEqual([{ kind: "received", property_id: "V02", month: "2026-11", counted: true }]);
    expect(paymentFateOf(m, "P303")).toEqual([{ kind: "held", code: "PENDING_PAYMENT" }]);
    expect(paymentFateOf(m, "P404")).toEqual([{ kind: "unmatched" }]);
  });

  it("every figure is the sum of its nights and payments", () => {
    expectCellsAddUp(m);
    expectControlsAgree(m);
  });

  it("V01 · 2026-12 · management fee = 2 nights of R101 × 1 100 000 × 20 %", () => {
    const cell = m.cells.find((c) => c.property_id === "V01" && c.month === "2026-12")!;
    expect(cell.nights.map((n) => [n.reservation_id, n.night, n.rate_bps, n.management_fee_idr.amount])).toEqual([
      ["R101", "2026-12-01", 2000, 220_000n],
      ["R101", "2026-12-02", 2000, 220_000n],
    ]);
    expect(m.rules[cell.nights[0]!.rule]).toMatchObject({ property_id: "V01", effective_from: "2026-12-01", rate_bps: 2000 });
  });

  it("V02 · 2026-11 · cash received = P202 of 28 Nov, no nights", () => {
    const cell = m.cells.find((c) => c.property_id === "V02" && c.month === "2026-11")!;
    expect(cell.nights).toEqual([]);
    expect(cell.payments).toEqual([
      { row: 2, payment_id: "P202", reservation_id: "R202", payment_date: "2026-11-28", amount_idr: amount(2_200_000) },
    ]);
  });

  it("reservations: rows, payments, nights with their rule, codes", () => {
    const r101 = m.reservations.find((r) => r.reservation_id === "R101")!;
    expect(r101).toMatchObject({ property_id: "V01", hold: false, selected: "E_R101_V2", superseded: ["E_R101_V1"], rows: [0, 1, 2], payments: [0, 1, 3], codes: [] });
    expect(r101.nights.map((n) => [n.night, n.rate_bps, n.in_window])).toEqual([
      ["2026-11-29", 1700, true],
      ["2026-11-30", 1700, true],
      ["2026-12-01", 2000, true],
      ["2026-12-02", 2000, true],
    ]);
    const r303 = m.reservations.find((r) => r.reservation_id === "R303")!;
    expect(r303).toMatchObject({ property_id: "V01", hold: true, selected: "E_R303", nights: [], codes: ["CURRENCY_MISMATCH"] });
  });

  it("rows keep the input's order, updated_at as UTC ISO", () => {
    expect(m.events.map((e) => e.row)).toEqual([0, 1, 2, 3, 4]);
    expect(m.events[2]!.updated_at).toBe("2026-11-20T08:00:00.000Z");
    expect(m.events[0]!.content).toBe(m.events[1]!.content);
    expect(m.events[0]!.content).not.toBe(m.events[2]!.content);
  });
});

describe("explainCase: the demo case with every exception", () => {
  const m = explainCase(demoCase);

  it("the report is runCase's; each of the 13 codes occurs", () => {
    expect(toView(m.report)).toEqual(runCase(demoCase));
    expect(new Set(m.report.exceptions.map((e) => e.code)).size).toBe(13);
  });

  it("the hand-made figures (plan, section 7)", () => {
    const r = runCase(demoCase);
    expect(r.by_property.V01).toEqual({
      "2026-11": figures(2_200_000, 220_000, 330_000, 374_000, 1_496_000, 0),
      "2026-12": figures(4_200_000, 420_000, 630_000, 840_000, 2_730_000, 4_180_000),
    });
    expect(r.by_property.V03?.["2026-11"]).toEqual(figures(1_800_000, 180_000, 270_000, 270_000, 1_260_000, 0));
    expect(r.total).toEqual(figures(10_200_000, 1_020_000, 1_230_000, 1_684_000, 7_286_000, 6_380_000));
    expect([r.cash_held_idr, r.cash_unmatched_idr]).toEqual([9_400_000, 100_000]);
  });

  it("disputed rows are candidates; money of the file is in exactly one kind", () => {
    expect(fateOf(m, "E_R404_A")).toEqual([{ kind: "candidate", code: "AMBIGUOUS_VERSION", case_key: "version:R404" }]);
    expect(fateOf(m, "E_R505")).toEqual([
      { kind: "candidate", code: "CONFLICTING_EVENT", case_key: "event:E_R505" },
      { kind: "candidate", code: "CONFLICTING_EVENT", case_key: "event:E_R505" },
    ]);
    expect(paymentFateOf(m, "P909")).toEqual([
      { kind: "conflicting", case_key: "payment:P909" },
      { kind: "conflicting", case_key: "payment:P909" },
    ]);
    expect(paymentFateOf(m, "P112")).toEqual([{ kind: "received", property_id: "V01", month: "2026-10", counted: false }]);
    const k = m.controls.payments.kinds;
    expect(m.controls.payments.amount).toEqual(amount(23_960_000));
    expect([k.received, k.outside, k.held, k.unmatched, k.duplicate, k.conflicting].map((x) => x.amount)).toEqual(
      [6_380_000, 2_850_000, 9_400_000, 100_000, 4_180_000, 1_050_000].map(amount),
    );
    expectCellsAddUp(m);
    expectControlsAgree(m);
  });

  it("a night outside report_months is listed but not in a cell; an unknown villa keeps its own id", () => {
    const r112 = m.reservations.find((r) => r.reservation_id === "R112")!;
    expect(r112.nights.map((n) => [n.night, n.in_window, m.rules[n.rule]!.rate_bps])).toEqual([
      ["2026-12-30", true, 2000],
      ["2026-12-31", true, 2000],
      ["2027-01-01", false, 2200],
    ]);
    expect(m.cells.find((c) => c.property_id === null && c.month === null)!.nights.some((n) => n.night === "2027-01-01")).toBe(false);
    expect(m.reservations.find((r) => r.reservation_id === "R606")!.property_id).toBe("V09");
    expect(m.reservations.find((r) => r.reservation_id === "R404")).toMatchObject({ property_id: "V02", selected: null, rows: [5, 6], payments: [5] });
  });

  it("three disputes, each choice with what it changes", () => {
    expect(m.disputes.map((d) => [d.case_key, d.code, d.candidates.length])).toEqual([
      ["event:E_R505", "CONFLICTING_EVENT", 2],
      ["payment:P909", "CONFLICTING_PAYMENT", 2],
      ["version:R404", "AMBIGUOUS_VERSION", 2],
    ]);
    const r404 = m.disputes.find((d) => d.case_key === "version:R404")!;
    const a = r404.options.find((o) => o.pick === "E_R404_A")!;
    expect(a.changes.filter((c) => c.metric === "accommodation_gross_idr")).toEqual([
      { property_id: "V02", month: "2026-12", metric: "accommodation_gross_idr", delta: amount(3_000_000) },
    ]);
    expect(a.changes.find((c) => c.metric === "management_fee_idr")?.delta).toEqual(amount(300_000));
    expect(a.changes.find((c) => c.metric === "cash_received_idr")?.delta).toEqual(amount(2_850_000));
    expect(a.held).toEqual(amount(-2_850_000));
    expect(a.unmatched).toEqual(amount(0));
    expect(a.moved).toEqual([{ payment_id: "P4040", from: "held", to: "received" }]);
    expect(a.opens).toEqual([]);
    const p909 = m.disputes.find((d) => d.case_key === "payment:P909")!;
    expect(p909.options.map((o) => [o.moved, o.changes.map((c) => [c.property_id, c.month, c.metric, c.delta.amount])])).toEqual(
      expect.arrayContaining([
        [[{ payment_id: "P909", from: "none", to: "received" }], [["V02", "2026-12", "cash_received_idr", 500_000n]]],
        [[{ payment_id: "P909", from: "none", to: "received" }], [["V02", "2026-12", "cash_received_idr", 550_000n]]],
      ]),
    );
  });
});

describe("explainCase: decisions", () => {
  const open = explainCase(demoCase);
  const decide = (case_key: string, pick: (keys: string[]) => string) => {
    const d = open.disputes.find((x) => x.case_key === case_key)!;
    return {
      case_key,
      record_key: d.record_key,
      decision: "pick" as const,
      pick: pick(d.candidates.map((c) => c.key)),
      candidates_hash: d.candidates_hash,
      comment: "checked with the channel",
      decided_by: "Finance team",
      decided_at: "2026-10-27T10:00:00Z",
    };
  };

  it("a decision removes the other candidates: their rows are rejected, the figures change as the option said", () => {
    const d = decide("version:R404", () => "E_R404_A");
    const m = explainCase(demoCase, [d]);
    expect(fateOf(m, "E_R404_A")).toEqual([{ kind: "selected", in_figures: true }]);
    expect(fateOf(m, "E_R404_B")).toEqual([{ kind: "rejected", case_key: "version:R404" }]);
    expect(paymentFateOf(m, "P4040")).toEqual([{ kind: "received", property_id: "V02", month: "2026-12", counted: true }]);
    expect(m.applied).toEqual([{ decision: d, removed: [6] }]);
    expect(toView(m.as_computed)).toEqual(runCase(demoCase));
    const option = open.disputes.find((x) => x.case_key === "version:R404")!.options.find((o) => o.pick === "E_R404_A")!;
    for (const c of option.changes) {
      const before = open.report.by_property[c.property_id]![c.month]![c.metric].amount;
      expect(m.report.by_property[c.property_id]![c.month]![c.metric].amount - before).toBe(c.delta.amount);
    }
    expect(m.disputes.map((x) => x.case_key)).toEqual(["event:E_R505", "payment:P909"]);
    expect(m.controls.events.rejected).toBe(1);
    expectCellsAddUp(m);
    expectControlsAgree(m);
  });

  it("all three decided: no exception of the decide kind is left, held money moved to received", () => {
    const decisions = [
      decide("event:E_R505", (k) => k[0]!),
      decide("payment:P909", (k) => k[1]!),
      decide("version:R404", () => "E_R404_B"),
    ];
    const m = explainCase(demoCase, decisions);
    expect(m.disputes).toEqual([]);
    expect(m.report.exceptions.filter((e) => ["AMBIGUOUS_VERSION", "CONFLICTING_EVENT", "CONFLICTING_PAYMENT"].includes(e.code))).toEqual([]);
    expect(m.report.cash_held_idr.amount).toBe(9_400_000n - 2_850_000n - 3_300_000n);
    expect(paymentFateOf(m, "P909").map((f) => f.kind).sort()).toEqual(["received", "rejected"]);
    expect(m.controls.payments.kinds.rejected.rows).toBe(1);
    expectCellsAddUp(m);
    expectControlsAgree(m);
  });

  it("a stale decision is kept apart and changes nothing", () => {
    const d = { ...decide("version:R404", () => "E_R404_A"), candidates_hash: "00000000" };
    const m = explainCase(demoCase, [d]);
    expect(m.stale).toEqual([d]);
    expect(m.applied).toEqual([]);
    expect(m.report).toEqual(open.report);
  });
});

describe("explainCase: fates beyond the two cases", () => {
  const model = (events: Raw[], payments: Raw[] = []) => explainCase(rawCase({ reservation_events: events, payments }));

  it("older versions of a reservation in dispute are superseded by no one", () => {
    const m = model([
      rawEvent({ source_event_id: "E0", updated_at: "2026-11-01T00:00:00Z" }),
      rawEvent({ source_event_id: "E1" }),
      rawEvent({ source_event_id: "E2", accommodation_gross_idr: 1 }),
    ]);
    expect(fateOf(m, "E0")).toEqual([{ kind: "superseded", by: null }]);
    expect(m.reservations[0]).toMatchObject({ property_id: "V01", selected: null });
  });

  it("a conflicting event blocks the other versions of its reservation; picking a copy may open a version dispute", () => {
    const events = [
      rawEvent({ source_event_id: "E1", accommodation_gross_idr: 1 }),
      rawEvent({ source_event_id: "E1", accommodation_gross_idr: 2 }),
      rawEvent({ source_event_id: "E2", updated_at: "2026-11-01T00:00:00Z" }),
      rawEvent({ source_event_id: "E3" }),
    ];
    const m = model(events);
    expect(fateOf(m, "E2")).toEqual([{ kind: "blocked" }]);
    expect(fateOf(m, "E3")).toEqual([{ kind: "blocked" }]);
    const d = m.disputes[0]!;
    expect(d.case_key).toBe("event:E1");
    expect(d.options.map((o) => o.opens)).toEqual([["version:R101"], ["version:R101"]]);
    const decided = explainCase(rawCase({ reservation_events: events }), [
      {
        case_key: d.case_key,
        record_key: d.record_key,
        decision: "pick",
        pick: d.candidates[0]!.key,
        candidates_hash: d.candidates_hash,
        comment: "copy one",
        decided_by: "Finance team",
        decided_at: "2026-10-27T10:00:00Z",
      },
    ]);
    expect(decided.disputes.map((x) => x.case_key)).toEqual(["version:R101"]);
    expect(fateOf(decided, "E2")).toEqual([{ kind: "superseded", by: null }]);
    expect(fateOf(decided, "E3")).toEqual([{ kind: "candidate", code: "AMBIGUOUS_VERSION", case_key: "version:R101" }]);
  });

  it("an unknown payment status is held with its code", () => {
    const m = model([rawEvent()], [rawPayment({ status: "failed" })]);
    expect(paymentFateOf(m, "P101")).toEqual([{ kind: "held", code: "UNKNOWN_STATUS" }]);
  });
});

describe("explainCase: properties on any mix of the demo rows", () => {
  const rows = <T>(list: readonly T[]) => fc.array(fc.constantFrom(...list), { maxLength: 24 });

  it("the model agrees with runCase, `dedup` and the payments file; a reordered input gives the same figures and fates", () => {
    fc.assert(
      fc.property(rows(demoCase.reservation_events), rows(demoCase.payments), fc.boolean(), (events, payments, reverse) => {
        const input = { ...demoCase, reservation_events: events, payments };
        const m = explainCase(input);
        expect(toView(m.report)).toEqual(runCase(input));
        expectCellsAddUp(m);
        expectControlsAgree(m);
        const flipped = explainCase({
          ...input,
          reservation_events: reverse ? [...events].reverse() : events,
          payments: reverse ? [...payments].reverse() : payments,
        });
        expect(flipped.report).toEqual(m.report);
        expect(flipped.controls).toEqual(m.controls);
        const kinds = (x: Explanation) => x.events.map((e) => `${e.source_event_id} ${e.fate.kind}`).sort();
        expect(kinds(flipped)).toEqual(kinds(m));
        for (const d of m.disputes) {
          for (const o of d.options) expect(o.changes.every((c) => c.delta.amount !== 0n && METRIC_KEYS.includes(c.metric))).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });
});
