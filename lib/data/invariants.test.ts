// Invariants of the dashboard under any filter (PLAN.md 11.3; ROADMAP.md phase 4): the property rows
// add up to the portfolio, which the calculator computes from the rows on its own; adjacent periods
// add up to their union; the switch splits a total into clean and under review.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, nightsBetween, type Money } from "../calc";
import { dashboardOf, type Dashboard } from "./dashboard";
import { parseFilters } from "./filters";
import { reconciliationOf } from "./reconciliation";
import { sampleSnapshot } from "./testing/snapshot";

const snapshot = await sampleSnapshot();
const { range } = snapshot;
const days = nightsBetween(range.from, range.to);
const ids = snapshot.properties.map((p) => p.propertyId);

const MONEY_FIELDS = [
  "gross",
  "grossUnderReview",
  "otaFee",
  "managementFee",
  "operatingExpenses",
  "ownerBalance",
  "received",
  "difference",
] as const;

const filterArb = fc.record({
  a: fc.integer({ min: 0, max: days }),
  b: fc.integer({ min: 0, max: days }),
  cluster: fc.option(fc.constantFrom(...snapshot.clusters), { nil: undefined }),
  property: fc.subarray(ids, { maxLength: 6 }),
  review: fc.constantFrom("on", "off"),
});

type FilterValue = { a: number; b: number; cluster: string | undefined; property: string[]; review: string };

function dashboardFor(f: FilterValue): Dashboard {
  const [lo, hi] = f.a <= f.b ? [f.a, f.b] : [f.b, f.a];
  const params = {
    from: addDays(range.from, lo),
    to: addDays(range.from, hi),
    property: f.property,
    review: f.review,
    ...(f.cluster === undefined ? {} : { cluster: f.cluster }),
  };
  const { filters, warnings } = parseFilters(params, snapshot);
  expect(warnings).toEqual([]);
  return dashboardOf(snapshot, filters);
}

const total = (rows: readonly Dashboard["properties"][number][], key: (typeof MONEY_FIELDS)[number]) =>
  rows.reduce((s, r) => s + r[key].amount, 0n);

describe("invariants under random filters", () => {
  it("property rows add up to the portfolio", () => {
    fc.assert(
      fc.property(filterArb, (f) => {
        const d = dashboardFor(f);
        for (const key of MONEY_FIELDS) expect(total(d.properties, key), key).toBe(d.totals[key].amount);
        expect(d.properties.reduce((n, p) => n + p.nights, 0)).toBe(d.totals.nights);
        expect(d.totals.gross).toEqual(d.headline.gross);
        expect(d.totals.received).toEqual(d.headline.received);
      }),
      { numRuns: 60 },
    );
  });

  it("two adjacent periods add up to their union", () => {
    fc.assert(
      fc.property(filterArb, fc.integer({ min: 0, max: days }), (f, c) => {
        const [lo, cut, hi] = [f.a, f.b, c].sort((x, y) => x - y) as [number, number, number];
        fc.pre(cut < hi);
        const whole = dashboardFor({ ...f, a: lo, b: hi });
        const left = dashboardFor({ ...f, a: lo, b: cut });
        const right = dashboardFor({ ...f, a: cut + 1, b: hi });
        for (const key of Object.keys(whole.headline) as (keyof Dashboard["headline"])[]) {
          const [w, l, r] = [whole.headline[key], left.headline[key], right.headline[key]];
          if (typeof w === "number") expect((l as number) + (r as number), key).toBe(w);
          else expect((l as Money).amount + (r as Money).amount, key).toBe(w.amount);
        }
      }),
      { numRuns: 40 },
    );
  });

  it("with records under review = clean only + the part under review", () => {
    fc.assert(
      fc.property(filterArb, (f) => {
        const on = dashboardFor({ ...f, review: "on" });
        const off = dashboardFor({ ...f, review: "off" });
        expect(on.headline.gross.amount).toBe(off.headline.gross.amount + on.underReview.gross.amount);
        expect(on.headline.netCashFlow.amount).toBe(off.headline.netCashFlow.amount + on.underReview.netCashFlow.amount);
        expect(on.underReview).toEqual(off.underReview);
      }),
      { numRuns: 40 },
    );
  });

  it("the reconciliation page shows the same totals as the overview", () => {
    fc.assert(
      fc.property(filterArb, (f) => {
        const d = dashboardFor(f);
        const r = reconciliationOf(snapshot, d.filters);
        expect(r.expected).toEqual(d.headline.expected);
        expect(r.received).toEqual(d.headline.reconciledReceived);
        expect(r.difference).toEqual(d.headline.difference);
        expect(r.byStatus).toEqual(d.byStatus);
        expect(r.rows.reduce((s, l) => s + l.difference.amount, 0n)).toBe(r.difference.amount);
      }),
      { numRuns: 40 },
    );
  });
});
