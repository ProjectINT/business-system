import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { datasetFrom, PAYMENT, RESERVATION } from "../testing/fixture";
import { contextBefore, resultsOf, runOn } from "../testing/run";
import { dq01 } from "./dq01-exact-duplicate";

const ds = datasetFrom({
  reservation: [
    RESERVATION,
    { ...RESERVATION, reservation_id: "R0002" },
    RESERVATION, // exact copy of line 2
    { ...RESERVATION, reservation_id: "R0002", gross_booking_value: "1" }, // same id, other content: not a duplicate
    RESERVATION, // third copy
  ],
  payment: [PAYMENT, { ...PAYMENT, currency: "USD" }],
});

describeContract(dq01, contextBefore(dq01, ds));

describe("DQ-01", () => {
  it("passes the first copy and marks every later copy a duplicate of it", async () => {
    const report = await runOn(ds, { checks: [dq01] });
    const r0001 = resultsOf(report, "DQ-01").filter((r) => r.recordKey === "R0001");
    expect(r0001.map((r) => [r.unitId, r.outcome])).toEqual([
      ["reservations.csv:2", "pass"],
      ["reservations.csv:4", "fail"],
      ["reservations.csv:6", "fail"],
    ]);
    expect(r0001[1]).toMatchObject({ details: { duplicateOf: "reservations.csv:2", firstLineNo: 2 }, amountIdr: 3000000n });
    expect(report.verdicts.filter((v) => v.recordKey === "R0001").map((v) => v.status)).toEqual(["clean", "duplicate", "duplicate"]);
  });

  it("does not treat the same id with other content, or another currency, as a duplicate", async () => {
    const report = await runOn(ds, { checks: [dq01] });
    expect(resultsOf(report, "DQ-01").filter((r) => r.recordKey === "R0002").map((r) => r.outcome)).toEqual(["pass", "pass"]);
    expect(resultsOf(report, "DQ-01").filter((r) => r.recordKey === "P0001").map((r) => r.outcome)).toEqual(["pass", "pass"]);
  });

  it("skips the amount for a row that is not in IDR", async () => {
    const usd = datasetFrom({ payment: [{ ...PAYMENT, currency: "USD" }, { ...PAYMENT, currency: "USD" }] });
    const report = await runOn(usd, { checks: [dq01] });
    const dup = resultsOf(report, "DQ-01").find((r) => r.outcome === "fail")!;
    expect(dup.amountIdr).toBeUndefined();
  });
});
