import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { IngestError } from "./errors";
import { rowHash } from "./hash";

const HEADER = "payment_id,reservation_id,property_id,payment_date,amount,currency,status";
const ROW = "P0001,R0002,V019,2026-10-19,10011978,IDR,received";

describe("parseCsv", () => {
  it("reads a file with BOM and CRLF, header is line 1", () => {
    const { file, rows } = parseCsv("payment", `﻿${HEADER}\r\n${ROW}\r\n`, "payments.csv");
    expect(file).toMatchObject({
      entity: "payment",
      fileName: "payments.csv",
      header: HEADER.split(","),
      rowCount: 1,
      missingColumns: [],
      extraColumns: [],
      byteSize: Buffer.byteLength(`﻿${HEADER}\r\n${ROW}\r\n`),
    });
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]).toMatchObject({
      unitId: "payments.csv:2",
      entity: "payment",
      fileName: "payments.csv",
      lineNo: 2,
      recordKey: "P0001",
      raw: { payment_id: "P0001", amount: "10011978", status: "received" },
      issues: [],
      values: { payment_id: "P0001", reservation_id: "R0002", payment_date: "2026-10-19", amount: 10011978n, currency: "IDR" },
    });
    expect(rows[0]!.rowHash).toBe(rowHash("payment", rows[0]!.raw));
  });

  it("accepts a Buffer and a string alike", () => {
    const text = `${HEADER}\n${ROW}\n`;
    const a = parseCsv("payment", text, "payments.csv");
    const b = parseCsv("payment", Buffer.from(text, "utf8"), "payments.csv");
    expect(a).toEqual(b);
  });

  it("handles quoted cells: separators, doubled quotes and line breaks; lineNo is where the record starts", () => {
    const src = [
      "expense_id,property_id,expense_date,category,amount,currency,payment_status",
      'E0001,V019,2026-10-11,"Supplies, misc",728127,IDR,paid',
      'E0002,V005,2026-10-30,"Repair ""urgent""\nsecond line",870049,IDR,pending',
      "E0003,V005,2026-10-31,Cleaning,1,IDR,paid",
    ].join("\n");
    const { rows } = parseCsv("expense", src, "expenses.csv");
    expect(rows.map((r) => r.lineNo)).toEqual([2, 3, 5]);
    expect(rows[0]!.values.category).toBe("Supplies, misc");
    expect(rows[1]!.raw.category).toBe('Repair "urgent"\nsecond line');
    expect(rows[2]!.unitId).toBe("expenses.csv:5");
  });

  it("keeps raw as in the file and trims only for parsing", () => {
    const { rows } = parseCsv("payment", `${HEADER}\n P0001 ,R0002,V019,2026-10-19, 10011978 ,IDR,received\n`, "p.csv");
    expect(rows[0]!.raw.payment_id).toBe(" P0001 ");
    expect(rows[0]!.values.payment_id).toBe("P0001");
    expect(rows[0]!.values.amount).toBe(10011978n);
    expect(rows[0]!.recordKey).toBe("P0001");
  });

  it("empty values: required → null with an issue, optional → null without", () => {
    const { rows } = parseCsv(
      "commission_rule",
      "property_id,effective_from,effective_to,management_fee_rate,fee_basis,note\nV001,2026-09-01,,0.17,gross_booking_value,\n,2026-09-01,2026-12-31,,gross_booking_value,x\n",
      "commission_rules.csv",
    );
    expect(rows[0]!.values).toEqual({
      property_id: "V001",
      effective_from: "2026-09-01",
      effective_to: null,
      management_fee_rate: { num: 17n, den: 100n },
      fee_basis: "gross_booking_value",
      note: null,
    });
    expect(rows[0]!.issues).toEqual([]);
    expect(rows[0]!.recordKey).toBe("V001@2026-09-01");

    expect(rows[1]!.values.property_id).toBeNull();
    expect(rows[1]!.values.management_fee_rate).toBeNull();
    expect(rows[1]!.values.note).toBe("x");
    expect(rows[1]!.issues).toEqual([
      { field: "property_id", value: "", message: "empty" },
      { field: "management_fee_rate", value: "", message: expect.stringContaining("rate") },
    ]);
    expect(rows[1]!.recordKey).toBeNull();
  });

  it("a date in the wrong format becomes null with an issue; the row is still loaded", () => {
    const { rows } = parseCsv("payment", `${HEADER}\nP0001,R0002,V019,19.10.2026,10011978,IDR,received\n`, "p.csv");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.values.payment_date).toBeNull();
    expect(rows[0]!.values.amount).toBe(10011978n);
    expect(rows[0]!.issues).toEqual([{ field: "payment_date", value: "19.10.2026", message: "not a calendar date YYYY-MM-DD" }]);
  });

  it("a bad amount, status or channel becomes null with an issue", () => {
    const src =
      "reservation_id,property_id,check_in,check_out,status,gross_booking_value,currency,ota_fee,refund_amount,channel,updated_at\n" +
      "R0001,V013,2026-09-22,2026-09-25,booked,5.285.633,IDR,792845,0,Phone,2026-09-15\n";
    const { rows } = parseCsv("reservation", src, "reservations.csv");
    expect(rows[0]!.values).toMatchObject({ status: null, gross_booking_value: null, channel: null, ota_fee: 792845n, refund_amount: 0n });
    expect(rows[0]!.issues.map((i) => i.field)).toEqual(["status", "gross_booking_value", "channel"]);
  });

  it("missing target columns: reported on the file and as an issue on every row; extra columns kept in raw", () => {
    const { file, rows } = parseCsv(
      "payment",
      "payment_id,reservation_id,property_id,payment_date,amount,exported_at\nP0001,R0002,V019,2026-10-19,10011978,2026-10-18\n",
      "p.csv",
    );
    expect(file.missingColumns).toEqual(["currency", "status"]);
    expect(file.extraColumns).toEqual(["exported_at"]);
    expect(rows[0]!.raw.exported_at).toBe("2026-10-18");
    expect(rows[0]!.values.currency).toBeNull();
    expect(rows[0]!.issues).toEqual([
      { field: "currency", value: null, message: "column missing" },
      { field: "status", value: null, message: "column missing" },
    ]);
  });

  it("a missing key column gives recordKey null", () => {
    const { file, rows } = parseCsv("payment", "reservation_id,property_id,payment_date,amount,currency,status\nR0002,V019,2026-10-19,10011978,IDR,received\n", "p.csv");
    expect(file.missingColumns).toEqual(["payment_id"]);
    expect(rows[0]!.recordKey).toBeNull();
    expect(rows[0]!.values.payment_id).toBeNull();
  });

  it("a header with spaces is trimmed", () => {
    const { file, rows } = parseCsv("payment", `${HEADER.replace("amount", " amount ")}\n${ROW}\n`, "p.csv");
    expect(file.header).toEqual(HEADER.split(","));
    expect(rows[0]!.values.amount).toBe(10011978n);
  });

  it("rowHash is the same for another column order and an extra column", () => {
    const base = parseCsv("payment", `${HEADER}\n${ROW}\n`, "a.csv").rows[0]!;
    const reordered = parseCsv(
      "payment",
      "status,currency,amount,payment_date,property_id,reservation_id,payment_id\nreceived,IDR,10011978,2026-10-19,V019,R0002,P0001\n",
      "b.csv",
    ).rows[0]!;
    const extra = parseCsv("payment", `${HEADER},note\n${ROW},hello\n`, "c.csv").rows[0]!;
    expect(reordered.rowHash).toBe(base.rowHash);
    expect(extra.rowHash).toBe(base.rowHash);
    expect(parseCsv("payment", `${HEADER}\n${ROW.replace("10011978", "10011979")}\n`, "d.csv").rows[0]!.rowHash).not.toBe(base.rowHash);
  });

  it("ragged rows: a short row lacks columns, a long row keeps the header columns; both get a row issue", () => {
    const { rows } = parseCsv("payment", `${HEADER}\nP0001,R0002,V019,2026-10-19\n${ROW},surplus\n`, "p.csv");
    expect(rows[0]!.issues[0]).toEqual({ field: null, value: null, message: "4 cells, header has 7" });
    expect(rows[0]!.issues.map((i) => i.field)).toEqual([null, "amount", "currency", "status"]);
    expect(rows[0]!.raw).not.toHaveProperty("amount");
    expect(rows[1]!.issues).toEqual([{ field: null, value: null, message: "8 cells, header has 7" }]);
    expect(rows[1]!.values.amount).toBe(10011978n);
    expect(Object.keys(rows[1]!.raw)).toHaveLength(7);
  });

  it("skips empty lines without shifting line numbers", () => {
    const { rows } = parseCsv("payment", `${HEADER}\n\n${ROW}\n\n${ROW.replace("P0001", "P0002")}\n`, "p.csv");
    expect(rows.map((r) => r.lineNo)).toEqual([3, 5]);
  });

  it("a header-only file has zero rows", () => {
    const { file, rows } = parseCsv("payment", `${HEADER}\n`, "p.csv");
    expect(rows).toEqual([]);
    expect(file.rowCount).toBe(0);
  });

  it("throws IngestError for an empty file, a duplicate column and malformed CSV", () => {
    expect(() => parseCsv("payment", "", "p.csv")).toThrow(IngestError);
    expect(() => parseCsv("payment", "", "p.csv")).toThrow(expect.objectContaining({ code: "EMPTY_FILE", fileName: "p.csv" }));
    expect(() => parseCsv("payment", `${HEADER},amount\n${ROW},1\n`, "p.csv")).toThrow(
      expect.objectContaining({ code: "DUPLICATE_COLUMN", message: expect.stringContaining('"amount"') }),
    );
    expect(() => parseCsv("payment", `${HEADER}\nP0001,"R0002,V019\n`, "p.csv")).toThrow(expect.objectContaining({ code: "MALFORMED_CSV" }));
  });
});
