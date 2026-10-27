import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES } from "../calc";
import { defaultRegistry } from "../dq";
import { COMMISSION_RULE, datasetFrom, EXPENSE, PAYMENT, PROPERTY, RESERVATION } from "../dq/testing/fixture";
import { runOn } from "../dq/testing/run";
import { buildSnapshot } from "./snapshot";
import { snapshotOf } from "./testing/snapshot";

const source = { kind: "csv", label: "<memory>" } as const;

describe("buildSnapshot", () => {
  it("properties: admitted rows only, one per id, sorted; clusters without blanks", async () => {
    const s = await snapshotOf({
      property: [
        { ...PROPERTY, property_id: "V003", cluster: "Ubud" },
        PROPERTY,
        PROPERTY, // exact copy → duplicate
        { ...PROPERTY, property_id: "V002", cluster: "", property_name: "" }, // blank text is null, not an error
        { ...PROPERTY, property_id: "V004", property_name: "Villa 4 v1" },
        { ...PROPERTY, property_id: "V004", property_name: "Villa 4 v2" }, // two versions (DQ-02): both pending, the first is listed
        { ...PROPERTY, property_id: "" }, // no key → excluded
      ],
    });
    expect(s.properties).toEqual([
      { propertyId: "V001", name: "Villa 01", cluster: "Seminyak", status: "clean" },
      { propertyId: "V002", name: null, cluster: null, status: "clean" },
      { propertyId: "V003", name: "Villa 01", cluster: "Ubud", status: "clean" },
      { propertyId: "V004", name: "Villa 4 v1", cluster: "Seminyak", status: "pending" },
    ]);
    expect(s.clusters).toEqual(["Seminyak", "Ubud"]);
  });

  it("records: status, the rules behind it, every failed rule, the amount and the date that place the row", async () => {
    const s = await snapshotOf({
      property: [PROPERTY],
      commission_rule: [COMMISSION_RULE],
      reservation: [RESERVATION, { ...RESERVATION, reservation_id: "R0002", channel: "Direct", check_in: "2026-09-20", check_out: "2026-09-21" }],
      payment: [PAYMENT, { ...PAYMENT, payment_id: "P0002", amount: "lots" }, { ...PAYMENT, payment_id: "P0003", reservation_id: "R0009" }],
      expense: [{ ...EXPENSE, currency: "USD" }],
    });
    const byKey = new Map(s.records.map((r) => [r.recordKey, r]));
    expect(byKey.get("R0001")).toMatchObject({
      unitId: "reservations.csv:2",
      entity: "reservation",
      lineNo: 2,
      propertyId: "V001",
      status: "clean",
      ruleIds: [],
      failed: [],
      amount: { amount: 3000000n, currency: "IDR" },
      date: "2026-09-13", // check-out
    });
    expect(byKey.get("R0002")).toMatchObject({
      status: "clean",
      ruleIds: [], // unpaid at check-in (DQ-16), a marketing fee (DQ-11), confirmed with no payment (DQ-24): information, no status
      failed: [
        { ruleId: "DQ-11", action: "info" },
        { ruleId: "DQ-16", action: "info" },
        { ruleId: "DQ-24", action: "info" },
      ],
    });
    expect(byKey.get("P0001")).toMatchObject({ status: "clean", money: "received" });
    expect(byKey.get("P0002")).toMatchObject({ status: "excluded", ruleIds: ["DQ-03"], amount: null, date: "2026-09-10", money: "excluded" });
    expect(byKey.get("P0003")).toMatchObject({ status: "excluded", failed: [{ ruleId: "DQ-05", action: "exclude" }], money: "unallocated" });
    expect(byKey.get("R0001")!.money).toBeNull(); // the kind of money is a payment's
    expect(byKey.get("E0001")).toMatchObject({ status: "excluded", ruleIds: ["DQ-06"], amount: { amount: 25000000n, currency: "USD" } });
    expect(byKey.get("V001")).toMatchObject({ entity: "property", propertyId: "V001", amount: null, date: null });
    expect(byKey.get("V001@2026-09-01")).toMatchObject({ entity: "commission_rule", propertyId: "V001", amount: null, date: null });
    expect(s.records.map((r) => r.unitId)).toEqual([...s.records.map((r) => r.unitId)].sort());
  });

  it("the data range spans stays, payments and expenses; an empty set has today alone", async () => {
    const s = await snapshotOf({
      reservation: [{ ...RESERVATION, check_in: "2026-08-30" }],
      payment: [{ ...PAYMENT, payment_date: "2026-11-02" }],
      expense: [{ ...EXPENSE, expense_date: "not a date" }],
    });
    expect(s.range).toEqual({ from: "2026-08-30", to: "2026-11-02" });
    expect((await snapshotOf({}, "2026-10-15")).range).toEqual({ from: "2026-10-15", to: "2026-10-15" });
  });

  it("rules of the run in run order, with title, action, area and engine", async () => {
    const s = await snapshotOf({});
    expect(s.rules.map((r) => r.id)).toEqual(defaultRegistry().checks.map((c) => c.id));
    expect(s.rules[0]).toEqual({
      id: "DQ-03",
      title: "Schema and format",
      action: "exclude",
      entities: ["property", "commission_rule", "reservation", "payment", "expense"],
      engine: "ts",
    });
    expect(s.rules.find((r) => r.id === "DQ-12")).toMatchObject({ entities: ["reservation"], engine: "sql" });
    expect(s.rules.at(-1)).toMatchObject({ id: "DQ-90", entities: ["file"] });
  });

  it("refuses a report whose rules or rows it cannot place", async () => {
    const dataset = datasetFrom({ property: [PROPERTY], payment: [{ ...PAYMENT, reservation_id: "R0009" }] });
    const report = await runOn(dataset);
    const parts = { source, dataset, report, checks: defaultRegistry().checks, policies: DEFAULT_POLICIES };
    expect(() => buildSnapshot({ ...parts, checks: [] })).toThrow("DQ-05 ran but is not among the checks");
    expect(() => buildSnapshot({ ...parts, report: { ...report, verdicts: [] } })).toThrow("properties.csv:2 has no verdict");
  });
});
