// Public API of the data layer (PLAN.md 4.2, 10; ROADMAP.md phase 4). Server only: the CSV source
// reads files. The client imports `@/lib/data/query` alone — the URL format of the filters.
import { csvSource } from "./csv-source";
import type { DataSource } from "./types";

export { admit, calcStatus, toMoney, type Admitted } from "./admit";
export { csvSource } from "./csv-source";
export {
  dashboardOf,
  headlineDiff,
  headlineOf,
  outsideOf,
  overviewOf,
  type Dashboard,
  type ExpenseItem,
  type Headline,
  type OutsideGroup,
  type PropertyFigures,
  type PropertyRow,
  type PropertySources,
} from "./dashboard";
export {
  BASE_CURRENCY,
  TIME_ZONE,
  filterOptionsOf,
  parseFilters,
  periodPresets,
  scopeOf,
  selectedProperties,
  type Filters,
  type ParsedFilters,
  type PeriodPreset,
  type SearchParams,
} from "./filters";
export { PARAM, searchOf, type DateRange, type FilterOptions, type FilterState } from "./query";
export {
  IN_FIGURES,
  qualityOf,
  type AmountTotals,
  type CaseOverlap,
  type CaseRow,
  type CaseView,
  type ExcludedRow,
  type FileTotals,
  type Issue,
  type Quality,
  type RecordCheck,
  type RuleSummary,
  type VillaCases,
} from "./quality";
export { rawTablesOf, type RawRow, type RawTable } from "./raw";
export { reconciliationOf, type ReconciliationRow, type ReconciliationView, type UnallocatedPayment } from "./reconciliation";
export { buildSnapshot, type SnapshotParts } from "./snapshot";
export type * from "./types";

/** The source of this deployment. Level 2 picks Supabase when `DATABASE_URL` is set (phase 7c). */
export function dataSource(): DataSource {
  return csvSource();
}
