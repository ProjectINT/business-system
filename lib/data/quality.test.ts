import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import { add, DEFAULT_POLICIES, idr, money, sum, type Currency, type Money } from "../calc";
import { CHECKS, defaultRegistry } from "../dq";
import { COMMISSION_RULE, datasetFrom, EXPENSE, PAYMENT, PROPERTY, RESERVATION } from "../dq/testing/fixture";
import { runOn } from "../dq/testing/run";
import { DEFAULT_DATA_DIR, ENTITIES, FILE_NAMES } from "../ingest";
import { toMoney } from "./admit";
import { IN_FIGURES, qualityOf } from "./quality";
import { buildSnapshot } from "./snapshot";
import { sampleSnapshot, snapshotOf } from "./testing/snapshot";

const snapshot = await sampleSnapshot();
const q = qualityOf(snapshot);

/** The amount column of a file by currency, read with csv-parse alone: no code of lib/ingest, lib/dq or lib/data. */
function fromFile(entity: "reservation" | "payment" | "expense"): { rows: number; amounts: Map<string, bigint> } {
  const text = readFileSync(join(DEFAULT_DATA_DIR, FILE_NAMES[entity]), "utf8");
  const rows = parse(text, { bom: true, columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const column = entity === "reservation" ? "gross_booking_value" : "amount";
  const amounts = new Map<string, bigint>();
  for (const r of rows) amounts.set(r.currency!, (amounts.get(r.currency!) ?? 0n) + BigInt(r[column]!));
  return { rows: rows.length, amounts };
}

const total = (list: readonly Money[], currency: Currency = "IDR") => sum(list, currency);

describe("control totals on the sample files (PLAN.md 5.2)", () => {
  it("source = in the figures + excluded + duplicates, by rows and by amount", () => {
    const shown = q.files.map((f) => [
      f.fileName,
      f.rowCount,
      f.rowsInFigures,
      f.rows.excluded,
      f.rows.duplicate,
      f.amounts.map((a) => [a.currency, a.source.amount, a.inFigures.amount, a.byStatus.excluded.amount, a.byStatus.duplicate.amount]),
      f.balanced,
    ]);
    expect(shown).toEqual([
      ["properties.csv", 20, 20, 0, 0, [], true],
      ["commission_rules.csv", 20, 20, 0, 0, [], true],
      [
        "reservations.csv",
        151,
        147,
        3,
        1,
        [
          ["IDR", 1_377_977_041n, 1_342_815_036n, 21_533_011n, 13_628_994n],
          ["USD", 428_087_400n, 0n, 428_087_400n, 0n], // R0061: USD 4,280,874.00 in cents
        ],
        true,
      ],
      ["payments.csv", 76, 73, 2, 1, [["IDR", 536_101_049n, 511_162_604n, 12_727_390n, 12_211_055n]], true],
      ["expenses.csv", 90, 89, 1, 0, [["IDR", 50_296_820n, 49_462_041n, 834_779n, 0n]], true],
    ]);
    for (const f of q.files) {
      expect(f.rowsInFigures + f.rows.excluded + f.rows.duplicate + f.rows.superseded).toBe(f.rowCount);
      expect(f.control).toBe("pass");
      expect(f.unsummed).toBe(0);
      for (const a of f.amounts) {
        expect(a.inFigures.amount + a.byStatus.excluded.amount + a.byStatus.duplicate.amount + a.byStatus.superseded.amount).toBe(a.source.amount);
        expect(IN_FIGURES.reduce((n, s) => n + a.byStatus[s].amount, 0n)).toBe(a.inFigures.amount);
      }
    }
  });

  it("the source side is what the files hold, read without our loader", () => {
    for (const entity of ["reservation", "payment", "expense"] as const) {
      const file = fromFile(entity);
      const totals = q.files.find((f) => f.entity === entity)!;
      expect(totals.rowCount, entity).toBe(file.rows);
      expect(totals.amounts.map((a) => a.source)).toEqual([...file.amounts].map(([c, units]) => toMoney(units, c)));
    }
  });

  it("the figures side is what the calculator receives; the rest is the report «excluded automatically»", () => {
    const files = new Map(q.files.map((f) => [f.entity, f]));
    const inFigures = (entity: string) => files.get(entity as never)!.amounts[0]!.inFigures;
    const { input } = snapshot;
    expect(inFigures("reservation")).toEqual(total(input.reservations.map((r) => r.gross)));
    expect(inFigures("payment")).toEqual(total(input.payments.map((p) => p.amount)));
    expect(inFigures("expense")).toEqual(total(input.expenses.map((e) => e.amount)));
    expect(input.reservations.length + input.payments.length + input.expenses.length).toBe(
      ["reservation", "payment", "expense"].reduce((n, e) => n + files.get(e as never)!.rowsInFigures, 0),
    );

    for (const f of q.files) {
      const out = q.excluded.filter((e) => e.record.entity === f.entity);
      expect(out.length, f.fileName).toBe(f.rows.excluded + f.rows.duplicate);
      for (const a of f.amounts) {
        const mine = out.filter((e) => e.record.amount!.currency === a.currency).map((e) => e.record.amount!);
        expect(total(mine, a.currency)).toEqual(add(a.byStatus.excluded, a.byStatus.duplicate));
      }
    }
  });

  it("DQ-90 counts the same rows by status", () => {
    for (const f of q.files) {
      const dq90 = q.checks.get(f.fileName)!.find((c) => c.ruleId === "DQ-90")!;
      expect((dq90.result.details as { byStatus: unknown }).byStatus, f.fileName).toEqual(f.rows);
      const idrByStatus = (dq90.result.details as { amountByStatus: Record<string, bigint> }).amountByStatus;
      const idrTotals = f.amounts.find((a) => a.currency === "IDR");
      // DQ-90 sums IDR only (`amountIdr`): R0061 in USD is not in its totals, nor in the IDR line here.
      if (idrTotals !== undefined) for (const [s, v] of Object.entries(idrTotals.byStatus)) expect(idrByStatus[s], `${f.fileName} ${s}`).toBe(v.amount);
    }
  });
});

describe("per rule", () => {
  it("every unit of the rule's area has one result; fails add up to the list of problems", () => {
    const area = (entities: readonly string[]) =>
      entities.reduce((n, e) => n + (e === "file" ? ENTITIES.length : (snapshot.dataset.rows as Record<string, readonly unknown[]>)[e]!.length), 0);
    for (const r of q.rules) {
      const { pass, fail, skip, error } = r.outcomes;
      expect(pass + fail + skip + error, r.id).toBe(area(r.entities));
      expect(error, r.id).toBe(0);
    }
    expect(q.rules.map((r) => r.id)).toEqual(snapshot.rules.map((r) => r.id));
    expect(q.rules.reduce((n, r) => n + r.outcomes.fail, 0)).toBe(q.issues.length);
    expect(q.issues.length).toBe(401);
  });

  it("fails by action and the amount in question, in the rule's own terms", () => {
    const of = (id: string) => q.rules.find((r) => r.id === id)!;
    expect(of("DQ-05").failsByAction).toEqual({ hold: 42, exclude: 1 });
    expect(of("DQ-12")).toMatchObject({ failsByAction: { decide: 86 }, amount: idr(801_601_913n) }); // GBV in overlaps
    expect(of("DQ-16")).toMatchObject({ failsByAction: { review: 109 }, amount: idr(841_172_821n) }); // shortfall at check-in
    expect(of("DQ-11")).toMatchObject({ failsByAction: { info: 30 }, amount: idr(0n) }); // marketing fee on direct bookings: information
    expect(of("DQ-15")).toMatchObject({ failsByAction: { info: 7 }, amount: idr(0n) }); // nothing to sum
    expect(of("DQ-03")).toMatchObject({ outcomes: { pass: 357, fail: 0, skip: 0, error: 0 }, failsByAction: {} });
  });

  it("problems in run order of the rules, then by row; each with the row it is on", () => {
    expect(q.issues.slice(0, 3).map((i) => [i.ruleId, i.record.recordKey, i.action])).toEqual([
      ["DQ-01", "P0075", "duplicate"],
      ["DQ-01", "R0015", "duplicate"],
      ["DQ-04", "E0017", "exclude"],
    ]);
    const hold = q.issues.filter((i) => i.ruleId === "DQ-05" && i.action === "hold");
    expect(hold.map((i) => i.record)).toEqual(q.held);
    for (const i of q.issues) expect(i.record.failed).toContainEqual({ ruleId: i.ruleId, action: i.action });
  });
});

describe("per row: which rules it passed and which it did not", () => {
  it("every row has a result of every rule whose area covers it, in run order", () => {
    for (const record of snapshot.records) {
      const expected = snapshot.rules.filter((r) => r.entities.includes(record.entity)).map((r) => r.id);
      const checks = q.checks.get(record.unitId)!;
      expect(checks.map((c) => c.ruleId), record.unitId).toEqual(expected);
      expect(checks.filter((c) => c.result.outcome === "fail").map((c) => ({ ruleId: c.ruleId, action: c.action }))).toEqual(record.failed);
      for (const c of checks) if (c.result.outcome === "skip") expect(c.result.reason, `${record.unitId} ${c.ruleId}`).toBeTruthy();
    }
  });

  it("excluded automatically: duplicates and exclusions with the rules that decided", () => {
    expect(q.excluded.map((e) => [e.record.recordKey, e.fileName, e.record.status, e.causes.map((c) => c.ruleId), e.record.amount])).toEqual([
      ["E0017", "expenses.csv", "excluded", ["DQ-04"], idr(834_779n)],
      ["P0017", "payments.csv", "excluded", ["DQ-04"], idr(12_727_390n)],
      ["P0036", "payments.csv", "excluded", ["DQ-05"], idr(0n)],
      ["P0075", "payments.csv", "duplicate", ["DQ-01"], idr(12_211_055n)],
      ["R0015", "reservations.csv", "duplicate", ["DQ-01"], idr(13_628_994n)],
      ["R0034", "reservations.csv", "excluded", ["DQ-04"], idr(14_462_943n)],
      ["R0061", "reservations.csv", "excluded", ["DQ-06"], money(428_087_400n, "USD")],
      ["R0072", "reservations.csv", "excluded", ["DQ-09"], idr(7_070_068n)],
    ]);
    for (const e of q.excluded) for (const c of e.causes) expect(c.result.outcome).toBe("fail");
  });
});

describe("cases (VALIDATION_PLAN.md 7.5)", () => {
  const cases = q.villas.flatMap((v) => v.cases);

  it("35 cases on 18 villas: 32 conflict groups and 3 modified bookings outside them", () => {
    expect(q.caseCount).toBe(35);
    expect(cases.filter((c) => c.type === "conflict")).toHaveLength(32);
    expect(cases.filter((c) => c.type === "modification").map((c) => c.caseKey).sort()).toEqual(["M:R0143", "M:R0144", "M:R0147"]);
    expect(q.villas).toHaveLength(18); // 17 villas with overlaps + V011 with a lone modified booking
    expect(q.villas.map((v) => v.propertyId)).toEqual([...q.villas.map((v) => v.propertyId)].sort());
    for (const v of q.villas) {
      expect(v.name).not.toBeNull();
      for (const c of v.cases) for (const r of c.rows) expect(r.record.propertyId).toBe(v.propertyId);
    }
  });

  it("a case holds the reservations waiting for a decision, and their payments wait with them", () => {
    const rows = cases.flatMap((c) => c.rows);
    expect(rows).toHaveLength(89);
    expect(new Set(rows.map((r) => r.record.unitId)).size).toBe(89);
    expect(rows.every((r) => r.record.status === "pending")).toBe(true);
    expect(snapshot.records.filter((r) => r.entity === "reservation" && r.status === "pending")).toHaveLength(89);
    expect(rows.flatMap((r) => r.paymentIds).sort()).toEqual(q.held.map((p) => p.recordKey).sort());
    expect(q.held).toHaveLength(42);
  });

  it("the largest group: V003 in September, 8 bookings, 16 pairs, up to 5 a night", () => {
    const v003 = q.villas.find((v) => v.propertyId === "V003")!;
    const c = v003.cases[0]!;
    expect(c).toMatchObject({
      caseKey: "V003:R0017,R0029,R0039,R0096,R0101,R0102,R0103,R0128",
      from: "2026-09-03",
      to: "2026-09-20",
      pairs: 16,
      maxPerNight: 5,
      gross: idr(66_497_616n),
    });
    expect(c.rows.map((r) => [r.record.recordKey, r.checkIn, r.nights])).toEqual([
      ["R0039", "2026-09-03", 6],
      ["R0096", "2026-09-06", 8],
      ["R0017", "2026-09-09", 2],
      ["R0102", "2026-09-10", 4],
      ["R0103", "2026-09-12", 7],
      ["R0101", "2026-09-13", 4],
      ["R0128", "2026-09-13", 3],
      ["R0029", "2026-09-14", 6],
    ]);
    const byKey = new Map(c.rows.map((r) => [r.record.recordKey, r]));
    expect(byKey.get("R0096")).toMatchObject({ paid: idr(5_957_178n), paymentIds: ["P0048"] }); // paid, overlaps the unpaid R0017
    expect(byKey.get("R0017")).toMatchObject({ paid: null, paymentIds: [] });
    expect(byKey.get("R0102")!.flags).toEqual(["DQ-08", "DQ-16"]); // other rules, not the ones that made the case
    expect(byKey.get("R0017")!.overlaps).toEqual([
      { with: "R0096", from: "2026-09-09", to: "2026-09-11", nights: 2, kind: "partial" },
      { with: "R0102", from: "2026-09-10", to: "2026-09-11", nights: 1, kind: "partial" },
    ]);
  });

  it("order of review within a villa: same dates, then with a modified booking, then partial by date", () => {
    const v008 = q.villas.find((v) => v.propertyId === "V008")!;
    expect(v008.cases.map((c) => [c.caseKey, c.kinds, c.hasModified])).toEqual([
      ["V008:R0033,R0056", ["same_dates"], false],
      ["V008:R0027,R0112,R0146", ["modified_version", "partial"], true],
      ["V008:R0031,R0080", ["partial"], false],
      ["V008:R0042,R0097,R0127", ["partial"], false],
    ]);
    const v002 = q.villas.find((v) => v.propertyId === "V002")!;
    expect(v002.cases.map((c) => c.type)).toEqual(["conflict", "conflict", "modification", "modification"]);
    const lone = v002.cases[2]!;
    expect(lone).toMatchObject({ pairs: 0, maxPerNight: 1 });
    expect(lone.rows[0]!.overlaps).toEqual([]);
  });
});

describe("edge cases on small data", () => {
  it("versions of one key are cases of the villa of their rows; amounts that did not parse are counted, not summed", async () => {
    const s = await snapshotOf({
      property: [PROPERTY, { ...PROPERTY, property_name: "Villa 01 renamed" }],
      commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, management_fee_rate: "0.2" }],
      reservation: [RESERVATION],
      payment: [PAYMENT, { ...PAYMENT, payment_id: "P0002", reservation_id: "" }],
      expense: [EXPENSE, { ...EXPENSE, amount: "300000" }, { ...EXPENSE, expense_id: "E0002", amount: "lots" }],
    });
    const quality = qualityOf(s);
    expect(qualityOf(s)).toBe(quality); // once per snapshot

    expect(quality.villas).toHaveLength(1);
    const [villa] = quality.villas;
    expect(villa!.propertyId).toBe("V001");
    expect(villa!.cases.map((c) => [c.type, c.entity, c.caseKey, c.from, c.gross, c.maxPerNight])).toEqual([
      ["version", "commission_rule", "V:commission_rule:V001@2026-09-01", null, null, 0],
      ["version", "expense", "V:expense:E0001", null, money(550_000n, "IDR"), 0],
      ["version", "property", "V:property:V001", null, null, 0],
    ]);
    const property = villa!.cases[2]!;
    expect(property.rows.map((r) => [r.record.lineNo, r.reservationStatus, r.checkIn, r.nights, r.paid, r.paymentIds])).toEqual([
      [2, null, null, null, null, []],
      [3, null, null, null, null, []],
    ]);

    const expenses = quality.files.find((f) => f.entity === "expense")!;
    expect(expenses).toMatchObject({ rowCount: 3, unsummed: 1, rows: { pending: 2, excluded: 1 } });
    expect(expenses.amounts).toEqual([
      expect.objectContaining({ currency: "IDR", source: idr(550_000n), inFigures: idr(550_000n) }),
    ]);
    expect(quality.files.find((f) => f.entity === "property")!).toMatchObject({ amountColumn: null, amounts: [], unsummed: 0 });
  });

  it("without DQ-90 the totals are shown but not confirmed", async () => {
    const dataset = datasetFrom({ property: [PROPERTY], reservation: [RESERVATION] });
    const report = await runOn(dataset, { checks: CHECKS.filter((c) => c.id !== "DQ-90") });
    const s = buildSnapshot({ source: { kind: "csv", label: "<memory>" }, dataset, report, checks: defaultRegistry().checks, policies: DEFAULT_POLICIES });
    const files = qualityOf(s).files;
    expect(files.map((f) => [f.control, f.balanced])).toEqual(ENTITIES.map(() => [null, false]));
    expect(files.find((f) => f.entity === "reservation")!.rows.review).toBe(1); // unpaid at check-in
  });
});
