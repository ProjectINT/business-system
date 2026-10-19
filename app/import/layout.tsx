import { Suspense } from "react";
import { RouteTabs } from "@/components/shell/route-tabs";
import { dataSource } from "@/lib/data";
import { todayInBali } from "@/lib/today";

// Everything about how the data came in: batches, rows as received, the checks and the payment
// reconciliation. The dashboard (`/`) only shows figures on the data that passed.
const TABS = [
  { href: "/import", label: "Batches" },
  { href: "/import/raw-data", label: "Raw data" },
  { href: "/import/data-quality", label: "Data quality" },
  { href: "/import/reconciliation", label: "Reconciliation" },
] as const;

const LEAD = "How the data came in and what the checks found · CSV";

export default function ImportLayout({ children }: LayoutProps<"/import">) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
          <p className="text-sm text-muted">
            <Suspense fallback={LEAD}>
              <Lead />
            </Suspense>
          </p>
        </div>
        <RouteTabs tabs={TABS} label="Import sections" />
      </div>
      {children}
    </div>
  );
}

async function Lead() {
  const snapshot = await dataSource().snapshot(await todayInBali());
  return `${LEAD} · ${snapshot.source.label}`;
}
