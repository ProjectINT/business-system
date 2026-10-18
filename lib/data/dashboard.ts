// Figures of the overview page (PLAN.md 8, page 1) under the filters. Every number comes from
// calculateOverview; this file only picks, pairs and labels. The calculator runs twice — with and
// without records under review — so that next to each total the page shows how much of it is in question.
import {
  calculateOverview,
  add,
  inPeriod,
  sub,
  zero,
  type CalcFailure,
  type Money,
  type Overview,
  type OwnerBalanceGap,
  type ReconciliationStatus,
  type Summary,
} from "../calc";
import { BASE_CURRENCY, scopeOf, selectedProperties, type Filters } from "./filters";
import type { DataFailure, RecordInfo, Snapshot } from "./types";

/** The totals a page shows for one summary. */
export interface Headline {
  readonly nights: number;
  // accruals: by nights of stay in the period
  readonly gross: Money;
  readonly refund: Money;
  readonly otaFee: Money;
  // otaFee by the booking's channel: otaFeeOta + otaFeeDirect = otaFee
  readonly otaFeeOta: Money;
  readonly otaFeeDirect: Money;
  readonly netRental: Money;
  readonly managementFee: Money;
  readonly operatingExpenses: Money;
  readonly ownerBalance: Money;
  // cash: by payment and expense date
  readonly received: Money;
  readonly paidExpenses: Money;
  readonly netCashFlow: Money;
  // reconciliation: reservations with check-out in the period
  readonly expected: Money;
  readonly reconciledReceived: Money;
  readonly difference: Money;
}

export function headlineOf(s: Summary): Headline {
  return {
    nights: s.accruals.nights,
    gross: s.accruals.gross,
    refund: s.accruals.refund,
    otaFee: s.accruals.otaFee,
    otaFeeOta: s.accruals.otaFeeByChannel.OTA,
    otaFeeDirect: s.accruals.otaFeeByChannel.Direct,
    netRental: s.accruals.netRental,
    managementFee: s.accruals.managementFee,
    operatingExpenses: s.accruals.operatingExpenses,
    ownerBalance: s.ownerBalance.amount,
    received: s.cashFlow.received,
    paidExpenses: s.cashFlow.paidExpenses,
    netCashFlow: s.cashFlow.netCashFlow,
    expected: s.reconciliation.expected,
    reconciledReceived: s.reconciliation.received,
    difference: s.reconciliation.difference,
  };
}

/** a − b, field by field: the part of a total that records under review bring. */
export function headlineDiff(a: Headline, b: Headline): Headline {
  const out: Record<string, number | Money> = {};
  for (const key of Object.keys(a) as (keyof Headline)[]) {
    const [x, y] = [a[key], b[key]];
    out[key] = typeof x === "number" ? x - (y as number) : sub(x, y as Money);
  }
  return out as unknown as Headline;
}

export interface PropertyRow {
  readonly propertyId: string;
  readonly name: string | null;
  readonly cluster: string | null;
  readonly nights: number;
  readonly gross: Money;
  /** Part of the gross of records under review: with them − without them, whatever the switch. */
  readonly grossUnderReview: Money;
  readonly otaFee: Money;
  readonly managementFee: Money;
  readonly operatingExpenses: Money;
  readonly ownerBalance: Money;
  readonly received: Money;
  readonly difference: Money;
  /** Source rows of the villa under review or waiting for a decision, the whole data set. */
  readonly flags: number;
}

type OutsideEntity = "reservation" | "payment" | "expense";

/** Rows the checks kept out of the figures, grouped by file and status. */
export interface OutsideGroup {
  readonly entity: OutsideEntity;
  readonly status: "excluded" | "duplicate";
  readonly count: number;
  /** Sum of the rows in the base currency. */
  readonly amount: Money;
  /** Rows not in the base currency (R0061 in USD): counted, not summed. */
  readonly otherCurrency: number;
}

export interface Dashboard {
  readonly filters: Filters;
  readonly overview: Overview;
  readonly headline: Headline;
  readonly underReview: Headline;
  readonly byStatus: Readonly<Record<ReconciliationStatus, number>>;
  readonly cancellations: Overview["portfolio"]["accruals"]["cancellations"];
  readonly ownerBalanceGaps: readonly OwnerBalanceGap[];
  readonly properties: readonly PropertyRow[];
  /** The portfolio in the shape of a property row, computed from the rows, not by adding up villas. */
  readonly totals: Omit<PropertyRow, "propertyId" | "name" | "cluster">;
  readonly outside: { readonly groups: readonly OutsideGroup[]; readonly records: readonly RecordInfo[] };
  readonly failures: { readonly calc: readonly CalcFailure[]; readonly data: readonly DataFailure[] };
}

export function overviewOf(snapshot: Snapshot, filters: Filters, includeReview: boolean): Overview {
  return calculateOverview(snapshot.input, scopeOf(filters, snapshot, includeReview), snapshot.policies);
}

function inSelection(propertyId: string | null, selected: ReadonlySet<string> | "all"): boolean {
  return selected === "all" || (propertyId !== null && selected.has(propertyId));
}

/**
 * Excluded and duplicate rows of the scope. Property: any villa when all are selected (V999 too),
 * else the selected ones. Period: by the row's date — check-out, payment or expense date; a row
 * whose date did not parse cannot be placed and is always shown.
 */
export function outsideOf(snapshot: Snapshot, filters: Filters): Dashboard["outside"] {
  const selected = selectedProperties(filters, snapshot);
  const records = snapshot.records.filter(
    (r) =>
      (r.status === "excluded" || r.status === "duplicate") &&
      r.entity !== "property" &&
      r.entity !== "commission_rule" &&
      inSelection(r.propertyId, selected) &&
      (r.date === null || inPeriod(filters.period, r.date)),
  );
  const groups: OutsideGroup[] = [];
  for (const entity of ["reservation", "payment", "expense"] as const) {
    for (const status of ["excluded", "duplicate"] as const) {
      const rows = records.filter((r) => r.entity === entity && r.status === status);
      if (rows.length === 0) continue;
      let amount = zero(BASE_CURRENCY);
      let otherCurrency = 0;
      for (const r of rows) {
        if (r.amount !== null && r.amount.currency === BASE_CURRENCY) amount = add(amount, r.amount);
        else otherCurrency += 1;
      }
      groups.push({ entity, status, count: rows.length, amount, otherCurrency });
    }
  }
  return { groups, records };
}

export function dashboardOf(snapshot: Snapshot, filters: Filters): Dashboard {
  const withReview = overviewOf(snapshot, filters, true);
  const withoutReview = overviewOf(snapshot, filters, false);
  const overview = filters.includeReview ? withReview : withoutReview;

  const info = new Map(snapshot.properties.map((p) => [p.propertyId, p]));
  const flags = new Map<string, number>();
  for (const r of snapshot.records) {
    if (r.propertyId !== null && (r.status === "review" || r.status === "pending")) {
      flags.set(r.propertyId, (flags.get(r.propertyId) ?? 0) + 1);
    }
  }
  const grossWithout = new Map(withoutReview.properties.map((p) => [p.propertyId, p.accruals.gross]));
  const grossWith = new Map(withReview.properties.map((p) => [p.propertyId, p.accruals.gross]));
  const underReviewGross = (id: string) => sub(grossWith.get(id)!, grossWithout.get(id)!);

  const rowOf = (s: Summary, grossUnderReview: Money, flagCount: number) => ({
    nights: s.accruals.nights,
    gross: s.accruals.gross,
    grossUnderReview,
    otaFee: s.accruals.otaFee,
    managementFee: s.accruals.managementFee,
    operatingExpenses: s.accruals.operatingExpenses,
    ownerBalance: s.ownerBalance.amount,
    received: s.cashFlow.received,
    difference: s.reconciliation.difference,
    flags: flagCount,
  });

  const properties: PropertyRow[] = overview.properties.map((p) => ({
    propertyId: p.propertyId,
    name: info.get(p.propertyId)?.name ?? null,
    cluster: info.get(p.propertyId)?.cluster ?? null,
    ...rowOf(p, underReviewGross(p.propertyId), flags.get(p.propertyId) ?? 0),
  }));

  const headline = headlineOf(overview.portfolio);
  const underReview = headlineDiff(headlineOf(withReview.portfolio), headlineOf(withoutReview.portfolio));
  const selected = selectedProperties(filters, snapshot);

  return {
    filters,
    overview,
    headline,
    underReview,
    byStatus: overview.portfolio.reconciliation.byStatus,
    cancellations: overview.portfolio.accruals.cancellations,
    ownerBalanceGaps: overview.portfolio.ownerBalance.missing,
    properties,
    totals: rowOf(
      overview.portfolio,
      underReview.gross,
      properties.reduce((n, p) => n + p.flags, 0),
    ),
    outside: outsideOf(snapshot, filters),
    failures: {
      calc: overview.failures,
      data: snapshot.failures.filter((f) => inSelection(f.propertyId, selected)),
    },
  };
}
