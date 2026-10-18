import type { Metadata } from "next";
import { Suspense } from "react";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { Notices } from "@/components/dashboard/notices";
import { noticesOf } from "@/components/dashboard/notices-of";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { ReconciliationView } from "@/components/reconciliation/reconciliation-view";
import { toDecimalString, toView, type Money } from "@/lib/calc";
import { dataSource, filterOptionsOf, parseFilters, reconciliationOf } from "@/lib/data";
import { idrFull } from "@/lib/format";

export const metadata: Metadata = {
  title: "Reconciliation — Villa Portfolio",
};

function amountText(m: Money | null): string | null {
  if (m === null) return null;
  return m.currency === "IDR" ? idrFull(m.amount) : `${m.currency} ${toDecimalString(m)}`;
}

export default function ReconciliationPage({ searchParams }: PageProps<"/reconciliation">) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
        <p className="text-sm text-muted">
          Expected payout (gross − OTA fee − refund) against payments received, per reservation · amounts in IDR
        </p>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Reconciliation searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Reconciliation({ searchParams }: Pick<PageProps<"/reconciliation">, "searchParams">) {
  const snapshot = await dataSource().snapshot();
  const { filters, warnings } = parseFilters(await searchParams, snapshot);
  const r = reconciliationOf(snapshot, filters);
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
      <Notices items={noticesOf(snapshot, warnings, r.failures)} />
      <ReconciliationView
        summary={toView({
          expected: r.expected,
          received: r.received,
          difference: r.difference,
          byStatus: r.byStatus,
          underReview: r.underReview,
          unallocatedAmount: r.unallocatedAmount,
        })}
        rows={toView(r.rows)}
        unallocated={r.unallocated.map((u) => ({ ...u, ruleIds: [...u.ruleIds], amount: amountText(u.amount) }))}
        includeReview={filters.includeReview}
        rules={[...snapshot.rules]}
      />
    </>
  );
}
