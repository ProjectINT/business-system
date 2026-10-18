import { RawDataPanel } from "@/components/dashboard/raw-data-panel";
import { dataSource, rawTablesOf } from "@/lib/data";

export default async function RawDataPage() {
  const snapshot = await dataSource().snapshot();
  return <RawDataPanel tables={rawTablesOf(snapshot)} rules={[...snapshot.rules]} sourceLabel={snapshot.source.label} />;
}
