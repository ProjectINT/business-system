import { describe, expect, it } from "vitest";
import { buildCases } from "./cases";
import { apart, datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "./testing/fixture";
import { dq01, dq02, dq03 } from "./checks";
import { runOn } from "./testing/run";

const res = (reservation_id: string, check_in: string, check_out: string, extra: Record<string, string> = {}) => ({
  ...RESERVATION,
  reservation_id,
  check_in,
  check_out,
  ...extra,
});

const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002" }],
  reservation: [
    res("R0001", "2026-09-01", "2026-09-05"),
    res("R0002", "2026-09-03", "2026-09-07", { status: "modified" }), // in a group with R0001
    res("R0003", "2026-09-10", "2026-09-12", { status: "modified" }), // alone
    res("R0003", "2026-09-10", "2026-09-12", { status: "modified", gross_booking_value: "5" }), // a second version of it
    res("R0004", "2026-09-10", "2026-09-12", { status: "modified", property_id: "V999" }), // excluded: no case
    res("R0005", "2026-09-20", "2026-09-22", { property_id: "V002" }),
    res("R0006", "2026-09-20", "2026-09-22", { property_id: "V002" }),
    res("R0007", "2026-10-01", "2026-10-04"), // free
    ...apart([{ ...RESERVATION, reservation_id: "R0008", check_in: "2026-11-01" }, { ...RESERVATION, reservation_id: "R0008", check_in: "2026-11-02" }]).map((r, i) => ({
      ...r,
      check_in: `2026-11-0${1 + i}`,
      check_out: `2026-11-1${i}`,
    })), // two versions of R0008 (they overlap each other too, but versions never pair)
  ],
  payment: [PAYMENT, { ...PAYMENT, amount: "1" }], // two versions of P0001
});

describe("buildCases", () => {
  it("builds conflict, modification and version cases from pending rows only, sorted by key", async () => {
    const report = await runOn(ds);
    const cases = buildCases(report);
    expect(cases.map((c) => [c.caseKey, c.type])).toEqual([
      ["M:R0003", "modification"],
      ["V001:R0001,R0002", "conflict"],
      ["V002:R0005,R0006", "conflict"],
      ["V:payment:P0001", "version"],
      ["V:reservation:R0003", "version"],
      ["V:reservation:R0008", "version"],
    ]);
    expect(cases[1]).toEqual({
      caseKey: "V001:R0001,R0002",
      type: "conflict",
      entity: "reservation",
      propertyId: "V001",
      recordKeys: ["R0001", "R0002"],
      unitIds: ["reservations.csv:2", "reservations.csv:3"],
      kinds: ["modified_version"],
      hasModified: true,
    });
    // a second version of a modified reservation shares its modification case and gets a version case too
    expect(cases[0]!.unitIds).toEqual(["reservations.csv:4", "reservations.csv:5"]);
    expect(cases[4]).toMatchObject({ recordKeys: ["R0003"], unitIds: ["reservations.csv:4", "reservations.csv:5"] });
    expect(cases[2]).toMatchObject({ kinds: ["same_dates"], hasModified: false });
    expect(cases[0]).toEqual({
      caseKey: "M:R0003",
      type: "modification",
      entity: "reservation",
      propertyId: "V001",
      recordKeys: ["R0003"],
      unitIds: ["reservations.csv:4", "reservations.csv:5"],
      kinds: [],
      hasModified: true,
    });
    expect(cases[3]).toMatchObject({ entity: "payment", propertyId: null, recordKeys: ["P0001"], unitIds: ["payments.csv:2", "payments.csv:3"] });
    expect(cases[5]).toMatchObject({ recordKeys: ["R0008"], unitIds: ["reservations.csv:10", "reservations.csv:11"] });
  });

  it("works on a report of a partial registry, where DQ-12 and DQ-13 did not run", async () => {
    const report = await runOn(ds, { checks: [dq03, dq01, dq02] });
    expect(buildCases(report).map((c) => c.caseKey)).toEqual(["V:payment:P0001", "V:reservation:R0003", "V:reservation:R0008"]);
  });

  it("gives no cases for a clean run", async () => {
    const report = await runOn(datasetFrom({ property: [PROPERTY], reservation: [RESERVATION], payment: [PAYMENT] }));
    expect(buildCases(report)).toEqual([]);
  });
});
