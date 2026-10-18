import type { Metadata } from "next";
import { DataQualityView } from "@/components/data-quality/data-quality-view";
import type { GbvPoint } from "@/components/data-quality/gbv-chart";
import { dataQualityOf } from "@/components/data-quality/view-of";
import { toView } from "@/lib/calc";
import { dashboardOf, dataSource, parseFilters } from "@/lib/data";

export const metadata: Metadata = {
  title: "Data quality — Villa Portfolio",
};

// No filters: the page shows the whole run, so it renders once, like /raw-data.
export default async function DataQualityPage() {
  const snapshot = await dataSource().snapshot();
  const model = dataQualityOf(snapshot);
  // Gross by villa, whole range, every villa: the dashboard's figures without its filters.
  const gbv: GbvPoint[] = dashboardOf(snapshot, parseFilters({}, snapshot).filters).properties.map((p) => ({
    id: p.propertyId,
    name: p.name,
    clean: toView(p.gross),
    underReview: toView(p.underReview.gross),
  }));
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Data quality</h1>
        <p className="text-sm text-muted">
          Every source row after {model.rules.filter((r) => !r.entities.includes("file")).length} rules and the control totals ·
          as of {model.asOf}
          {model.asOfDefaulted && " (largest updated_at)"} · CSV · {model.sourceLabel}
        </p>
      </div>
      <DataQualityView model={model} gbv={gbv} />
    </div>
  );
}
