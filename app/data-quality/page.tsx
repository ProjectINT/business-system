import type { Metadata } from "next";
import { DataQualityView } from "@/components/data-quality/data-quality-view";
import { dataQualityOf } from "@/components/data-quality/view-of";
import { dataSource } from "@/lib/data";

export const metadata: Metadata = {
  title: "Data quality — Villa Portfolio",
};

// No filters: the page shows the whole run, so it renders once, like /raw-data.
export default async function DataQualityPage() {
  const snapshot = await dataSource().snapshot();
  const model = dataQualityOf(snapshot);
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
      <DataQualityView model={model} />
    </div>
  );
}
