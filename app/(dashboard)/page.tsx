import { Suspense } from "react";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { KpiBlocks } from "@/components/dashboard/kpi-blocks";
import { Notices } from "@/components/dashboard/notices";
import { noticesOf } from "@/components/dashboard/notices-of";
import { OutsideFigures } from "@/components/dashboard/outside-figures";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { PropertyTable } from "@/components/dashboard/property-table";
import { toView } from "@/lib/calc";
import { dashboardOf, dataSource, filterOptionsOf, parseFilters, searchOf } from "@/lib/data";

// Filters come from the URL, so the figures render per request behind a Suspense boundary;
// loading and the checks run once per process (lib/data/csv-source.ts).
export default function OverviewPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const snapshot = await dataSource().snapshot();
  const { filters, warnings } = parseFilters(await searchParams, snapshot);
  const d = dashboardOf(snapshot, filters);
  const query = searchOf(filters, snapshot.range);
  const state = {
    from: filters.from,
    to: filters.to,
    propertyIds: filters.propertyIds,
    cluster: filters.cluster,
    includeReview: filters.includeReview,
  };

  return (
    <>
      <FilterBar state={state} options={filterOptionsOf(snapshot)} />
      <Notices items={noticesOf(snapshot, warnings, d.failures)} />
      <KpiBlocks
        headline={toView(d.headline)}
        underReview={toView(d.underReview)}
        includeReview={filters.includeReview}
        byStatus={d.byStatus}
        cancellations={toView(d.cancellations)}
        ownerBalanceGaps={[...d.ownerBalanceGaps]}
        reconciliationHref={`/import/reconciliation${query}`}
      />
      <OutsideFigures
        groups={toView(d.outside.groups)}
        keys={d.outside.records.map((r) => r.recordKey ?? r.unitId)}
      />
      <PropertyTable rows={toView(d.properties)} totals={toView(d.totals)} />
    </>
  );
}
