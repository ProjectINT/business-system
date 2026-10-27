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
import { todayInBali } from "@/lib/today";

export const metadata: Metadata = {
  title: "Reconciliation — Villa Portfolio",
};

function amountText(m: Money | null): string | null {
  if (m === null) return null;
  return m.currency === "IDR" ? idrFull(m.amount) : `${m.currency} ${toDecimalString(m)}`;
}

export default function ReconciliationPage({ searchParams }: PageProps<"/import/reconciliation">) {
  return (
    <>
      <p className="text-sm text-muted">
        Expected payout (gross + PBJT − OTA fee − refund) against payments received, per reservation · amounts in IDR
      </p>
      <Suspense fallback={<PageSkeleton />}>
        <Reconciliation searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Reconciliation({ searchParams }: Pick<PageProps<"/import/reconciliation">, "searchParams">) {
  const snapshot = await dataSource().snapshot(await todayInBali());
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
          held: r.apart.heldAmount,
          unallocated: r.apart.unallocatedAmount,
        })}
        rows={toView(r.rows)}
        held={r.apart.held.map((u) => ({ ...u, ruleIds: [...u.ruleIds], amount: amountText(u.amount) }))}
        unallocated={r.apart.unallocated.map((u) => ({ ...u, ruleIds: [...u.ruleIds], amount: amountText(u.amount) }))}
        includeReview={filters.includeReview}
        rules={[...snapshot.rules]}
      />
    </>
  );
}
