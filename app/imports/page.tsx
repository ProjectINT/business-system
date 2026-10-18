import type { Metadata } from "next";
import { ImportLogView } from "@/components/imports/import-log-view";
import { IMPORT_BATCHES } from "@/lib/mock/imports";

export const metadata: Metadata = {
  title: "Import data logs — Villa Portfolio",
};

export default function ImportsPage() {
  return <ImportLogView batches={IMPORT_BATCHES} />;
}
