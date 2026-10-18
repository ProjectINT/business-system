import { RouteTabs } from "@/components/shell/route-tabs";
import { dataSource } from "@/lib/data";

// Everything about how the data came in: batches, rows as received, the checks and the payment
// reconciliation. The dashboard (`/`) only shows figures on the data that passed.
const TABS = [
  { href: "/import", label: "Batches" },
  { href: "/import/raw-data", label: "Raw data" },
  { href: "/import/data-quality", label: "Data quality" },
  { href: "/import/reconciliation", label: "Reconciliation" },
] as const;

export default async function ImportLayout({ children }: LayoutProps<"/import">) {
  const snapshot = await dataSource().snapshot();
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
          <p className="text-sm text-muted">
            How the data came in and what the checks found · CSV · {snapshot.source.label} · as of {snapshot.asOf}
            {snapshot.asOfDefaulted ? " (latest updated_at)" : ""}
          </p>
        </div>
        <RouteTabs tabs={TABS} label="Import sections" />
      </div>
      {children}
    </div>
  );
}
