import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES } from "../../calc";
import { NO_DECISIONS } from "../runner";
import { datasetSource } from "../sources/dataset";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, PAYMENT, PROPERTY, RESERVATION, apart, datasetFrom } from "../testing/fixture";
import { contextBefore, resultsOf, runOn } from "../testing/run";
import type { CheckContext, FileUnit } from "../types";
import { dq90 } from "./index";

const reservations = apart([RESERVATION, { ...RESERVATION, reservation_id: "R0002", property_id: "V999" }, { ...RESERVATION, reservation_id: "R0003", status: "modified" }]);
const ds = datasetFrom({
  property: [PROPERTY],
  commission_rule: [COMMISSION_RULE],
  // an exact copy of the first row, and a later version of it that supersedes the first
  reservation: [...reservations, reservations[0]!, { ...reservations[0]!, updated_at: "2026-09-05" }],
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
        rowCount: 5,
        rows: 5,
        byStatus: { clean: 1, review: 0, pending: 1, excluded: 1, duplicate: 1, superseded: 1 },
        amountTotal: 15000000n,
        amountByStatus: { clean: 3000000n, review: 0n, pending: 3000000n, excluded: 3000000n, duplicate: 3000000n, superseded: 3000000n },
      },
    });
    const payments = resultsOf(report, "DQ-90").find((r) => r.unitId === "payments.csv")!;
    expect(payments.details).toMatchObject({ rows: 2, byStatus: { clean: 1, pending: 1 }, amountTotal: 5100000n });
    expect(resultsOf(report, "DQ-90").find((r) => r.unitId === "expenses.csv")!.details).toMatchObject({ rows: 0, amountTotal: 0n });
  });

  it("fails a file whose loader row count differs from the rows the run saw, and the run with it", async () => {
    const source = datasetSource(ds);
    const files = source.units("file").map((f): FileUnit => (f.fileEntity === "payment" ? { ...f, rowUnitIds: f.rowUnitIds.slice(1) } : f));
    const ctx: CheckContext = {
      batchId: "csv",
      today: "2026-10-15",
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
