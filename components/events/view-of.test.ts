import { describe, expect, it } from "vitest";
import publicCase from "@/final-test/case_public.json";
import demoCase from "@/final-test/variants/all-exceptions.json";
import { toView } from "@/lib/calc";
import { explainCase } from "@/lib/nightly/explain";
import { daysOf, exceptionRowsOf, highlightOf, moneyKindOf, nightKey, nightsOf, percentOfBps } from "./view-of";

const pub = toView(explainCase(publicCase));
const demo = toView(explainCase(demoCase));

describe("dates", () => {
  it("the axis is every day of the report months", () => {
    const days = daysOf(["2026-11", "2026-12"]);
    expect(days).toHaveLength(61);
    expect([days[0], days[29], days[30], days[60]]).toEqual(["2026-11-01", "2026-11-30", "2026-12-01", "2026-12-31"]);
  });

  it("nights exclude check-out; no nights when check-out is not after check-in", () => {
    expect(nightsOf("2026-11-29", "2026-12-03")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(nightsOf("2026-11-20", "2026-11-20")).toEqual([]);
  });

  it("rates in percent", () => {
    expect(percentOfBps(1700)).toBe("17%");
    expect(percentOfBps(1750)).toBe("17.5%");
  });
});

describe("highlightOf", () => {
  it("a management-fee cell lights the nights behind it, not its payments", () => {
    const h = highlightOf(pub, { kind: "cell", property_id: "V01", month: "2026-12", metric: "management_fee_idr" });
    expect([...h.nights]).toEqual([nightKey("R101", "2026-12-01"), nightKey("R101", "2026-12-02")]);
    expect([...h.reservations]).toEqual(["R101"]);
    expect(h.payments.size).toBe(0);
    expect([...h.eventRows]).toEqual([0, 1, 2]);
  });

  it("a cash cell lights its payments and their rows", () => {
    const h = highlightOf(pub, { kind: "cell", property_id: "V02", month: "2026-11", metric: "cash_received_idr" });
    expect([...h.payments]).toEqual(["P202"]);
    expect([...h.paymentRows]).toEqual([2]);
    expect(h.nights.size).toBe(0);
  });

  it("a booking lights its rows, nights and payments", () => {
    const h = highlightOf(pub, { kind: "reservation", id: "R101" });
    expect(h.nights.size).toBe(4);
    expect([...h.payments].sort()).toEqual(["P101", "P303"]);
    expect([...h.paymentRows]).toEqual([0, 1, 3]);
  });

  it("a code lights every record with it", () => {
    const h = highlightOf(demo, { kind: "code", code: "PAYMENT_HELD" });
    expect([...h.payments].sort()).toEqual(["P4040", "P410", "P5050"]);
  });

  it("a flow step lights its rows", () => {
    expect([...highlightOf(pub, { kind: "flow", step: { side: "events", part: "duplicate" } }).eventRows]).toEqual([1]);
    expect([...highlightOf(pub, { kind: "flow", step: { side: "events", part: "held" } }).reservations]).toEqual(["R303"]);
    expect([...highlightOf(pub, { kind: "flow", step: { side: "payments", part: "unmatched" } }).payments]).toEqual(["P404"]);
  });
});

describe("exceptionRowsOf", () => {
  it("the public case: R303 in USD not converted, P303 held, P404 unmatched", () => {
    expect(exceptionRowsOf(pub).map((r) => [r.record_id, r.code, r.kind, r.action, r.money])).toEqual([
      ["R303", "CURRENCY_MISMATCH", "exclude", "exclude", { amount: 10_000, currency: "USD", where: "nowhere" }],
      ["P303", "PENDING_PAYMENT", "wait", "info", { amount: 50_000, currency: "IDR", where: "held" }],
      ["P404", "UNMATCHED_PAYMENT", "exclude", "exclude", { amount: 100_000, currency: "IDR", where: "unmatched" }],
    ]);
  });

  it("the demo case: disputes point to their case; a held payment waits with a booking in dispute", () => {
    const rows = exceptionRowsOf(demo);
    const of = (id: string, code: string) => rows.find((r) => r.record_id === id && r.code === code)!;
    expect(of("R404", "AMBIGUOUS_VERSION")).toMatchObject({ case_key: "version:R404", money: null });
    expect(of("R505", "CONFLICTING_EVENT")).toMatchObject({ case_key: "event:E_R505" });
    expect(of("P909", "CONFLICTING_PAYMENT")).toMatchObject({ case_key: "payment:P909", money: { amount: 550_000, where: "nowhere" } });
    expect(of("P4040", "PAYMENT_HELD").action).toBe("hold");
    expect(of("P410", "PAYMENT_HELD").action).toBe("exclude");
    expect(of("R112", "OUTSIDE_REPORT_MONTHS").money).toEqual({ amount: 1_000_000, currency: "IDR", where: "outside" });
    expect(of("P112", "OUTSIDE_REPORT_MONTHS").money).toEqual({ amount: 2_850_000, currency: "IDR", where: "outside" });
  });

  it("money kinds of payments", () => {
    expect(demo.payments.map(moneyKindOf)).toContain("outside");
  });
});
