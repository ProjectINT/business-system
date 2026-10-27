import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculateAccruals } from "./accrual";
import { itemize } from "./breakdown";
import { calculateBreakdown, calculateOverview } from "./overview";
import { DEFAULT_POLICIES, type CalcPolicies } from "./policies";
import { fromEpochDay, period } from "./primitives/calendar";
import { idr, sum, type Money } from "./primitives/money";
import { parseRate, rateToString } from "./primitives/rate";
import { calculateReservations } from "./reservation";
import { overviewInput } from "./testing/arbitraries";
import { date, EXP, OCTOBER, PAY, RES, RULES, scope, synthetic } from "./testing/fixtures";
import type { Breakdown, Scope, Summary } from "./types";

const calcsOf = (...rs: (typeof RES)[keyof typeof RES][]) =>
  calculateReservations(rs, RULES, DEFAULT_POLICIES).results;

describe("itemize", () => {
  it("a stay crossing the period brings only its nights in the period", () => {
    const { stays } = itemize(calcsOf(RES.R0018), [], [], scope());
    const a = calculateAccruals(calcsOf(RES.R0018), [], scope());
    expect(stays).toHaveLength(1);
    expect(stays[0]).toMatchObject({ reservationId: "R0018", stayNights: 6, nights: 3, gross: a.gross });
    expect(stays[0]?.managementFee).toEqual(a.managementFee);
    expect(stays[0]?.otaFee).toEqual(a.otaFee);
  });

  it("rates: the different rates of the stay's nights in the period; the 'checkout' line carries them all", () => {
    const rules = [
      { ...RULES[0]!, propertyId: "V011", effectiveFrom: date("2026-09-01"), effectiveTo: date("2026-09-30") },
      { ...RULES[0]!, propertyId: "V011", effectiveFrom: date("2026-10-01"), effectiveTo: null, rate: parseRate("0.2") },
    ];
    const r = synthetic({ checkIn: date("2026-09-28"), checkOut: date("2026-10-02") });
    const rates = (policies: CalcPolicies, p: Partial<Scope>) =>
      itemize(calculateReservations([r], rules, policies).results, [], [], scope(p)).stays[0]!.rates.map(rateToString);
    expect(rates(DEFAULT_POLICIES, {})).toEqual(["0.17"]);
    expect(rates(DEFAULT_POLICIES, { period: OCTOBER })).toEqual(["0.2"]);
    expect(rates(DEFAULT_POLICIES, { period: period(date("2026-09-01"), date("2026-10-31")) })).toEqual(["0.17", "0.2"]);
    expect(rates({ ...DEFAULT_POLICIES, revenueRecognition: "checkout" }, { period: OCTOBER })).toEqual(["0.17", "0.2"]);
  });

  it("leaves out cancellations, stays outside the period and records under review when they are off", () => {
    const calcs = calcsOf(RES.R0131, RES.R0003, RES.R0143, RES.R0067);
    expect(itemize(calcs, [], [], scope()).stays.map((s) => s.reservationId)).toEqual(["R0143", "R0067"]);
    expect(itemize(calcs, [], [], scope({ includeReview: false })).stays.map((s) => s.reservationId)).toEqual(["R0067"]);
  });

  it("expenses by expense date, paid and pending; payments by payment date; each sorted by date", () => {
    const b = itemize([], [PAY.P0055, PAY.P0009, PAY.P0010], [EXP.E0057, EXP.E0016, EXP.E0018], scope());
    expect(b.expenses.map((e) => e.expenseId)).toEqual(["E0018", "E0057"]);
    expect(b.payments.map((p) => p.paymentId)).toEqual(["P0010", "P0055"]);
  });
});

const total = (items: readonly { amount: Money }[]) => sum(items.map((i) => i.amount), "IDR");

function expectAddsUp(b: Breakdown, s: Summary) {
  expect(b.stays.reduce((n, x) => n + x.nights, 0)).toBe(s.accruals.nights);
  for (const key of ["gross", "pbjt", "refund", "otaFee", "managementFee"] as const) {
    expect(sum(b.stays.map((x) => x[key]), "IDR")).toEqual(s.accruals[key]);
  }
  expect(total(b.expenses)).toEqual(s.accruals.operatingExpenses);
  expect(total(b.payments)).toEqual(s.cashFlow.received);
  expect(total(b.pendingPayments)).toEqual(s.cashFlow.pending);
}

describe("calculateBreakdown", () => {
  it("the records add up to the totals, for the portfolio and for each property", () => {
    fc.assert(
      fc.property(overviewInput, fc.boolean(), (input, includeReview) => {
        const s = scope({
          period: period(fromEpochDay(20666), fromEpochDay(20666 + 45)),
          today: fromEpochDay(20700),
          includeReview,
        });
        const o = calculateOverview(input, s, DEFAULT_POLICIES);
        const b = calculateBreakdown(input, s, DEFAULT_POLICIES);
        expectAddsUp(b, o.portfolio);
        for (const p of o.properties) {
          const of = <T extends { propertyId: string }>(list: readonly T[]) => list.filter((x) => x.propertyId === p.propertyId);
          expectAddsUp({ stays: of(b.stays), expenses: of(b.expenses), payments: of(b.payments), pendingPayments: of(b.pendingPayments) }, p);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("golden V011, September: the four stays and their amounts", () => {
    const input = {
      reservations: [RES.R0143, RES.R0020, RES.R0110, RES.R0067],
      commissionRules: RULES,
      payments: [PAY.P0010, PAY.P0055],
      expenses: [EXP.E0018, EXP.E0057, EXP.E0016, EXP.E0072],
    };
    const b = calculateBreakdown(input, scope(), DEFAULT_POLICIES);
    expect(b.stays.map((x) => [x.reservationId, x.nights, x.gross.amount])).toEqual([
      ["R0143", 6, 6955058n],
      ["R0020", 3, 3602767n],
      ["R0110", 2, 8309300n],
      ["R0067", 4, 7924759n],
    ]);
    expect(sum(b.stays.map((x) => x.gross), "IDR")).toEqual(idr(26791884n));
  });
});
