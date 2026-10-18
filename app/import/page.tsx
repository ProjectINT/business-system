import type { Metadata } from "next";
import { ImportLogView } from "@/components/imports/import-log-view";
import { IMPORT_BATCHES } from "@/lib/mock/imports";

export const metadata: Metadata = {
  title: "Import — Villa Portfolio",
};

export default function ImportPage() {
  return <ImportLogView batches={IMPORT_BATCHES} />;
}
