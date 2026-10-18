// DQ-01 exactDuplicate: the same record twice — same key, same content, i.e. the same `rowHash`.
// The first copy in file order passes; every later copy is a duplicate and leaves the data for good.
// A reservation with the same dates under another id is not a duplicate (R0033 / R0056): that is DQ-12.
import { ENTITIES } from "../../ingest";
import type { Check, CheckContext, CheckResult } from "../types";
import { amountIdrOf, fail, pass } from "./common";

export const dq01: Check = {
  id: "DQ-01",
  version: 1,
  title: "Exact duplicate row",
  entity: ENTITIES,
  action: "duplicate",
  engine: "ts",
  dependsOn: [],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const out: CheckResult[] = [];
    for (const entity of ENTITIES) {
      const first = new Map<string, { unitId: string; lineNo: number }>();
      const rows = [...ctx.units(entity)].sort((a, b) => a.lineNo - b.lineNo);
      for (const u of rows) {
        const seen = first.get(u.rowHash);
        if (seen === undefined) {
          first.set(u.rowHash, { unitId: u.unitId, lineNo: u.lineNo });
          out.push(pass(u));
        } else {
          out.push(fail(u, { details: { duplicateOf: seen.unitId, firstLineNo: seen.lineNo }, amountIdr: amountIdrOf(u) }));
        }
      }
    }
    return out;
  },
};
