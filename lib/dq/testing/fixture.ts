// Small datasets for rule tests, built through the real parser so that hashes, unit ids and
// parse issues are the ones production rows have. Values are CSV text; a missing column is "".
import { FIELDS, FILE_NAMES, ENTITIES, parseCsv, type Dataset, type Entity } from "../../ingest";

export type CsvRow = Readonly<Record<string, string>>;

export type Rows = { readonly [E in Entity]?: readonly CsvRow[] };

function quote(cell: string): string {
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function csvText(entity: Entity, rows: readonly CsvRow[]): string {
  const fields = FIELDS[entity];
  const lines = [fields.join(",")];
  for (const row of rows) lines.push(fields.map((f) => quote(row[f] ?? "")).join(","));
  return lines.join("\n") + "\n";
}

/** A dataset with the given rows; entities not mentioned get a header-only file. */
export function datasetFrom(rows: Rows): Dataset {
  const files = {} as { [E in Entity]: Dataset["files"][E] };
  const parsedRows = {} as { [E in Entity]: Dataset["rows"][E] };
  for (const entity of ENTITIES) {
    const parsed = parseCsv(entity, csvText(entity, rows[entity] ?? []), FILE_NAMES[entity]);
    files[entity] = parsed.file;
    (parsedRows as Record<Entity, unknown>)[entity] = parsed.rows;
  }
  return { dir: "<memory>", files, rows: parsedRows };
}

// Rows that parse without issues; override what the test is about.
export const PROPERTY: CsvRow = {
  property_id: "V001",
  property_name: "Villa 01",
  cluster: "Seminyak",
  owner_id: "O001",
  base_currency: "IDR",
};

export const COMMISSION_RULE: CsvRow = {
  property_id: "V001",
  effective_from: "2026-09-01",
  effective_to: "",
  management_fee_rate: "0.15",
  fee_basis: "gross_booking_value",
  note: "",
};

export const RESERVATION: CsvRow = {
  reservation_id: "R0001",
  property_id: "V001",
  check_in: "2026-09-10",
  check_out: "2026-09-13",
  status: "confirmed",
  gross_booking_value: "3000000",
  currency: "IDR",
  ota_fee: "450000",
  refund_amount: "0",
  channel: "OTA",
  updated_at: "2026-09-01",
};

export const PAYMENT: CsvRow = {
  payment_id: "P0001",
  reservation_id: "R0001",
  property_id: "V001",
  payment_date: "2026-09-10",
  amount: "2550000",
  currency: "IDR",
  status: "received",
};

export const EXPENSE: CsvRow = {
  expense_id: "E0001",
  property_id: "V001",
  expense_date: "2026-09-12",
  category: "cleaning",
  amount: "250000",
  currency: "IDR",
  payment_status: "paid",
};
