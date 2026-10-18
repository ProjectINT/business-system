import { describe, expect, it } from "vitest";
import { ENTITIES, FILE_NAMES, parseCsv, type Dataset, type Entity } from "../ingest";
import { csvText, PROPERTY } from "../dq/testing/fixture";
import { rawTablesOf } from "./raw";
import { snapshotOfDataset } from "./testing/snapshot";

describe("rawTablesOf", () => {
  it("every row as received under the file's own header, with its status and failed rules", async () => {
    // A reservations file with its own column order, an extra column and no `channel`.
    const reservations = [
      "updated_at,reservation_id,property_id,check_in,check_out,status,gross_booking_value,currency,ota_fee,refund_amount,comment",
      "2026-09-01,R0001,V001,2026-09-10,2026-09-13,confirmed,3000000,IDR,450000,0,vip",
      "2026-09-01,R0002,V001,2026-09-20,2026-09-22,confirmed,1000000,IDR,0,0",
    ].join("\n");
    const texts: Record<Entity, string> = {
      property: csvText("property", [PROPERTY]),
      commission_rule: csvText("commission_rule", []),
      reservation: reservations,
      payment: csvText("payment", []),
      expense: csvText("expense", []),
    };
    const files = {} as Record<Entity, Dataset["files"][Entity]>;
    const rows = {} as Record<Entity, unknown>;
    for (const e of ENTITIES) {
      const parsed = parseCsv(e, texts[e], FILE_NAMES[e]);
      files[e] = parsed.file;
      rows[e] = parsed.rows;
    }
    const snapshot = await snapshotOfDataset({ dir: "<memory>", files, rows: rows as Dataset["rows"] });

    const tables = rawTablesOf(snapshot);
    expect(tables.map((t) => [t.entity, t.fileName, t.rows.length])).toEqual([
      ["property", "properties.csv", 1],
      ["commission_rule", "commission_rules.csv", 0],
      ["reservation", "reservations.csv", 2],
      ["payment", "payments.csv", 0],
      ["expense", "expenses.csv", 0],
    ]);
    const r = tables[2]!;
    expect(r.header.at(0)).toBe("updated_at");
    expect(r.header.at(-1)).toBe("comment");
    expect(r.rows[0]).toEqual({
      unitId: "reservations.csv:2",
      lineNo: 2,
      recordKey: "R0001",
      propertyId: "V001",
      cells: ["2026-09-01", "R0001", "V001", "2026-09-10", "2026-09-13", "confirmed", "3000000", "IDR", "450000", "0", "vip"],
      status: "excluded", // `channel` is missing: DQ-03
      failed: [{ ruleId: "DQ-03", action: "exclude" }],
    });
    expect(r.rows[1]!.cells.at(-1)).toBe(""); // a short row: the cell is blank, not shifted
  });
});
