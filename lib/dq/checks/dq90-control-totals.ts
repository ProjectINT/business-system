// DQ-90 controlTotals: for every file, the rows the loader counted are the rows the run saw, and each
// row has exactly one status, so source = in figures + excluded + duplicates by count and by amount.
// At level 1 the counts cannot differ by construction; the rule states the invariant and shows the
// totals the data-quality page prints. At level 2 it also compares `import_file.row_count` with `raw_record`.
// A `fail` here fails the run (runner).
import type { Check, CheckContext, CheckResult, RuleId, Status } from "../types";
import { amountIdrOf, fail, pass } from "./common";

const STATUSES: readonly Status[] = ["clean", "review", "pending", "excluded", "duplicate", "superseded"];

export function controlTotals(dependsOn: readonly RuleId[]): Check {
  return {
    id: "DQ-90",
    version: 1,
    title: "Control totals per file",
    entity: "file",
    action: "exclude",
    engine: "ts",
    dependsOn,
    async run(ctx: CheckContext): Promise<CheckResult[]> {
      return ctx.units("file").map((f) => {
        const byUnitId = new Map(ctx.units(f.fileEntity).map((u) => [u.unitId, u]));
        const rows: Record<Status, number> = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
        const amounts: Record<Status, bigint> = Object.fromEntries(STATUSES.map((s) => [s, 0n])) as Record<Status, bigint>;
        let amountTotal = 0n;
        for (const unitId of f.rowUnitIds) {
          const status = ctx.statusSoFar(unitId);
          rows[status] += 1;
          const amount = amountIdrOf(byUnitId.get(unitId)!) ?? 0n;
          amounts[status] += amount;
          amountTotal += amount;
        }
        const counted = STATUSES.reduce((n, s) => n + rows[s], 0);
        const details = { rowCount: f.file.rowCount, rows: f.rowUnitIds.length, byStatus: rows, amountTotal, amountByStatus: amounts };
        return f.file.rowCount === f.rowUnitIds.length && counted === f.rowUnitIds.length ? { ...pass(f), details } : fail(f, { details });
      });
    },
  };
}
