// The reference run on the sample data (VALIDATION_PLAN.md 9.4): the `fail` lists of every rule
// equal the "Expected" column of the catalogue (section 6), and the invariants of 9.5 hold.
// If the data changes, this test shows the difference.
//
// Where a figure differs from the first analysis, a row that an earlier rule had already excluded
// or marked duplicate is the reason: rules skip such rows, the first analysis counted raw rows.
// DQ-11 30 (not 31: the copy of R0015), DQ-20 22 payments and 29 expenses (not 23 / 30: P0017 and
// E0017 point at unknown villas), DQ-23 58 (not 60: P0017 and the copy of P0075).
import { describe, expect, it } from "vitest";
import { loadDataset } from "../ingest";
import { buildCases } from "./cases";
import { CHECKS } from "./checks";
import { conflictGroups, overlapPairs, stayCandidates } from "./checks/dq12-stay-overlap";
import { dq12 } from "./checks/dq12-stay-overlap";
import { contextBefore, failedKeys, resultFor, resultsOf, runOn } from "./testing/run";
import type { JournalResult, RunReport, Status } from "./types";

const sample = loadDataset();

const keysOf = (results: readonly JournalResult[], outcome: string) =>
  results.filter((r) => r.outcome === outcome).map((r) => r.recordKey!).sort();

const unique = <T>(xs: readonly T[]) => [...new Set(xs)];

const seq = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(4, "0")}`);

describe("reference run on 2026-10-19", async () => {
  const report: RunReport = await runOn(sample, { today: "2026-10-19" });
  const verdict = new Map(report.verdicts.map((v) => [v.unitId, v]));
  const status = (key: string): Status[] => report.verdicts.filter((v) => v.recordKey === key).map((v) => v.status);

  it("succeeds: every rule ran, one verdict per row, DQ-90 passes on every file", () => {
    expect(report.status).toBe("succeeded");
    expect(report.summary.failures).toEqual([]);
    expect(report.meta.rules.map((r) => r.id)).toEqual(CHECKS.map((c) => c.id)); // listed by stage, run by stage
    expect(report.meta.rules.at(-1)!.id).toBe("DQ-90");
    expect(report.verdicts).toHaveLength(357);
    expect(unique(report.verdicts.map((v) => v.unitId))).toHaveLength(357);
    expect(resultsOf(report, "DQ-90").map((r) => [r.unitId, r.outcome])).toEqual([
      ["commission_rules.csv", "pass"],
      ["expenses.csv", "pass"],
      ["payments.csv", "pass"],
      ["properties.csv", "pass"],
      ["reservations.csv", "pass"],
    ]);
  });

  it("stage 0: duplicates R0015 and P0075 (second copies), no versions, no format problems", () => {
    expect(failedKeys(report, "DQ-03")).toEqual([]);
    expect(resultsOf(report, "DQ-01").filter((r) => r.outcome === "fail").map((r) => r.unitId)).toEqual([
      "payments.csv:77",
      "reservations.csv:152",
    ]);
    expect(status("R0015")).toEqual(["duplicate", "review"]); // line 152 sorts before line 16; the first copy is unpaid by check-in (DQ-16)
    expect(failedKeys(report, "DQ-02")).toEqual([]);
  });

  it("stage 1: no commission rule overlaps", () => {
    expect(failedKeys(report, "DQ-22")).toEqual([]);
    expect(resultsOf(report, "DQ-22")).toHaveLength(20);
  });

  it("stage 2: exclusions R0034, R0061, R0072, E0017; flags R0102; 30 direct bookings with a marketing fee (information)", () => {
    expect(failedKeys(report, "DQ-04")).toEqual(["E0017", "P0017", "R0034"]);
    expect(resultFor(report, "DQ-04", "R0034").details).toEqual({ propertyId: "V999" });
    expect(resultFor(report, "DQ-04", "E0017").details).toEqual({ propertyId: "V777" });
    expect(failedKeys(report, "DQ-06")).toEqual(["R0061"]);
    expect(resultFor(report, "DQ-06", "R0061").details).toEqual({
      currency: "USD",
      baseCurrency: "IDR",
      amount: 4280874n,
      nights: 4,
      perNight: 1070218n,
    });
    expect(failedKeys(report, "DQ-07")).toEqual([]);
    expect(failedKeys(report, "DQ-08")).toEqual(["R0102"]);
    expect(resultFor(report, "DQ-08", "R0102").details).toEqual({ otaFee: -100000n, gross: 3898667n });
    expect(failedKeys(report, "DQ-09")).toEqual(["R0072"]);
    expect(resultFor(report, "DQ-09", "R0072").details).toMatchObject({ problems: ["refund_above_gross", "refund_without_cancellation"] });
    expect(failedKeys(report, "DQ-10")).toEqual([]);
    expect(resultFor(report, "DQ-10", "R0102").reason).toBe("OTA fee out of bounds (DQ-08)");
    expect(failedKeys(report, "DQ-11")).toEqual(seq("R", 5, 150).filter((k) => Number(k.slice(1)) % 5 === 0));
    expect(failedKeys(report, "DQ-11")).toHaveLength(30);
    expect(failedKeys(report, "DQ-13")).toEqual(seq("R", 143, 150));
    expect(failedKeys(report, "DQ-17")).toEqual([]);
    expect(failedKeys(report, "DQ-18")).toEqual([]);
    for (const key of ["R0034", "R0061", "R0072"]) expect(status(key)).toEqual(["excluded"]);
    expect(status("R0102")).toEqual(["pending"]); // in a conflict group; review by DQ-08 is in its reasons
    expect(verdict.get("reservations.csv:103")!.ruleIds).toEqual(["DQ-12"]);
  });

  it("stage 3: DQ-12 gives 68 pairs, 86 reservations, 32 groups on 17 villas; 49 reservations are free; 801.6M of 1 256.7M IDR in conflict", () => {
    const fails = resultsOf(report, "DQ-12").filter((r) => r.outcome === "fail");
    expect(fails).toHaveLength(86);
    expect(resultsOf(report, "DQ-12").filter((r) => r.outcome === "pass")).toHaveLength(49);
    expect(resultsOf(report, "DQ-12").filter((r) => r.outcome === "skip")).toHaveLength(16); // 12 cancelled, 3 excluded, 1 duplicate
    const groups = unique(fails.map((r) => (r.details as { caseKey: string }).caseKey));
    expect(groups).toHaveLength(32);
    expect(unique(groups.map((g) => g.slice(0, g.indexOf(":"))))).toHaveLength(17);
    const sizes = groups.map((g) => g.split(",").length).sort((a, b) => a - b);
    expect(sizes).toEqual([...Array(19).fill(2), ...Array(9).fill(3), 4, 4, 5, 8]);
    expect(groups).toContain("V003:R0017,R0029,R0039,R0096,R0101,R0102,R0103,R0128");
    expect(resultFor(report, "DQ-12", "R0102").relatedKeys).toEqual(["R0017", "R0096", "R0101", "R0103", "R0128"]);
    expect(resultFor(report, "DQ-12", "R0033").details).toMatchObject({
      caseKey: "V008:R0033,R0056",
      pairs: [{ with: "R0056", kind: "same_dates", nights: 7 }],
    });
    const pairs = fails.flatMap((r) => (r.details as { pairs: { kind: string }[] }).pairs);
    expect(pairs).toHaveLength(68 * 2);
    expect(pairs.filter((p) => p.kind === "same_dates")).toHaveLength(2);
    expect(pairs.filter((p) => p.kind === "modified_version")).toHaveLength(6 * 2);
    expect(pairs.filter((p) => p.kind === "partial")).toHaveLength(61 * 2);
    // GBV in conflict: 801.6M of 1 256.7M of active reservations
    const gbv = (rs: readonly JournalResult[]) => rs.reduce((s, r) => s + (r.amountIdr ?? 0n), 0n);
    expect(gbv(fails)).toBe(801_601_913n);
    const grossOf = new Map(sample.rows.reservation.map((r) => [r.unitId, r.values.gross_booking_value!]));
    const active = resultsOf(report, "DQ-12").filter((r) => r.outcome !== "skip");
    expect(active.reduce((s, r) => s + grossOf.get(r.unitId)!, 0n)).toBe(1_256_651_523n);
  });

  it("stage 3: the TS twin lists the same 68 pairs when called directly", async () => {
    const ctx = await contextBefore(dq12, sample)();
    const { candidates } = stayCandidates(ctx);
    expect(candidates).toHaveLength(135);
    const pairs = overlapPairs(candidates);
    expect(pairs).toHaveLength(68);
    expect(pairs.every((p) => p.a < p.b && p.nights > 0)).toBe(true);
    expect(pairs.filter((p) => p.kind === "modified_version").map((p) => `${p.a}/${p.b}`)).toEqual([
      "R0027/R0146",
      "R0038/R0148",
      "R0045/R0148",
      "R0112/R0146",
      "R0126/R0145",
      "R0149/R0150",
    ]);
    expect(new Set(conflictGroups(pairs).values()).size).toBe(32);
  });

  it("stage 4: DQ-05 excludes P0036 (P0017 is already out by DQ-04) and holds 42 payments of case reservations", () => {
    const dq05 = resultsOf(report, "DQ-05");
    expect(dq05.filter((r) => r.outcome === "fail" && r.action === undefined).map((r) => r.recordKey)).toEqual(["P0036"]);
    expect(resultFor(report, "DQ-05", "P0036").details).toEqual({ reservationId: "R0072", problem: "reservation_excluded" });
    expect(resultFor(report, "DQ-05", "P0017").reason).toBe("row excluded or duplicate by an earlier rule");
    const held = dq05.filter((r) => r.action === "hold");
    expect(held).toHaveLength(42);
    expect(held.every((r) => r.outcome === "fail" && (r.details as { problem: string }).problem === "reservation_pending")).toBe(true);
    const caseReservations = new Set(resultsOf(report, "DQ-12").filter((r) => r.outcome === "fail").map((r) => r.recordKey));
    for (const r of resultsOf(report, "DQ-13").filter((x) => x.outcome === "fail")) caseReservations.add(r.recordKey);
    expect(held.every((r) => caseReservations.has(r.relatedKeys![0]!))).toBe(true);
    expect(status("P0017")).toEqual(["excluded"]);
    expect(status("P0036")).toEqual(["excluded"]);
    expect(status("P0075")).toEqual(["pending", "duplicate"]);
  });

  it("stage 4: DQ-14 P0051; DQ-15 seven zero payments; DQ-19 none", () => {
    expect(failedKeys(report, "DQ-14")).toEqual(["P0051"]);
    expect(resultFor(report, "DQ-14", "P0051").details).toEqual({
      amount: 3998667n,
      expected: 3998667n,
      gross: 3898667n,
      difference: 0n,
      aboveGross: true,
    });
    expect(failedKeys(report, "DQ-15")).toEqual(["P0036", "P0066", "P0067", "P0068", "P0069", "P0070", "P0071"]);
    expect(failedKeys(report, "DQ-19")).toEqual([]);
  });

  it("stage 4: DQ-16 113 reservations unpaid at check-in, 62 of them without a single payment", () => {
    const fails = resultsOf(report, "DQ-16").filter((r) => r.outcome === "fail");
    expect(fails).toHaveLength(113);
    expect(fails.filter((r) => (r.details as { payments: number }).payments === 0)).toHaveLength(62);
    expect(fails.every((r) => (r.details as { paidByCheckIn: bigint; expected: bigint }).paidByCheckIn < (r.details as { expected: bigint }).expected)).toBe(true);
    expect(resultsOf(report, "DQ-16").filter((r) => r.reason === "check-in is still ahead")).toHaveLength(15);
  });

  it("stage 4: DQ-24 64 confirmed reservations without a payment, 6 of them before check-in", () => {
    const fails = resultsOf(report, "DQ-24").filter((r) => r.outcome === "fail");
    expect(fails).toHaveLength(64);
    const ahead = fails.filter((r) => (r.details as { daysToCheckIn: number }).daysToCheckIn > 0);
    expect(ahead.map((r) => r.recordKey).sort()).toEqual(["R0003", "R0035", "R0089", "R0097", "R0123", "R0127"]);
    // the other 58 have checked in: DQ-16 already counts them as a debt
    const dq16 = new Set(failedKeys(report, "DQ-16"));
    expect(fails.filter((r) => !ahead.includes(r)).every((r) => dq16.has(r.recordKey!))).toBe(true);
    expect(fails.every((r) => Number(r.recordKey!.slice(1)) % 2 === 1)).toBe(true); // payments exist for even ids only
    expect(resultsOf(report, "DQ-24").filter((r) => r.reason === "status is not confirmed")).toHaveLength(20);
  });

  it("stage 4: DQ-20 16 payments and 22 expenses dated after today", () => {
    const fails = resultsOf(report, "DQ-20").filter((r) => r.outcome === "fail");
    expect(fails.filter((r) => r.entity === "payment")).toHaveLength(16);
    expect(fails.filter((r) => r.entity === "expense")).toHaveLength(22);
    expect(resultFor(report, "DQ-20", "P0017").reason).toBe("row excluded or duplicate by an earlier rule");
  });

  it("stage 4: DQ-23 58 payments dated after check-in, 9 on the check-in day, none before", () => {
    const dq23 = resultsOf(report, "DQ-23");
    expect(keysOf(dq23, "fail")).toHaveLength(58);
    expect(keysOf(dq23, "pass")).toHaveLength(9);
    expect(dq23.filter((r) => r.outcome === "fail").every((r) => (r.details as { daysAfterCheckIn: number }).daysAfterCheckIn > 0)).toBe(true);
    expect(resultsOf(report, "DQ-23").filter((r) => r.reason === "zero payment (DQ-15)")).toHaveLength(6);
  });

  it("row statuses: 137 clean, 81 review, 131 pending, 6 excluded, 2 duplicate", () => {
    expect(report.summary.counts).toEqual({ clean: 137, review: 81, pending: 131, excluded: 6, duplicate: 2, superseded: 0 });
    const excluded = report.verdicts.filter((v) => v.status === "excluded").map((v) => v.recordKey).sort();
    expect(excluded).toEqual(["E0017", "P0017", "P0036", "R0034", "R0061", "R0072"]);
    const pending = report.verdicts.filter((v) => v.status === "pending");
    expect(pending.filter((v) => v.entity === "reservation")).toHaveLength(89); // 86 in groups + 3 modified alone
    expect(pending.filter((v) => v.entity === "payment")).toHaveLength(42); // held by DQ-05, the first copy of P0075 among them
  });

  it("cases: 35 — 32 conflict groups and 3 modified reservations alone", () => {
    const cases = buildCases(report);
    expect(cases).toHaveLength(35);
    expect(cases.filter((c) => c.type === "conflict")).toHaveLength(32);
    expect(cases.filter((c) => c.type === "modification").map((c) => c.caseKey)).toEqual(["M:R0143", "M:R0144", "M:R0147"]);
    expect(cases.filter((c) => c.type === "version")).toHaveLength(0);
    expect(unique(cases.filter((c) => c.type === "conflict").map((c) => c.propertyId))).toHaveLength(17);
    expect(cases.filter((c) => c.hasModified)).toHaveLength(3 + 4); // R0145, R0146, R0148, R0149+R0150 in groups
    expect(cases.flatMap((c) => c.recordKeys)).toHaveLength(89);
    expect(cases.find((c) => c.caseKey === "V008:R0033,R0056")).toMatchObject({ kinds: ["same_dates"], hasModified: false });
  });
});

describe("another today", () => {
  it("2026-10-31: DQ-16 126, DQ-20 3 payments; 2026-11-05: DQ-16 126, DQ-20 none", async () => {
    const oct = await runOn(sample, { today: "2026-10-31" });
    expect(failedKeys(oct, "DQ-16")).toHaveLength(126);
    expect(resultsOf(oct, "DQ-16").filter((r) => r.outcome === "fail" && (r.details as { payments: number }).payments === 0)).toHaveLength(68);
    expect(resultsOf(oct, "DQ-20").filter((r) => r.outcome === "fail" && r.entity === "payment")).toHaveLength(3);
    const nov = await runOn(sample, { today: "2026-11-05" });
    expect(failedKeys(nov, "DQ-16")).toHaveLength(126);
    expect(failedKeys(nov, "DQ-20")).toEqual([]);
  });
});
