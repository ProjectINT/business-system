// Placeholder for the layout stage: real rows sampled from Technical_Challenge_Data.
// Statuses of the known anomalies follow docs/PLAN.md §6; the rest are illustrative.
// Replace with the ingest + DQ engine output.

import type { RecordStatus } from "./dashboard";

export type RawColumn = { key: string; label: string; numeric?: boolean };

export type RawRow = {
  /** Line number in the source file (header = line 1). */
  line: number;
  values: Record<string, string>;
  status: RecordStatus;
  issues: string[];
};

export type RawEntity = {
  id: string;
  label: string;
  file: string;
  totalRows: number;
  columns: RawColumn[];
  rows: RawRow[];
};

function rows(
  columns: RawColumn[],
  data: [line: number, csv: string, status: RecordStatus, issues?: string[]][],
): RawRow[] {
  return data.map(([line, csv, status, issues = []]) => {
    const cells = csv.split(",");
    return {
      line,
      values: Object.fromEntries(columns.map((c, i) => [c.key, cells[i] ?? ""])),
      status,
      issues,
    };
  });
}

const reservationColumns: RawColumn[] = [
  { key: "reservation_id", label: "Reservation" },
  { key: "property_id", label: "Property" },
  { key: "check_in", label: "Check-in" },
  { key: "check_out", label: "Check-out" },
  { key: "status", label: "Status" },
  { key: "gross_booking_value", label: "Gross", numeric: true },
  { key: "currency", label: "Cur." },
  { key: "ota_fee", label: "OTA fee", numeric: true },
  { key: "refund_amount", label: "Refund", numeric: true },
  { key: "channel", label: "Channel" },
  { key: "updated_at", label: "Updated" },
];

const paymentColumns: RawColumn[] = [
  { key: "payment_id", label: "Payment" },
  { key: "reservation_id", label: "Reservation" },
  { key: "property_id", label: "Property" },
  { key: "payment_date", label: "Date" },
  { key: "amount", label: "Amount", numeric: true },
  { key: "currency", label: "Cur." },
  { key: "status", label: "Status" },
];

const expenseColumns: RawColumn[] = [
  { key: "expense_id", label: "Expense" },
  { key: "property_id", label: "Property" },
  { key: "expense_date", label: "Date" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount", numeric: true },
  { key: "currency", label: "Cur." },
  { key: "payment_status", label: "Payment" },
];

const propertyColumns: RawColumn[] = [
  { key: "property_id", label: "Property" },
  { key: "property_name", label: "Name" },
  { key: "cluster", label: "Cluster" },
  { key: "owner_id", label: "Owner" },
  { key: "base_currency", label: "Currency" },
];

const ruleColumns: RawColumn[] = [
  { key: "property_id", label: "Property" },
  { key: "effective_from", label: "From" },
  { key: "effective_to", label: "To" },
  { key: "management_fee_rate", label: "Rate", numeric: true },
  { key: "fee_basis", label: "Basis" },
  { key: "note", label: "Note" },
];

export const RAW_ENTITIES: RawEntity[] = [
  {
    id: "reservations",
    label: "Reservations",
    file: "reservations.csv",
    totalRows: 151,
    columns: reservationColumns,
    rows: rows(reservationColumns, [
      [2, "R0001,V013,2026-09-22,2026-09-25,confirmed,5285633,IDR,792845,0,OTA,2026-09-15", "clean"],
      [3, "R0002,V019,2026-10-15,2026-10-19,confirmed,11778798,IDR,1766820,0,OTA,2026-09-15", "clean"],
      [4, "R0003,V013,2026-10-25,2026-11-01,confirmed,12170856,IDR,1460503,0,OTA,2026-09-15", "review", ["DQ-16"]],
      [5, "R0004,V008,2026-10-13,2026-10-21,confirmed,2807588,IDR,421138,0,OTA,2026-09-15", "review", ["DQ-12"]],
      [6, "R0005,V005,2026-09-10,2026-09-17,confirmed,7849988,IDR,941999,0,Direct,2026-09-15", "review", ["DQ-11", "DQ-16"]],
      [7, "R0006,V009,2026-10-12,2026-10-19,confirmed,12914850,IDR,2195524,0,OTA,2026-09-15", "clean"],
      [8, "R0007,V002,2026-09-08,2026-09-16,confirmed,12360903,IDR,1483308,0,OTA,2026-09-15", "review", ["DQ-16"]],
      [16, "R0015,V003,2026-09-27,2026-09-29,confirmed,13628994,IDR,2316929,0,Direct,2026-09-15", "review", ["DQ-11"]],
      [34, "R0033,V008,2026-09-25,2026-10-02,confirmed,14606373,IDR,1752765,0,OTA,2026-09-15", "review", ["DQ-12"]],
      [35, "R0034,V999,2026-10-09,2026-10-16,confirmed,14462943,IDR,1735553,0,OTA,2026-09-15", "excluded", ["DQ-04"]],
      [57, "R0056,V008,2026-09-25,2026-10-02,confirmed,5624162,IDR,674899,0,OTA,2026-09-15", "review", ["DQ-12"]],
      [62, "R0061,V001,2026-10-16,2026-10-20,confirmed,4280874,USD,642131,0,OTA,2026-09-15", "excluded", ["DQ-06"]],
      [73, "R0072,V020,2026-10-05,2026-10-12,confirmed,7070068,IDR,1201912,7970068,OTA,2026-09-15", "excluded", ["DQ-09"]],
      [103, "R0102,V003,2026-09-10,2026-09-14,confirmed,3898667,IDR,-100000,0,OTA,2026-10-15", "excluded", ["DQ-08"]],
      [147, "R0146,V008,2026-09-19,2026-09-24,modified,2521489,IDR,302579,0,OTA,2026-10-15", "review", ["DQ-12", "DQ-13"]],
      [152, "R0015,V003,2026-09-27,2026-09-29,confirmed,13628994,IDR,2316929,0,Direct,2026-09-15", "duplicate", ["DQ-01"]],
    ]),
  },
  {
    id: "payments",
    label: "Payments",
    file: "payments.csv",
    totalRows: 76,
    columns: paymentColumns,
    rows: rows(paymentColumns, [
      [2, "P0001,R0002,V019,2026-10-19,10011978,IDR,received", "clean"],
      [3, "P0002,R0004,V008,2026-10-16,2386450,IDR,received", "clean"],
      [4, "P0003,R0006,V009,2026-10-22,10719326,IDR,received", "clean"],
      [5, "P0004,R0008,V014,2026-11-01,13048995,IDR,received", "clean"],
      [6, "P0005,R0010,V005,2026-10-17,2473691,IDR,received", "clean"],
      [18, "P0017,R0034,V999,2026-10-20,12727390,IDR,received", "excluded", ["DQ-05"]],
      [37, "P0036,R0072,V020,2026-10-13,0,IDR,received", "excluded", ["DQ-05", "DQ-15"]],
      [52, "P0051,R0102,V003,2026-09-12,3998667,IDR,received", "excluded", ["DQ-05"]],
      [76, "P0075,R0150,V009,2026-09-07,12211055,IDR,received", "clean"],
      [77, "P0075,R0150,V009,2026-09-07,12211055,IDR,received", "duplicate", ["DQ-01"]],
    ]),
  },
  {
    id: "expenses",
    label: "Expenses",
    file: "expenses.csv",
    totalRows: 90,
    columns: expenseColumns,
    rows: rows(expenseColumns, [
      [2, "E0001,V019,2026-10-11,Supplies,728127,IDR,paid", "clean"],
      [3, "E0002,V005,2026-10-30,Electricity,870049,IDR,paid", "clean"],
      [4, "E0003,V020,2026-09-12,Maintenance,544001,IDR,paid", "clean"],
      [5, "E0004,V006,2026-10-03,Maintenance,580499,IDR,paid", "clean"],
      [6, "E0005,V007,2026-09-05,Cleaning,231018,IDR,paid", "clean"],
      [7, "E0006,V009,2026-09-10,Maintenance,545475,IDR,pending", "clean"],
      [8, "E0007,V004,2026-10-12,Electricity,375795,IDR,paid", "clean"],
      [18, "E0017,V777,2026-10-21,Maintenance,834779,IDR,paid", "excluded", ["DQ-04"]],
    ]),
  },
  {
    id: "properties",
    label: "Properties",
    file: "properties.csv",
    totalRows: 20,
    columns: propertyColumns,
    rows: rows(propertyColumns, [
      [2, "V001,Villa 01,Ubud,O001,IDR", "clean"],
      [3, "V002,Villa 02,Canggu,O002,IDR", "clean"],
      [4, "V003,Villa 03,Sanur,O003,IDR", "clean"],
      [5, "V004,Villa 04,Bukit,O004,IDR", "clean"],
      [6, "V005,Villa 05,Ubud,O005,IDR", "clean"],
      [7, "V006,Villa 06,Canggu,O006,IDR", "clean"],
    ]),
  },
  {
    id: "commission_rules",
    label: "Commission rules",
    file: "commission_rules.csv",
    totalRows: 20,
    columns: ruleColumns,
    rows: rows(ruleColumns, [
      [2, "V001,2026-09-01,2026-12-31,0.17,gross_booking_value,OTA fees are separate", "clean"],
      [3, "V002,2026-09-01,2026-12-31,0.17,gross_booking_value,OTA fees are separate", "clean"],
      [4, "V003,2026-09-01,2026-12-31,0.17,gross_booking_value,OTA fees are separate", "clean"],
      [5, "V004,2026-09-01,2026-12-31,0.2,gross_booking_value,OTA fees are separate", "clean"],
      [6, "V005,2026-09-01,2026-12-31,0.17,gross_booking_value,OTA fees are separate", "clean"],
      [9, "V008,2026-09-01,2026-12-31,0.2,gross_booking_value,OTA fees are separate", "clean"],
    ]),
  },
];

/** Short titles for DQ rule codes (full list in docs/PLAN.md §6). */
export const DQ_RULES: Record<string, string> = {
  "DQ-01": "Exact duplicate row",
  "DQ-04": "Unknown property",
  "DQ-05": "Payment for unknown or excluded reservation",
  "DQ-06": "Currency differs from property base currency",
  "DQ-08": "OTA fee < 0 or above gross",
  "DQ-09": "Refund above gross or on a non-cancelled booking",
  "DQ-11": "OTA fee on a direct booking",
  "DQ-12": "Overlapping stay on the same property",
  "DQ-13": "Modified without link to the original",
  "DQ-15": "Zero payment marked as received",
  "DQ-16": "No payment for a completed stay",
};
