import { RawDataPanel } from "@/components/dashboard/raw-data-panel";
import { RAW_ENTITIES } from "@/lib/mock/raw-data";

export default function RawDataPage() {
  return <RawDataPanel entities={RAW_ENTITIES} />;
}
