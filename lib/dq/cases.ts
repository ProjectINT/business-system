// Cases a human decides on (VALIDATION_PLAN.md 7.5), read from a run's report:
//   conflict     — a DQ-12 group: reservations of one villa joined by overlaps, modified ones included;
//   modification — a modified reservation (DQ-13) outside every group;
//   version      — one key, several contents (DQ-02).
// A case holds only rows whose verdict is `pending`: an excluded modified reservation is no case.
// Phase 8 adds the link edges of decisions (a modified reservation linked to a reservation of another case).
import type { Entity as RowEntity } from "../ingest";
import type { OverlapKind } from "./checks/dq12-stay-overlap";
import { modificationCaseKey } from "./checks/dq13-modified-without-origin";
import type { JournalResult, RunReport } from "./types";

export type CaseType = "conflict" | "modification" | "version";

export interface Case {
  readonly caseKey: string;
  readonly type: CaseType;
  readonly entity: RowEntity;
  /** Villa of a conflict or modification case; `null` for a version case of another entity. */
  readonly propertyId: string | null;
  readonly recordKeys: readonly string[]; // sorted
  readonly unitIds: readonly string[]; // sorted
  /** Conflict cases: kinds of overlap inside, for the order of review (same_dates → modified → partial). */
  readonly kinds: readonly OverlapKind[];
  readonly hasModified: boolean;
}

interface Draft {
  type: CaseType;
  entity: RowEntity;
  propertyId: string | null;
  recordKeys: Set<string>;
  unitIds: Set<string>;
  kinds: Set<OverlapKind>;
  hasModified: boolean;
}

function draft(type: CaseType, entity: RowEntity, propertyId: string | null): Draft {
  return { type, entity, propertyId, recordKeys: new Set(), unitIds: new Set(), kinds: new Set(), hasModified: false };
}

function pendingFails(report: RunReport, ruleId: `DQ-${string}`, pending: ReadonlySet<string>): JournalResult[] {
  return (report.results.get(ruleId) ?? []).filter((r) => r.outcome === "fail" && pending.has(r.unitId));
}

export function buildCases(report: RunReport): Case[] {
  const pending = new Set(report.verdicts.filter((v) => v.status === "pending").map((v) => v.unitId));
  const keyToCase = new Map<string, Draft>();
  const modifiedKeys = new Set(pendingFails(report, "DQ-13", pending).map((r) => r.recordKey!));

  for (const r of pendingFails(report, "DQ-12", pending)) {
    const details = r.details as { caseKey: string; pairs: readonly { kind: OverlapKind }[] };
    let c = keyToCase.get(details.caseKey);
    if (c === undefined) {
      c = draft("conflict", "reservation", details.caseKey.slice(0, details.caseKey.indexOf(":")));
      keyToCase.set(details.caseKey, c);
    }
    c.recordKeys.add(r.recordKey!);
    c.unitIds.add(r.unitId);
    for (const p of details.pairs) c.kinds.add(p.kind);
    if (modifiedKeys.has(r.recordKey!)) c.hasModified = true;
  }

  const inGroup = new Set([...keyToCase.values()].flatMap((c) => [...c.recordKeys]));
  for (const r of pendingFails(report, "DQ-13", pending)) {
    if (inGroup.has(r.recordKey!)) continue;
    const propertyId = (r.details as { propertyId: string | null }).propertyId;
    const caseKey = modificationCaseKey(r.recordKey!);
    let c = keyToCase.get(caseKey);
    if (c === undefined) {
      c = draft("modification", "reservation", propertyId);
      c.hasModified = true;
      keyToCase.set(caseKey, c);
    }
    c.recordKeys.add(r.recordKey!);
    c.unitIds.add(r.unitId);
  }

  for (const r of pendingFails(report, "DQ-02", pending)) {
    const caseKey = (r.details as { caseKey: string }).caseKey;
    let c = keyToCase.get(caseKey);
    if (c === undefined) {
      c = draft("version", r.entity as RowEntity, null);
      keyToCase.set(caseKey, c);
    }
    c.recordKeys.add(r.recordKey!);
    c.unitIds.add(r.unitId);
  }

  return [...keyToCase.entries()]
    .map(
      ([caseKey, c]): Case => ({
        caseKey,
        type: c.type,
        entity: c.entity,
        propertyId: c.propertyId,
        recordKeys: [...c.recordKeys].sort(),
        unitIds: [...c.unitIds].sort(),
        kinds: [...c.kinds].sort(),
        hasModified: c.hasModified,
      }),
    )
    .sort((x, y) => (x.caseKey < y.caseKey ? -1 : 1)); // keys are unique
}
