import { Suspense } from "react";
import { DataQualityCard } from "@/components/dashboard/data-quality-card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { GbvChart } from "@/components/dashboard/gbv-chart";
import { KpiBlocks } from "@/components/dashboard/kpi-blocks";
import { Notices } from "@/components/dashboard/notices";
import { noticesOf } from "@/components/dashboard/notices-of";
import { OutsideFigures } from "@/components/dashboard/outside-figures";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { PropertyTable } from "@/components/dashboard/property-table";
import { toView } from "@/lib/calc";
import { dashboardOf, dataSource, filterOptionsOf, parseFilters, qualityOf, searchOf } from "@/lib/data";

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
  const quality = qualityOf(snapshot);
  const query = searchOf(filters, snapshot.range);
  const state = {
    from: filters.from,
    to: filters.to,
    propertyIds: filters.propertyIds,
    cluster: filters.cluster,
    includeReview: filters.includeReview,
  };

  const withReview = filters.includeReview;
  const gbv = d.properties.map((p) => {
    const gross = toView(p.gross);
    const underReview = toView(p.grossUnderReview);
    return { id: p.propertyId, name: p.name, clean: withReview ? gross - underReview : gross, underReview };
  });

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
        reconciliationHref={`/reconciliation${query}`}
      />
      <OutsideFigures
        groups={toView(d.outside.groups)}
        keys={d.outside.records.map((r) => r.recordKey ?? r.unitId)}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <GbvChart data={gbv} includeReview={filters.includeReview} />
        </div>
        <DataQualityCard
          counts={quality.counts}
          files={quality.files.length}
          runStatus={snapshot.report.status}
          sourceLabel={snapshot.source.label}
          cases={quality.caseCount}
          excluded={quality.excluded.length}
          balanced={quality.files.every((f) => f.balanced)}
        />
      </div>
      <PropertyTable rows={toView(d.properties)} totals={toView(d.totals)} />
    </>
  );
}
