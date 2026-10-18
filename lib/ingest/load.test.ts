import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENTITIES, FILE_NAMES } from "./entities";
import { IngestError } from "./errors";
import { DEFAULT_DATA_DIR, loadDataset, loadFile } from "./load";

/** Data lines of a CSV counted independently of csv-parse: non-empty lines minus the header. */
function csvDataLines(path: string): number {
  return readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.length > 0).length - 1;
}

describe("loadDataset on the sample files", () => {
  const ds = loadDataset();

  it("loads all 357 rows, per file as many as the CSV has", () => {
    const expected = { property: 20, commission_rule: 20, reservation: 151, payment: 76, expense: 90 };
    let total = 0;
    for (const e of ENTITIES) {
      const path = join(DEFAULT_DATA_DIR, FILE_NAMES[e]);
      expect(ds.rows[e]).toHaveLength(expected[e]);
      expect(ds.files[e].rowCount).toBe(csvDataLines(path));
      expect(ds.files[e].sha256).toBe(createHash("sha256").update(readFileSync(path)).digest("hex"));
      expect(ds.files[e].missingColumns).toEqual([]);
      expect(ds.files[e].extraColumns).toEqual([]);
      total += ds.rows[e].length;
    }
    expect(total).toBe(357);
  });

  it("the sample data has no format issues: every value parsed", () => {
    for (const e of ENTITIES) {
      expect(ds.rows[e].filter((r) => r.issues.length > 0)).toEqual([]);
      expect(ds.rows[e].every((r) => r.recordKey !== null)).toBe(true);
    }
  });

  it("line numbers are consecutive from 2 and unit ids carry the file name", () => {
    expect(ds.rows.reservation.map((r) => r.lineNo)).toEqual(ds.rows.reservation.map((_, i) => i + 2));
    expect(ds.rows.reservation[0]!.unitId).toBe("reservations.csv:2");
    expect(ds.rows.reservation[0]!.values).toEqual({
      reservation_id: "R0001",
      property_id: "V013",
      check_in: "2026-09-22",
      check_out: "2026-09-25",
      status: "confirmed",
      gross_booking_value: 5285633n,
      currency: "IDR",
      ota_fee: 792845n,
      refund_amount: 0n,
      channel: "OTA",
      updated_at: "2026-09-15",
    });
  });

  it("keeps the known data problems as data, not as load errors", () => {
    const r0015 = ds.rows.reservation.filter((r) => r.recordKey === "R0015");
    expect(r0015).toHaveLength(2);
    expect(r0015[0]!.rowHash).toBe(r0015[1]!.rowHash); // exact duplicate (DQ-01)
    expect(r0015[0]!.unitId).not.toBe(r0015[1]!.unitId);
    expect(ds.rows.reservation.find((r) => r.recordKey === "R0102")!.values.ota_fee).toBe(-100000n); // DQ-08
    expect(ds.rows.reservation.find((r) => r.recordKey === "R0061")!.values.currency).toBe("USD"); // DQ-06
    expect(ds.rows.reservation.find((r) => r.recordKey === "R0034")!.values.property_id).toBe("V999"); // DQ-04
    expect(ds.rows.payment.filter((r) => r.recordKey === "P0075")).toHaveLength(2); // DQ-01
    expect(ds.rows.commission_rule[0]!.recordKey).toBe("V001@2026-09-01");
  });

  it("is deterministic: a second load is deep-equal", () => {
    expect(loadDataset(DEFAULT_DATA_DIR)).toEqual(ds);
  });
});

describe("loadFile", () => {
  it("reads a single file by path", () => {
    const { file, rows } = loadFile("property", join(DEFAULT_DATA_DIR, "properties.csv"));
    expect(file.fileName).toBe("properties.csv");
    expect(rows).toHaveLength(20);
    expect(rows[0]!.values).toEqual({ property_id: "V001", property_name: "Villa 01", cluster: "Ubud", owner_id: "O001", base_currency: "IDR" });
  });

  it("a missing file is FILE_NOT_FOUND; other read errors pass through", () => {
    expect(() => loadFile("property", "no/such/properties.csv")).toThrow(
      expect.objectContaining({ code: "FILE_NOT_FOUND", fileName: "properties.csv" }),
    );
    expect(() => loadFile("property", DEFAULT_DATA_DIR)).toThrow(/EISDIR/);
  });

  it("loadDataset of a directory without one of the files fails naming it", () => {
    const dir = mkdtempSync(join(tmpdir(), "ingest-"));
    for (const e of ENTITIES) {
      if (e === "expense") continue;
      writeFileSync(join(dir, FILE_NAMES[e]), readFileSync(join(DEFAULT_DATA_DIR, FILE_NAMES[e])));
    }
    let error: unknown;
    try {
      loadDataset(dir);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(IngestError);
    expect((error as IngestError).fileName).toBe("expenses.csv");
  });
});
