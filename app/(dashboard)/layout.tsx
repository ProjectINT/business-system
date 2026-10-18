import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { dataSource } from "@/lib/data";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const snapshot = await dataSource().snapshot();
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <DashboardHeader
        summary={{
          properties: snapshot.properties.length,
          clusters: snapshot.clusters.length,
          asOf: snapshot.asOf,
          asOfDefaulted: snapshot.asOfDefaulted,
          range: snapshot.range,
        }}
      />
      {children}
    </div>
  );
}
