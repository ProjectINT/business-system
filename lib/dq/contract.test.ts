import { describe, expect, it } from "vitest";
import { contractViolations, sortResults } from "./contract";
import { NO_DECISIONS } from "./runner";
import { datasetSource } from "./sources/dataset";
import { describeContract } from "./testing/contract";
import { datasetFrom, RESERVATION } from "./testing/fixture";
import { failAlways, passAlways } from "./testing/stubs";
import type { CheckContext, CheckResult, RowUnit } from "./types";
import { DEFAULT_POLICIES } from "../calc";

const source = datasetSource(
  datasetFrom({
    reservation: [
      RESERVATION,
      { ...RESERVATION, reservation_id: "R0002" },
      { ...RESERVATION, reservation_id: "" }, // no key: recordKey null
    ],
  }),
);

function context(): CheckContext {
  return {
    batchId: source.batchId,
    today: "2026-10-15",
    units: (e) => source.units(e),
    statusSoFar: () => "clean",
    decisions: NO_DECISIONS,
    policies: DEFAULT_POLICIES,
  };
}

const area = source.units("reservation");
const ok = (u: RowUnit, outcome: CheckResult["outcome"] = "pass"): CheckResult => ({
  unitId: u.unitId,
  recordKey: u.recordKey,
  outcome,
});

// The two stub rules the contract test must accept (ROADMAP.md, phase 2).
describeContract(passAlways(), context);
describeContract(failAlways(), context);
describeContract(passAlways({ entity: "file" }), context);

describe("contractViolations", () => {
  it("accepts one result per unit with the unit's own key, including a null key", () => {
    expect(contractViolations(area, area.map((u) => ok(u)))).toEqual([]);
    expect(area.some((u) => u.recordKey === null)).toBe(true);
  });

  it("catches a unit without a result", () => {
    const results = area.slice(1).map((u) => ok(u));
    expect(contractViolations(area, results)).toEqual([`no result for ${area[0]!.unitId}`]);
  });

  it("catches a skip without a reason, and accepts one with", () => {
    const [a, ...rest] = area;
    const skipped = { ...ok(a!), outcome: "skip" as const };
    expect(contractViolations(area, [skipped, ...rest.map((u) => ok(u))])).toEqual([
      `skip without a reason: ${a!.unitId}`,
    ]);
    expect(contractViolations(area, [{ ...skipped, reason: "" }, ...rest.map((u) => ok(u))])).toEqual([
      `skip without a reason: ${a!.unitId}`,
    ]);
    expect(contractViolations(area, [{ ...skipped, reason: "cancelled" }, ...rest.map((u) => ok(u))])).toEqual([]);
  });

  it("catches a result outside the area", () => {
    const results = [...area.map((u) => ok(u)), { unitId: "payments.csv:2", recordKey: "P0001", outcome: "pass" as const }];
    expect(contractViolations(area, results)).toEqual(["result for a unit outside the area: payments.csv:2"]);
  });

  it("catches two results for one unit", () => {
    const results = [...area.map((u) => ok(u)), ok(area[1]!)];
    expect(contractViolations(area, results)).toEqual([`more than one result for ${area[1]!.unitId}`]);
  });

  it("catches a record key that is not the unit's", () => {
    const results = area.map((u) => (u.recordKey === "R0002" ? { ...ok(u), recordKey: "R0001" } : ok(u)));
    expect(contractViolations(area, results)).toEqual([
      `record key R0001 differs from the unit's R0002: ${area[1]!.unitId}`,
    ]);
  });

  it("catches the outcome 'error', which only the runner may write", () => {
    const results = area.map((u, i) => (i === 0 ? ok(u, "error") : ok(u)));
    expect(contractViolations(area, results)).toEqual([`outcome error is reserved for the runner: ${area[0]!.unitId}`]);
  });

  it("reports every violation, in order", () => {
    const results = [{ unitId: "x", recordKey: null, outcome: "skip" as const }];
    expect(contractViolations(area, results)).toEqual([
      "result for a unit outside the area: x",
      ...area.map((u) => `no result for ${u.unitId}`),
    ]);
  });
});

describe("sortResults", () => {
  it("orders by unitId byte-wise and leaves the input alone", () => {
    const input = [ok(area[2]!), ok(area[0]!), ok(area[1]!)];
    const sorted = sortResults(input);
    expect(sorted.map((r) => r.unitId)).toEqual(["reservations.csv:2", "reservations.csv:3", "reservations.csv:4"]);
    expect(input.map((r) => r.unitId)).toEqual(["reservations.csv:4", "reservations.csv:2", "reservations.csv:3"]);
    expect(sortResults([ok(area[0]!), ok(area[0]!)])).toHaveLength(2);
  });
});
