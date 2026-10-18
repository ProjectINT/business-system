import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES } from "../../calc";
import { NO_DECISIONS } from "../runner";
import { datasetSource } from "../sources/dataset";
import { describeContract } from "../testing/contract";
import { apart, datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "../testing/fixture";
import { contextBefore, resultsOf, runOn } from "../testing/run";
import type { CheckContext, FileUnit } from "../types";
import { dq90 } from "./index";

const reservations = apart([RESERVATION, { ...RESERVATION, reservation_id: "R0002", property_id: "V999" }, { ...RESERVATION, reservation_id: "R0003", status: "modified" }]);
const ds = datasetFrom({
  property: [PROPERTY],
  reservation: [...reservations, reservations[0]!], // the last row is an exact copy of the first
  payment: [PAYMENT, { ...PAYMENT, payment_id: "P0002", reservation_id: "R0003" }],
});

describeContract(dq90, contextBefore(dq90, ds));

describe("DQ-90", () => {
  it("passes every file and shows the totals by status, by rows and by amount", async () => {
    const report = await runOn(ds);
    expect(report.status).toBe("succeeded");
    const reservations = resultsOf(report, "DQ-90").find((r) => r.unitId === "reservations.csv")!;
    expect(reservations).toMatchObject({
      outcome: "pass",
      entity: "file",
      recordKey: null,
      details: {
        rowCount: 4,
        rows: 4,
        byStatus: { clean: 0, review: 1, pending: 1, excluded: 1, duplicate: 1, superseded: 0 },
        amountTotal: 12000000n,
        amountByStatus: { clean: 0n, review: 3000000n, pending: 3000000n, excluded: 3000000n, duplicate: 3000000n, superseded: 0n },
      },
    });
    const payments = resultsOf(report, "DQ-90").find((r) => r.unitId === "payments.csv")!;
    expect(payments.details).toMatchObject({ rows: 2, byStatus: { review: 1, pending: 1 }, amountTotal: 5100000n });
    expect(resultsOf(report, "DQ-90").find((r) => r.unitId === "expenses.csv")!.details).toMatchObject({ rows: 0, amountTotal: 0n });
  });

  it("fails a file whose loader row count differs from the rows the run saw, and the run with it", async () => {
    const source = datasetSource(ds);
    const files = source.units("file").map((f): FileUnit => (f.fileEntity === "payment" ? { ...f, rowUnitIds: f.rowUnitIds.slice(1) } : f));
    const ctx: CheckContext = {
      batchId: "csv",
      asOf: "2026-10-15",
      units: (e) => (e === "file" ? files : source.units(e)) as never,
      statusSoFar: () => "clean",
      decisions: NO_DECISIONS,
      policies: DEFAULT_POLICIES,
    };
    const results = await dq90.run(ctx);
    const payments = results.find((r) => r.unitId === "payments.csv")!;
    expect(payments.outcome).toBe("fail");
    expect(payments.details).toMatchObject({ rowCount: 2, rows: 1 });
    expect(results.filter((r) => r.outcome === "pass")).toHaveLength(4);
  });
});
