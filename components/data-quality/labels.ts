// Labels of the data-quality page: files, rule areas, outcomes, overlap kinds.
import type { Entity, Outcome, RowEntity } from "@/lib/dq";
import type { ChipColor } from "@/components/status-meta";

export const FILE_LABEL: Record<RowEntity, string> = {
  property: "Properties",
  commission_rule: "Commission rules",
  reservation: "Reservations",
  payment: "Payments",
  expense: "Expenses",
};

/** Money files first: that is where the checks find most. */
export const FILE_ORDER: readonly RowEntity[] = ["reservation", "payment", "expense", "property", "commission_rule"];

const AREA_LABEL: Record<Entity, string> = {
  property: "properties",
  commission_rule: "commission rules",
  reservation: "reservations",
  payment: "payments",
  expense: "expenses",
  file: "each file",
};

export function areaLabel(entities: readonly Entity[]): string {
  return entities.length === 5 ? "every row" : entities.map((e) => AREA_LABEL[e]).join(", ");
}

export const OUTCOME_META: Record<Outcome, { label: string; color: ChipColor }> = {
  pass: { label: "Pass", color: "success" },
  fail: { label: "Fail", color: "danger" },
  skip: { label: "Skip", color: "default" },
  error: { label: "Error", color: "danger" },
};

export const KIND_LABEL: Record<string, string> = {
  same_dates: "Same dates",
  modified_version: "Modified booking",
  partial: "Partial overlap",
};

export const CASE_TYPE_LABEL: Record<string, string> = {
  conflict: "Overlap group",
  modification: "Modified booking",
  version: "Versions of one id",
};
