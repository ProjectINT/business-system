// Figures of the overview page (PLAN.md 8, page 1) under the filters. Every number comes from
// calculateOverview; this file only picks, pairs and labels. The calculator runs twice — with and
// without records under review — so that next to each total the page shows how much of it is in question.
import {
  calculateBreakdown,
  calculateOverview,
  add,
  inPeriod,
  isZero,
  sub,
  zero,
  type CalcFailure,
  type ExpenseInput,
  type Money,
  type Overview,
  type OwnerBalanceGap,
  type PaymentInput,
  type PropertySummary,
  type ReconciliationLine,
  type ReconciliationStatus,
  type StayPart,
  type Summary,
} from "../calc";
import { calcStatus } from "./admit";
import { BASE_CURRENCY, scopeOf, selectedProperties, type Filters } from "./filters";
import { apartOf, type Apart } from "./money";
import type { DataFailure, RecordInfo, Snapshot } from "./types";

/** The totals a page shows for one summary. */
export interface Headline {
  readonly nights: number;
  // accruals: by nights of stay in the period
  readonly gross: Money;
  readonly refund: Money;
  readonly otaFee: Money;
  // otaFee by the booking's channel: otaFeeOta + otaFeeDirect + otaFeeUnknown = otaFee
  readonly otaFeeOta: Money;
  readonly otaFeeDirect: Money;
  readonly otaFeeUnknown: Money; // no channel (the event feed); shown only when not zero
  readonly pbjt: Money; // PBJT payable, a liability
  readonly netRental: Money;
  readonly managementFee: Money;
  readonly ownerEstimate: Money; // before expenses
  readonly operatingExpenses: Money;
  readonly ownerBalance: Money;
  // cash: by payment and expense date
  readonly received: Money;
  readonly pending: Money; // admitted `pending` payments: not money yet, not in received
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
    otaFeeUnknown: s.accruals.otaFeeByChannel.unknown,
    pbjt: s.accruals.pbjt,
    netRental: s.accruals.netRental,
    managementFee: s.accruals.managementFee,
    ownerEstimate: s.ownerEstimate.amount,
    operatingExpenses: s.accruals.operatingExpenses,
    ownerBalance: s.ownerBalance.amount,
    received: s.cashFlow.received,
    pending: s.cashFlow.pending,
    paidExpenses: s.cashFlow.paidExpenses,
    netCashFlow: s.cashFlow.netCashFlow,
    expected: s.reconciliation.expected,
    reconciledReceived: s.reconciliation.received,
    difference: s.reconciliation.difference,
  };
}

/** a − b, field by field: the part of a total that records under review bring. */
export function headlineDiff<T extends { readonly [K in keyof T]: number | Money }>(a: T, b: T): T {
  const out: Record<string, number | Money> = {};
  for (const key of Object.keys(a) as (keyof T & string)[]) {
    const [x, y] = [a[key], b[key]];
    out[key] = typeof x === "number" ? x - (y as number) : sub(x, y as Money);
  }
  return out as unknown as T;
}

/** The figures of a property row, in the order of the table. */
export interface PropertyFigures {
  readonly nights: number;
  readonly gross: Money;
  readonly pbjt: Money;
  readonly otaFee: Money;
  readonly managementFee: Money;
  readonly ownerEstimate: Money;
  readonly operatingExpenses: Money;
  readonly ownerBalance: Money;
  readonly received: Money;
  readonly difference: Money;
}

/** An expense with the category of its source row. */
export interface ExpenseItem extends ExpenseInput {
  readonly category: string | null;
}

/** The records a row's figures are made of; each list adds up to its figures. */
export interface PropertySources {
  /** Reservations with nights in the period: nights, gross, PBJT, OTA and management fees. */
  readonly stays: readonly StayPart[];
  /** Expenses, paid and pending, by expense date. */
  readonly expenses: readonly ExpenseItem[];
  /** Payments by payment date: cash received. */
  readonly payments: readonly PaymentInput[];
  /** Reservations checking out in the period: the reconciliation difference. */
  readonly reconciliation: readonly ReconciliationLine[];
  /** Refunds of the stays: part of the owner balance without a column of its own. */
  readonly refund: Money;
}

/** Clean records only, whatever the switch: the part under review is kept apart, never added in. */
export interface PropertyRow extends PropertyFigures {
  readonly propertyId: string;
  readonly name: string | null;
  readonly cluster: string | null;
  /** Part of each figure that records under review bring: with them − without them. */
  readonly underReview: PropertyFigures;
  /** Source rows of the villa under review or waiting for a decision, the whole data set. */
  readonly flags: number;
  /** What the figures are made of: the clean records. */
  readonly sources: PropertySources;
  /**
   * What the part under review is made of: the records under review, and the reconciliation lines
   * they change — with them in, `difference` being the change.
   */
  readonly underReviewSources: PropertySources;
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
  /** The portfolio in the shape of a property row, computed from the rows, not by adding up villas; clean records only. */
  readonly totals: Omit<PropertyRow, "propertyId" | "name" | "cluster" | "sources" | "underReviewSources">;
  readonly outside: { readonly groups: readonly OutsideGroup[]; readonly records: readonly RecordInfo[] };
  /** Held and unallocated money, next to cash received and not in it (PLAN.md 7.4); the portfolio only. */
  readonly apart: Apart;
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
 * whose date did not parse cannot be placed and is always shown. An excluded payment whose money is
 * held or unallocated is not here: `apart` shows it next to cash received.
 */
export function outsideOf(snapshot: Snapshot, filters: Filters): Dashboard["outside"] {
  const selected = selectedProperties(filters, snapshot);
  const records = snapshot.records.filter(
    (r) =>
      (r.status === "excluded" || r.status === "duplicate") &&
      (r.money === null || r.money === "excluded" || r.money === "duplicate") &&
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

/** Category of an admitted expense by id and date; of two versions alike in both, the later row's. */
function expenseCategories(snapshot: Snapshot): (e: ExpenseInput) => string | null {
  const admitted = new Set(snapshot.records.filter((r) => calcStatus(r.status) !== null).map((r) => r.unitId));
  const category = new Map<string, string | null>();
  for (const { unitId, values: v } of snapshot.dataset.rows.expense) {
    if (admitted.has(unitId)) category.set(`${v.expense_id}|${v.expense_date}`, v.category);
  }
  return (e) => category.get(`${e.expenseId}|${e.expenseDate}`) ?? null;
}

/**
 * The lines records under review change: each line with them in, `difference` being the change.
 * A reservation under review is new; a clean one changes by its payments under review.
 */
function reconciliationChanges(all: readonly ReconciliationLine[], clean: readonly ReconciliationLine[]): ReconciliationLine[] {
  const before = new Map(clean.map((l) => [l.reservationId, l.difference]));
  return all.flatMap((l) => {
    const was = before.get(l.reservationId);
    before.delete(l.reservationId); // versions of one id: the clean amount is taken away once
    const change = was === undefined ? l.difference : sub(l.difference, was);
    return isZero(change) ? [] : [{ ...l, difference: change }];
  });
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
  const withByProperty = new Map(withReview.properties.map((p) => [p.propertyId, p]));

  // One run with records under review; their dqStatus tells the clean records from the rest.
  const breakdown = calculateBreakdown(snapshot.input, scopeOf(filters, snapshot, true), snapshot.policies);
  const categoryOf = expenseCategories(snapshot);
  const expenseItems: ExpenseItem[] = breakdown.expenses.map((e) => ({ ...e, category: categoryOf(e) }));
  const sourcesOf = (clean: PropertySummary, all: PropertySummary): Pick<PropertyRow, "sources" | "underReviewSources"> => {
    const pick = <T extends { propertyId: string; dqStatus: string }>(list: readonly T[], status: "clean" | "review") =>
      list.filter((x) => x.propertyId === clean.propertyId && x.dqStatus === status);
    return {
      sources: {
        stays: pick(breakdown.stays, "clean"),
        expenses: pick(expenseItems, "clean"),
        payments: pick(breakdown.payments, "clean"),
        reconciliation: clean.reconciliation.lines,
        refund: clean.accruals.refund,
      },
      underReviewSources: {
        stays: pick(breakdown.stays, "review"),
        expenses: pick(expenseItems, "review"),
        payments: pick(breakdown.payments, "review"),
        reconciliation: reconciliationChanges(all.reconciliation.lines, clean.reconciliation.lines),
        refund: sub(all.accruals.refund, clean.accruals.refund),
      },
    };
  };

  const figuresOf = (s: Summary): PropertyFigures => ({
    nights: s.accruals.nights,
    gross: s.accruals.gross,
    pbjt: s.accruals.pbjt,
    otaFee: s.accruals.otaFee,
    managementFee: s.accruals.managementFee,
    ownerEstimate: s.ownerEstimate.amount,
    operatingExpenses: s.accruals.operatingExpenses,
    ownerBalance: s.ownerBalance.amount,
    received: s.cashFlow.received,
    difference: s.reconciliation.difference,
  });
  const rowOf = (clean: Summary, all: Summary, flagCount: number) => {
    const figures = figuresOf(clean);
    return { ...figures, underReview: headlineDiff(figuresOf(all), figures), flags: flagCount };
  };

  // Both runs list the same villas: the calculator picks them before it drops records under review.
  const properties: PropertyRow[] = withoutReview.properties.map((p) => {
    const all = withByProperty.get(p.propertyId)!;
    return {
      propertyId: p.propertyId,
      name: info.get(p.propertyId)?.name ?? null,
      cluster: info.get(p.propertyId)?.cluster ?? null,
      ...rowOf(p, all, flags.get(p.propertyId) ?? 0),
      ...sourcesOf(p, all),
    };
  });

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
      withoutReview.portfolio,
      withReview.portfolio,
      properties.reduce((n, p) => n + p.flags, 0),
    ),
    outside: outsideOf(snapshot, filters),
    apart: apartOf(snapshot, filters),
    failures: {
      calc: overview.failures,
      data: snapshot.failures.filter((f) => inSelection(f.propertyId, selected)),
    },
  };
}
