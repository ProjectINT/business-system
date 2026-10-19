import { Suspense } from "react";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { dataSource } from "@/lib/data";
import { todayInBali } from "@/lib/today";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <Suspense fallback={<DashboardHeader summary={null} />}>
        <Header />
      </Suspense>
      {children}
    </div>
  );
}

async function Header() {
  const snapshot = await dataSource().snapshot(await todayInBali());
  return (
    <DashboardHeader
      summary={{ properties: snapshot.properties.length, clusters: snapshot.clusters.length, range: snapshot.range }}
    />
  );
}
