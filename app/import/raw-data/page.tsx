import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@heroui/react";
import { RawDataPanel } from "@/components/imports/raw-data-panel";
import { dataSource, rawTablesOf } from "@/lib/data";

export const metadata: Metadata = {
  title: "Raw data — Villa Portfolio",
};

// The rows render once; the panel reads its villa and status filters from the URL in the browser.
export default async function RawDataPage() {
  const snapshot = await dataSource().snapshot();
  return (
    <Suspense fallback={<Skeleton className="h-[600px] rounded-2xl" />}>
      <RawDataPanel tables={rawTablesOf(snapshot)} rules={[...snapshot.rules]} sourceLabel={snapshot.source.label} />
    </Suspense>
  );
}
