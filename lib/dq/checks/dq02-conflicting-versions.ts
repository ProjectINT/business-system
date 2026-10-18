// DQ-02 conflictingVersions: one natural key, several rows with different content. Which version is
// right is for a human (case `version`, VALIDATION_PLAN.md 7.5); a later `updated_at` is only a hint.
// Exact copies are DQ-01's and do not count as versions.
import { ENTITIES } from "../../ingest";
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { amountIdrOf, fail, pass, skip, SKIP } from "./common";

export function versionCaseKey(u: RowUnit): string {
  return `V:${u.entity}:${u.recordKey}`;
}

export const dq02: Check = {
  id: "DQ-02",
  version: 1,
  title: "Same id, different content",
  entity: ENTITIES,
  action: "decide",
  engine: "ts",
  dependsOn: ["DQ-01"],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const out: CheckResult[] = [];
    for (const entity of ENTITIES) {
      const live = new Map<string, RowUnit[]>();
      for (const u of ctx.units(entity)) {
        if (u.recordKey === null || ctx.statusSoFar(u.unitId) === "duplicate") continue;
        const list = live.get(u.recordKey) ?? [];
        list.push(u);
        live.set(u.recordKey, list);
      }
      for (const u of ctx.units(entity)) {
        if (u.recordKey === null) {
          out.push(skip(u, SKIP.noKey));
          continue;
        }
        if (ctx.statusSoFar(u.unitId) === "duplicate") {
          out.push(skip(u, SKIP.exactDuplicate));
          continue;
        }
        const versions = live.get(u.recordKey)!;
        if (versions.length === 1) {
          out.push(pass(u));
          continue;
        }
        const others = versions.filter((v) => v.unitId !== u.unitId);
        out.push(
          fail(u, {
            details: {
              caseKey: versionCaseKey(u),
              versions: versions.length,
              otherUnitIds: others.map((v) => v.unitId).sort(),
              updatedAt: (u.values as { updated_at?: string | null }).updated_at ?? null,
            },
            amountIdr: amountIdrOf(u),
          }),
        );
      }
    }
    return out;
  },
};
