import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@heroui/react";
import { DataQualityView } from "@/components/data-quality/data-quality-view";
import type { GbvPoint } from "@/components/data-quality/gbv-chart";
import { dataQualityOf } from "@/components/data-quality/view-of";
import { toView } from "@/lib/calc";
import { dashboardOf, dataSource, parseFilters } from "@/lib/data";
import { todayInBali } from "@/lib/today";

export const metadata: Metadata = {
  title: "Data quality — Villa Portfolio",
};

// No filters: the page shows the whole run. It renders per request, since the statuses depend on today.
export default function DataQualityPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] rounded-2xl" />}>
      <DataQuality />
    </Suspense>
  );
}

async function DataQuality() {
  const snapshot = await dataSource().snapshot(await todayInBali());
  const model = dataQualityOf(snapshot);
  // Gross by villa, whole range, every villa: the dashboard's figures without its filters.
  const gbv: GbvPoint[] = dashboardOf(snapshot, parseFilters({}, snapshot).filters).properties.map((p) => ({
    id: p.propertyId,
    name: p.name,
    clean: toView(p.gross),
    underReview: toView(p.underReview.gross),
  }));
  return (
    <>
      <p className="text-sm text-muted">
        Every source row after {model.rules.filter((r) => !r.entities.includes("file")).length} rules and the control totals
      </p>
      <DataQualityView model={model} gbv={gbv} />
    </>
  );
}
