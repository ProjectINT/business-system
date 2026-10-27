// DQ-02 conflictingVersions: one natural key, several rows with different content. Reservations (v2,
// ТЗ п. 10 of the final test): the version with the latest `updated_at` stands by itself, older ones are
// superseded; only a tie on the latest `updated_at` (or a version without one) is for a human — case
// `version`, VALIDATION_PLAN.md 7.5. Other entities have no `updated_at`: every version is a case, as in v1.
// Exact copies are DQ-01's and do not count as versions. In the CSV `updated_at` is a date: the string order is the time order.
import { ENTITIES } from "../../ingest";
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { amountIdrOf, fail, pass, skip, SKIP } from "./common";

export function versionCaseKey(u: RowUnit): string {
  return `V:${u.entity}:${u.recordKey}`;
}

const updatedAtOf = (u: RowUnit): string | null => (u.values as { updated_at?: string | null }).updated_at ?? null;

/** The versions that stand for a reservation key: those with the latest `updated_at`; `null` when one has none. */
function latestOf(versions: readonly RowUnit[]): { readonly updatedAt: string; readonly units: readonly RowUnit[] } | null {
  const dates = versions.map(updatedAtOf);
  if (dates.some((d) => d === null)) return null;
  const updatedAt = (dates as string[]).reduce((max, d) => (d > max ? d : max));
  return { updatedAt, units: versions.filter((v) => updatedAtOf(v) === updatedAt) };
}

export const dq02: Check = {
  id: "DQ-02",
  version: 2,
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
        let versions = live.get(u.recordKey)!;
        if (versions.length === 1) {
          out.push(pass(u));
          continue;
        }
        const latest = entity === "reservation" ? latestOf(versions) : null;
        if (latest !== null) {
          if (!latest.units.includes(u)) {
            out.push(
              fail(u, {
                action: "supersede",
                details: {
                  versions: versions.length,
                  updatedAt: updatedAtOf(u),
                  latestUpdatedAt: latest.updatedAt,
                  latestUnitIds: latest.units.map((v) => v.unitId).sort(),
                },
                amountIdr: amountIdrOf(u),
              }),
            );
            continue;
          }
          if (latest.units.length === 1) {
            out.push(pass(u));
            continue;
          }
          versions = [...latest.units]; // a tie on the latest updated_at: the case holds only these
        }
        const others = versions.filter((v) => v.unitId !== u.unitId);
        out.push(
          fail(u, {
            details: {
              caseKey: versionCaseKey(u),
              versions: versions.length,
              otherUnitIds: others.map((v) => v.unitId).sort(),
              updatedAt: updatedAtOf(u),
            },
            amountIdr: amountIdrOf(u),
          }),
        );
      }
    }
    return out;
  },
};
