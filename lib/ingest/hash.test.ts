import { describe, expect, it } from "vitest";
import { canonicalRow, rowHash, sha256 } from "./hash";

const payment = {
  payment_id: "P0001",
  reservation_id: "R0002",
  property_id: "V019",
  payment_date: "2026-10-19",
  amount: "10011978",
  currency: "IDR",
  status: "received",
};

describe("rowHash", () => {
  it("is a sha256 hex of the canonical target fields", () => {
    expect(rowHash("payment", payment)).toMatch(/^[0-9a-f]{64}$/);
    expect(rowHash("payment", payment)).toBe(sha256(JSON.stringify(canonicalRow("payment", payment))));
  });

  it("ignores column order and extra columns", () => {
    const reordered = { status: "received", currency: "IDR", amount: "10011978", payment_date: "2026-10-19", property_id: "V019", reservation_id: "R0002", payment_id: "P0001" };
    const withExtra = { ...payment, exported_at: "2026-10-18", comment: "x" };
    expect(rowHash("payment", reordered)).toBe(rowHash("payment", payment));
    expect(rowHash("payment", withExtra)).toBe(rowHash("payment", payment));
  });

  it("trims values but keeps them otherwise as text", () => {
    expect(rowHash("payment", { ...payment, amount: " 10011978 " })).toBe(rowHash("payment", payment));
    expect(rowHash("payment", { ...payment, amount: "10011978.00" })).not.toBe(rowHash("payment", payment));
  });

  it("changes with any target value and with a missing column", () => {
    expect(rowHash("payment", { ...payment, status: "pending" })).not.toBe(rowHash("payment", payment));
    const withoutStatus: Record<string, string> = { ...payment };
    delete withoutStatus.status;
    expect(canonicalRow("payment", withoutStatus).status).toBeNull();
    expect(rowHash("payment", withoutStatus)).not.toBe(rowHash("payment", payment));
    expect(rowHash("payment", { ...payment, status: "" })).not.toBe(rowHash("payment", withoutStatus));
  });

  it("depends on the entity: the same cells under another target format hash differently", () => {
    expect(rowHash("expense", payment)).not.toBe(rowHash("payment", payment));
  });
});

describe("sha256", () => {
  it("matches a known digest", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
