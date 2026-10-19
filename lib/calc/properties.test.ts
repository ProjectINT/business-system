// Invariants of the aggregates on random data (docs/CALCULATION_MODULE.md, 11.7).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculateAccruals } from "./accrual";
import { calculateCashFlow } from "./cash";
import { calculateOverview } from "./overview";
import { DEFAULT_POLICIES } from "./policies";
import { fromEpochDay, period } from "./primitives/calendar";
import { add, sum, type Money } from "./primitives/money";
import { calculateReservations } from "./reservation";
import { overviewInput, splitPeriod } from "./testing/arbitraries";
import { deepFreeze, scope } from "./testing/fixtures";
import type { Accruals, CashFlow, OverviewInput, Scope } from "./types";

const runs = { numRuns: 200 };

function addAccruals(a: Accruals, b: Accruals): Accruals {
  return {
    nights: a.nights + b.nights,
    gross: add(a.gross, b.gross),
    refund: add(a.refund, b.refund),
    otaFee: add(a.otaFee, b.otaFee),
    otaFeeByChannel: {
      OTA: add(a.otaFeeByChannel.OTA, b.otaFeeByChannel.OTA),
      Direct: add(a.otaFeeByChannel.Direct, b.otaFeeByChannel.Direct),
    },
    netRental: add(a.netRental, b.netRental),
    managementFee: add(a.managementFee, b.managementFee),
    operatingExpenses: add(a.operatingExpenses, b.operatingExpenses),
    cancellations: {
      count: a.cancellations.count + b.cancellations.count,
      gross: add(a.cancellations.gross, b.cancellations.gross),
      refund: add(a.cancellations.refund, b.cancellations.refund),
      retained: add(a.cancellations.retained, b.cancellations.retained),
    },
  };
}

const addCash = (a: CashFlow, b: CashFlow): CashFlow => ({
  received: add(a.received, b.received),
  paidExpenses: add(a.paidExpenses, b.paidExpenses),
  netCashFlow: add(a.netCashFlow, b.netCashFlow),
});

function compute(input: OverviewInput, s: Scope) {
  const calcs = calculateReservations(input.reservations, input.commissionRules, DEFAULT_POLICIES).results;
  return { accruals: calculateAccruals(calcs, input.expenses, s), cash: calculateCashFlow(input.payments, input.expenses, s) };
}

function shuffle<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  let x = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 48271) % 2147483647;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe("aggregate invariants", () => {
  it("adjacent periods add up to the whole period", () => {
    fc.assert(
      fc.property(overviewInput, splitPeriod, (input, p) => {
        const s = (from: number, to: number) => scope({ period: period(fromEpochDay(from), fromEpochDay(to)) });
        const whole = compute(input, s(p.from, p.to));
        const left = compute(input, s(p.from, p.mid));
        const right = compute(input, s(p.mid + 1, p.to));
        expect(addAccruals(left.accruals, right.accruals)).toEqual(whole.accruals);
        expect(addCash(left.cash, right.cash)).toEqual(whole.cash);
        const { OTA, Direct } = whole.accruals.otaFeeByChannel;
        expect(add(OTA, Direct)).toEqual(whole.accruals.otaFee);
      }),
      runs,
    );
  });

  it("properties add up to the portfolio; clean + review = all; order does not matter", () => {
    fc.assert(
      fc.property(overviewInput, fc.integer({ min: 1, max: 1000 }), (input, seed) => {
        deepFreeze(input);
        const s = scope({ period: period(fromEpochDay(20666), fromEpochDay(20666 + 120)), today: fromEpochDay(20700) });
        const o = calculateOverview(input, s, DEFAULT_POLICIES);
        expect(o.failures).toEqual([]);

        const zero = calculateAccruals([], [], s);
        const byProperty = o.properties.reduce((a, p) => addAccruals(a, p.accruals), zero);
        expect(byProperty).toEqual(o.portfolio.accruals);
        expect(sum(o.properties.map((p) => p.reconciliation.expected), "IDR")).toEqual(o.portfolio.reconciliation.expected);
        expect(sum(o.properties.map((p) => p.cashFlow.received), "IDR")).toEqual(o.portfolio.cashFlow.received);

        const only = (status: "clean" | "review"): OverviewInput => ({
          ...input,
          reservations: input.reservations.filter((r) => r.dqStatus === status),
          payments: input.payments.filter((r) => r.dqStatus === status),
          expenses: input.expenses.filter((r) => r.dqStatus === status),
        });
        const clean = calculateOverview(only("clean"), s, DEFAULT_POLICIES).portfolio;
        const review = calculateOverview(only("review"), s, DEFAULT_POLICIES).portfolio;
        expect(addAccruals(clean.accruals, review.accruals)).toEqual(o.portfolio.accruals);
        expect(calculateOverview(input, { ...s, includeReview: false }, DEFAULT_POLICIES).portfolio.accruals).toEqual(
          clean.accruals,
        );

        const shuffled: OverviewInput = {
          reservations: shuffle(input.reservations, seed),
          commissionRules: shuffle(input.commissionRules, seed + 1),
          payments: shuffle(input.payments, seed + 2),
          expenses: shuffle(input.expenses, seed + 3),
        };
        expect(calculateOverview(shuffled, s, DEFAULT_POLICIES)).toEqual(o);
      }),
      runs,
    );
  });

  it("no amount disappears: Σ input GBV = Σ calculated + Σ failures", () => {
    fc.assert(
      fc.property(overviewInput, (input) => {
        // drop some rules so that part of the batch fails
        const rules = input.commissionRules.slice(1);
        const { results, failures } = calculateReservations(input.reservations, rules, DEFAULT_POLICIES);
        const calculated: Money[] = results.map((c) => c.cancelled?.gross ?? c.gross);
        expect(results.length + failures.length).toBe(input.reservations.length);
        expect(add(sum(calculated, "IDR"), sum(failures.map((f) => f.amount), "IDR"))).toEqual(
          sum(input.reservations.map((r) => r.gross), "IDR"),
        );
        expect(failures.every((f) => f.code === "NO_COMMISSION_RULE")).toBe(true);
      }),
      runs,
    );
  });
});
