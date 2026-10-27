// DQ-12 stayOverlap: two active reservations of one villa share a night. The stay is the half-open
// interval [check_in, check_out): check-out and check-in on the same day do not overlap. Pairs are
// joined into conflict groups (connected components); the group key — villa and the sorted
// reservation ids — is the case key a human decides on (VALIDATION_PLAN.md 7.2, 7.5).
// The same logic in SQL (daterange && over app.eff_reservation) arrives in phase 7b.
import { nightsBetween, type CalendarDate } from "../../calc";
import type { Check, CheckContext, CheckResult, RowUnit } from "../types";
import { amountIdrOf, fail, isActive, isOutUnit, pass, skip, SKIP } from "./common";

export interface StayCandidate {
  readonly unit: RowUnit<"reservation">;
  readonly key: string;
  readonly propertyId: string;
  readonly status: "confirmed" | "modified";
  readonly checkIn: CalendarDate;
  readonly checkOut: CalendarDate;
}

export type OverlapKind = "same_dates" | "modified_version" | "partial";

export interface OverlapPair {
  readonly a: string; // reservation id, a < b
  readonly b: string;
  readonly propertyId: string;
  readonly from: CalendarDate; // overlap [from, to)
  readonly to: CalendarDate;
  readonly nights: number;
  readonly kind: OverlapKind;
}

export interface ConflictGroup {
  readonly caseKey: string;
  readonly propertyId: string;
  readonly keys: readonly string[]; // sorted reservation ids
}

/** Active reservations with a stay, not excluded earlier; everything else with its skip reason. */
export function stayCandidates(ctx: CheckContext): { candidates: StayCandidate[]; skipped: CheckResult[] } {
  const candidates: StayCandidate[] = [];
  const skipped: CheckResult[] = [];
  for (const u of ctx.units("reservation")) {
    const { property_id, check_in, check_out, status } = u.values;
    if (isOutUnit(ctx, u)) skipped.push(skip(u, SKIP.out));
    else if (status === null) skipped.push(skip(u, SKIP.notParsed("status")));
    else if (!isActive(u)) skipped.push(skip(u, SKIP.cancelled));
    else if (property_id === null) skipped.push(skip(u, SKIP.notParsed("property_id")));
    else if (check_in === null || check_out === null) skipped.push(skip(u, SKIP.notParsed("check_in / check_out")));
    else if (nightsBetween(check_in, check_out) <= 0) skipped.push(skip(u, SKIP.noStay));
    else if (u.recordKey === null) skipped.push(skip(u, SKIP.noKey));
    else candidates.push({ unit: u, key: u.recordKey, propertyId: property_id, status: status as "confirmed" | "modified", checkIn: check_in, checkOut: check_out });
  }
  return { candidates, skipped };
}

/** [a.in, a.out) and [b.in, b.out) share a night. */
export function staysOverlap(a: StayCandidate, b: StayCandidate): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

function pairOf(a: StayCandidate, b: StayCandidate): OverlapPair {
  const from = a.checkIn > b.checkIn ? a.checkIn : b.checkIn;
  const to = a.checkOut < b.checkOut ? a.checkOut : b.checkOut;
  const kind: OverlapKind =
    a.checkIn === b.checkIn && a.checkOut === b.checkOut
      ? "same_dates"
      : a.status === "modified" || b.status === "modified"
        ? "modified_version"
        : "partial";
  return { a: a.key, b: b.key, propertyId: a.propertyId, from, to, nights: nightsBetween(from, to), kind };
}

/** Distinct overlapping pairs by reservation id (a < b), sorted; rows of one id never pair with each other. */
export function overlapPairs(candidates: readonly StayCandidate[]): OverlapPair[] {
  const byProperty = new Map<string, StayCandidate[]>();
  for (const c of candidates) {
    const list = byProperty.get(c.propertyId) ?? [];
    list.push(c);
    byProperty.set(c.propertyId, list);
  }
  const pairs = new Map<string, OverlapPair>();
  for (const list of byProperty.values()) {
    for (const a of list) {
      for (const b of list) {
        if (b.key > a.key && staysOverlap(a, b)) pairs.set(`${a.key}|${b.key}`, pairOf(a, b));
      }
    }
  }
  return [...pairs.values()].sort((x, y) => (x.a < y.a || (x.a === y.a && x.b < y.b) ? -1 : 1)); // pairs are distinct
}

export function groupKey(propertyId: string, keys: readonly string[]): string {
  return `${propertyId}:${[...keys].sort().join(",")}`;
}

/** Connected components of the pairs; each reservation id belongs to one group. */
export function conflictGroups(pairs: readonly OverlapPair[]): ReadonlyMap<string, ConflictGroup> {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!; // every key is in `parent`
    parent.set(k, root);
    return root;
  };
  const property = new Map<string, string>();
  for (const p of pairs) {
    for (const k of [p.a, p.b]) {
      if (!parent.has(k)) parent.set(k, k);
      property.set(k, p.propertyId);
    }
    const ra = find(p.a);
    const rb = find(p.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const members = new Map<string, string[]>();
  for (const k of parent.keys()) {
    const root = find(k);
    const list = members.get(root) ?? [];
    list.push(k);
    members.set(root, list);
  }
  const byKey = new Map<string, ConflictGroup>();
  for (const [root, keys] of members) {
    const propertyId = property.get(root)!;
    keys.sort();
    const group: ConflictGroup = { caseKey: groupKey(propertyId, keys), propertyId, keys };
    for (const k of keys) byKey.set(k, group);
  }
  return byKey;
}

export const dq12: Check = {
  id: "DQ-12",
  version: 1,
  title: "Stays overlap",
  entity: "reservation",
  action: "decide",
  engine: "sql",
  dependsOn: ["DQ-04", "DQ-06", "DQ-07", "DQ-09", "DQ-17"],
  async run(): Promise<CheckResult[]> {
    throw new Error("DQ-12 on SQL arrives in phase 7b; without a database the runner uses runTs");
  },
  async runTs(ctx: CheckContext): Promise<CheckResult[]> {
    const { candidates, skipped } = stayCandidates(ctx);
    const pairs = overlapPairs(candidates);
    const groups = conflictGroups(pairs);
    const results = candidates.map((c) => {
      const mine = pairs
        .filter((p) => p.a === c.key || p.b === c.key)
        .map((p) => ({ with: p.a === c.key ? p.b : p.a, from: p.from, to: p.to, nights: p.nights, kind: p.kind }));
      if (mine.length === 0) return pass(c.unit);
      return fail(c.unit, {
        details: { caseKey: groups.get(c.key)!.caseKey, pairs: mine },
        relatedKeys: mine.map((m) => m.with),
        amountIdr: amountIdrOf(c.unit),
      });
    });
    return [...skipped, ...results];
  },
};
