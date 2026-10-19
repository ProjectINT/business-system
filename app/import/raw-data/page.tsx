import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@heroui/react";
import { RawDataPanel } from "@/components/imports/raw-data-panel";
import { dataSource, rawTablesOf } from "@/lib/data";
import { todayInBali } from "@/lib/today";

export const metadata: Metadata = {
  title: "Raw data — Villa Portfolio",
};

// The rows render per request, since their statuses depend on today; the panel reads its villa and
// status filters from the URL in the browser.
export default function RawDataPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] rounded-2xl" />}>
      <RawData />
    </Suspense>
  );
}

async function RawData() {
  const snapshot = await dataSource().snapshot(await todayInBali());
  return <RawDataPanel tables={rawTablesOf(snapshot)} rules={[...snapshot.rules]} sourceLabel={snapshot.source.label} />;
}
