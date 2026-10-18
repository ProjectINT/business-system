import { describe, expect, it } from "vitest";
import { ENTITIES, FIELDS, FILE_NAMES, KEY_COLUMNS, SCHEMAS } from "./entities";

function field(entity: keyof typeof SCHEMAS, name: string) {
  const shape = SCHEMAS[entity].shape as Record<string, { safeParse(v: unknown): { success: boolean; data?: unknown } }>;
  return shape[name]!;
}

describe("codecs", () => {
  it("text: trimmed, empty is an issue", () => {
    expect(field("property", "property_id").safeParse("  V001 ")).toMatchObject({ success: true, data: "V001" });
    expect(field("property", "property_id").safeParse("   ").success).toBe(false);
  });

  it("optional text: empty → null, otherwise trimmed", () => {
    expect(field("commission_rule", "note").safeParse("")).toMatchObject({ success: true, data: null });
    expect(field("commission_rule", "note").safeParse(" x ")).toMatchObject({ success: true, data: "x" });
  });

  it("date: calendar dates only", () => {
    expect(field("reservation", "check_in").safeParse("2026-09-22")).toMatchObject({ success: true, data: "2026-09-22" });
    for (const bad of ["22.09.2026", "2026-9-22", "2026-02-30", "", "2026-09-22T00:00"]) {
      expect(field("reservation", "check_in").safeParse(bad).success, bad).toBe(false);
    }
  });

  it("optional date: empty → null", () => {
    expect(field("commission_rule", "effective_to").safeParse("")).toMatchObject({ success: true, data: null });
    expect(field("commission_rule", "effective_to").safeParse("2026-12-31")).toMatchObject({ success: true, data: "2026-12-31" });
    expect(field("commission_rule", "effective_to").safeParse("soon").success).toBe(false);
  });

  it("amount: whole units as bigint, zero fraction allowed, nothing else", () => {
    const amount = field("reservation", "gross_booking_value");
    expect(amount.safeParse("5285633")).toMatchObject({ success: true, data: 5285633n });
    expect(amount.safeParse(" 10011978.00 ")).toMatchObject({ success: true, data: 10011978n });
    expect(amount.safeParse("-100000")).toMatchObject({ success: true, data: -100000n });
    expect(amount.safeParse("0")).toMatchObject({ success: true, data: 0n });
    for (const bad of ["0.5", "1e6", "1,000", "", "Rp 5", "١٢"]) {
      expect(amount.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("rate: lib/calc parseRate", () => {
    expect(field("commission_rule", "management_fee_rate").safeParse("0.17")).toMatchObject({
      success: true,
      data: { num: 17n, den: 100n },
    });
    expect(field("commission_rule", "management_fee_rate").safeParse("17%").success).toBe(false);
  });

  it("choice: trimmed, exact set", () => {
    expect(field("reservation", "status").safeParse(" modified ")).toMatchObject({ success: true, data: "modified" });
    expect(field("reservation", "status").safeParse("Confirmed").success).toBe(false);
    expect(field("reservation", "channel").safeParse("Direct").success).toBe(true);
    expect(field("expense", "payment_status").safeParse("paid").success).toBe(true);
    expect(field("commission_rule", "fee_basis").safeParse("net").success).toBe(false);
  });
});

describe("target format", () => {
  it("fields follow the schema key order and start with the key columns", () => {
    for (const e of ENTITIES) {
      expect(FIELDS[e]).toEqual(Object.keys(SCHEMAS[e].shape));
      for (const k of KEY_COLUMNS[e]) expect(FIELDS[e]).toContain(k);
      expect(FILE_NAMES[e]).toMatch(/\.csv$/);
    }
  });

  it("matches the headers of the sample files", () => {
    expect(FIELDS.reservation).toEqual([
      "reservation_id", "property_id", "check_in", "check_out", "status", "gross_booking_value",
      "currency", "ota_fee", "refund_amount", "channel", "updated_at",
    ]);
    expect(FIELDS.payment).toEqual(["payment_id", "reservation_id", "property_id", "payment_date", "amount", "currency", "status"]);
    expect(FIELDS.expense).toEqual(["expense_id", "property_id", "expense_date", "category", "amount", "currency", "payment_status"]);
    expect(FIELDS.commission_rule).toEqual(["property_id", "effective_from", "effective_to", "management_fee_rate", "fee_basis", "note"]);
    expect(FIELDS.property).toEqual(["property_id", "property_name", "cluster", "owner_id", "base_currency"]);
  });
});
