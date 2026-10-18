import { AccruedVsReceivedChart } from "@/components/dashboard/accrued-vs-received-chart";
import { DataQualityCard } from "@/components/dashboard/data-quality-card";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { PropertyTable } from "@/components/dashboard/property-table";
import { ACCRUED_VS_RECEIVED, KPIS, PROPERTY_AGGREGATES } from "@/lib/mock/dashboard";

export default function OverviewPage() {
  return (
    <>
      <KpiCards items={KPIS} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AccruedVsReceivedChart data={ACCRUED_VS_RECEIVED} />
        </div>
        <DataQualityCard />
      </div>
      <PropertyTable rows={PROPERTY_AGGREGATES} />
    </>
  );
}
