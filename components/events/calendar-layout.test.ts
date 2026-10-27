import { describe, expect, it } from "vitest";
import { toView } from "@/lib/calc";
import { explainCase } from "@/lib/nightly/explain";
import publicCase from "@/final-test/case_public.json";
import demoCase from "@/final-test/variants/all-exceptions.json";
import { axisOf, calendarLayout, exactFee, labelSide, RATE_RAMP, rateScale, ruleBandOf, spanOf, type CalendarLayout } from "./calendar-layout";
import type { Model } from "./view-of";

const publicModel: Model = toView(explainCase(publicCase));
const demoModel: Model = toView(explainCase(demoCase));

const booking = (l: CalendarLayout, id: string) => l.villas.flatMap((v) => v.bookings).find((b) => b.r.reservation_id === id)!;
const dayOf = (l: CalendarLayout, i: number) => l.axis.days[i];

describe("axis", () => {
  it("is every day of the report months, with a boundary at each new month", () => {
    const axis = axisOf(["2026-11", "2026-12"]);
    expect(axis.days).toHaveLength(61);
    expect(axis.days[0]).toBe("2026-11-01");
    expect(axis.days[60]).toBe("2026-12-31");
    expect(axis.boundaries).toEqual([30]);
  });

  it("clips a span to the axis and counts the days off it", () => {
    const axis = axisOf(["2026-11"]);
    expect(spanOf(axis, ["2026-10-31", "2026-11-01", "2026-11-02"])).toEqual({ range: { start: 0, end: 2 }, before: 1, after: 0 });
    expect(spanOf(axis, ["2026-12-01"])).toEqual({ range: null, before: 0, after: 1 });
  });
});

describe("rates", () => {
  it("spreads the distinct rates over the ramp, low rate darkest", () => {
    const s = rateScale([2000, 1000, 1700, 1000]);
    expect([...s]).toEqual([
      [1000, RATE_RAMP[0]],
      [1700, RATE_RAMP[3]],
      [2000, RATE_RAMP[5]],
    ]);
    expect(rateScale([1500]).get(1500)).toBe(RATE_RAMP[2]);
    for (let n = 2; n <= RATE_RAMP.length; n += 1) {
      const colours = [...rateScale(Array.from({ length: n }, (_, i) => i)).values()];
      expect(new Set(colours).size).toBe(n);
    }
  });

  it("stacks overlapping rules of a villa in lanes and sets aside rules off the axis", () => {
    const axis = axisOf(demoModel.report_months);
    const v03 = ruleBandOf(axis, demoModel.rules, "V03");
    expect(v03.lanes).toBe(2);
    expect(v03.segments.map((s) => [s.start, s.end, s.lane])).toEqual([
      [0, 50, 0],
      [44, 61, 1],
    ]);
    const v01 = ruleBandOf(axis, demoModel.rules, "V01");
    expect(v01.lanes).toBe(1);
    expect(v01.after.map((i) => demoModel.rules[i]!.rate_bps)).toEqual([2200]);
  });
});

describe("public case (plan, 7)", () => {
  const l = calendarLayout(publicModel);

  it("draws R101's nights at 17 % and 20 % and R303's held dates", () => {
    const r101 = booking(l, "R101");
    expect(r101.span.range).toEqual({ start: l.axis.index.get("2026-11-29"), end: l.axis.index.get("2026-12-03") });
    expect(r101.r.nights.map((n) => [n.night, n.rate_bps])).toEqual([
      ["2026-11-29", 1700],
      ["2026-11-30", 1700],
      ["2026-12-01", 2000],
      ["2026-12-02", 2000],
    ]);
    const r303 = booking(l, "R303");
    expect(r303.r.hold).toBe(true);
    expect(r303.stay?.currency).toBe("USD");
    expect(dayOf(l, r303.span.range!.start)).toBe("2026-12-15");
    expect(r303.span.range!.end - r303.span.range!.start).toBe(2);
    expect(r101.earlier).toEqual([]); // E_R101_V1 had the same dates
  });

  it("puts payments on their dates: P101 filled ×2, P303 hollow, P202 before R202's nights, P404 with no booking", () => {
    const p101 = booking(l, "R101").payments.find((p) => p.payment_id === "P101")!;
    expect([dayOf(l, p101.day!), p101.filled, p101.rows.length]).toEqual(["2026-12-07", true, 2]);
    const p303 = booking(l, "R101").payments.find((p) => p.payment_id === "P303")!;
    expect([dayOf(l, p303.day!), p303.filled, p303.codes]).toEqual(["2026-12-15", false, ["PENDING_PAYMENT"]]);
    const p202 = booking(l, "R202").payments[0]!;
    expect([p202.payment_id, dayOf(l, p202.day!)]).toEqual(["P202", "2026-11-28"]);
    expect(l.orphans.map((p) => [p.payment_id, dayOf(l, p.day!), p.codes])).toEqual([["P404", "2026-12-12", ["UNMATCHED_PAYMENT"]]]);
  });
});

describe("all exception types", () => {
  const l = calendarLayout(demoModel);

  it("gives a villa outside properties a group of its own", () => {
    expect(l.villas.map((v) => [v.property_id, v.known])).toEqual([
      ["V01", true],
      ["V02", true],
      ["V03", true],
      ["V04", true],
      ["V09", false],
    ]);
  });

  it("counts nights outside the report months at the edge, and every payment once", () => {
    const r112 = booking(l, "R112");
    expect(r112.span.after).toBe(1);
    expect(r112.payments.map((p) => [p.payment_id, p.day, p.side, p.kind])).toEqual([["P112", null, "before", "outside"]]);
    const p909 = booking(l, "R202").payments.find((p) => p.payment_id === "P909")!;
    expect([p909.rows.length, p909.kind, p909.filled]).toEqual([2, "conflicting", false]);
    const marks = [...l.villas.flatMap((v) => v.bookings.flatMap((b) => b.payments)), ...l.orphans];
    expect(marks.flatMap((m) => m.rows.map((r) => r.row)).sort((a, b) => a - b)).toEqual(demoModel.payments.map((p) => p.row));
  });

  it("takes a held booking's dates from its snapshot, else its latest row; no nights is a sliver", () => {
    expect(booking(l, "R404").stay?.source_event_id).toBe("E_R404_B");
    expect(booking(l, "R505").stay?.reservation_id).toBe("R505");
    const r808 = booking(l, "R808");
    expect([r808.span.range, dayOf(l, r808.noNights!)]).toEqual([null, "2026-11-20"]);
  });
});

describe("every night of every accepted booking", () => {
  it.each([
    ["public", publicModel],
    ["all exceptions", demoModel],
  ])("is in exactly one cell or counted at an edge (%s)", (_, model) => {
    const l = calendarLayout(model);
    for (const b of l.villas.flatMap((v) => v.bookings)) {
      if (b.r.hold) continue;
      const inside = b.r.nights.filter((n) => l.axis.index.has(n.night));
      expect(inside.every((n) => n.in_window)).toBe(true);
      expect(new Set(inside.map((n) => l.axis.index.get(n.night))).size).toBe(inside.length);
      expect(inside.length + b.span.before + b.span.after).toBe(b.r.nights.length);
    }
  });
});

describe("exactFee", () => {
  it("shows the fraction HALF_UP rounded away", () => {
    expect(exactFee(1_100_050, 1700)).toEqual({ text: "187,008.5", rounded: true });
    expect(exactFee(1_100_000, 1700)).toEqual({ text: "187,000", rounded: false });
    expect(exactFee(1_000_001, 1725)).toEqual({ text: "172,500.1725", rounded: true });
    expect(exactFee(-100, 1500)).toEqual({ text: "−15", rounded: false });
  });
});

describe("labelSide", () => {
  it("keeps a payment's label off the row's stay", () => {
    const l = calendarLayout(demoModel);
    const r505 = booking(l, "R505");
    const p5050 = r505.payments[0]!;
    expect(labelSide(p5050.day!, r505.occupied, l.axis.days.length)).toBe("left"); // R505 starts two days later
    expect(labelSide(10, new Set(), 61)).toBe("right");
    expect(labelSide(1, new Set([2]), 61)).toBe(null);
    expect(labelSide(60, new Set(), 61)).toBe("right");
  });
});
