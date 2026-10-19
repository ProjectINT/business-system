// Golden figures of the whole sample (CALCULATION_MODULE.md 11.6): the portfolio for September,
// October and the whole period, fixed in numbers. They depend on the DQ statuses, so a change in a
// rule or in the calculator shows up here as a diff. Cross-checked once by an independent pass over
// the raw CSV (plain BigInt, no lib/ code): nights, GBV, OTA (and its split by channel), MF, expenses, owner balance, cash — equal to the rupiah.
import { describe, expect, it } from "vitest";
import type { Money } from "../calc";
import { dashboardOf, headlineOf, type Headline } from "./dashboard";
import { reconciliationOf } from "./reconciliation";
import { filtersOf, sampleSnapshot } from "./testing/snapshot";

const snapshot = await sampleSnapshot();

function amounts(h: Headline): Record<string, number | bigint> {
  return Object.fromEntries(
    Object.entries(h).map(([k, v]: [string, number | Money]) => [k, typeof v === "number" ? v : v.amount]),
  );
}

const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };
const OCTOBER = { from: "2026-10-01", to: "2026-10-31" };

describe("snapshot of the sample", () => {
  it("today as given, range of every date, 20 villas in 4 clusters", () => {
    expect(snapshot.today).toBe("2026-10-19");
    expect(snapshot.range).toEqual({ from: "2026-09-01", to: "2026-11-05" });
    expect(snapshot.properties).toHaveLength(20);
    expect(snapshot.clusters).toEqual(["Bukit", "Canggu", "Sanur", "Ubud"]);
    expect(snapshot.report.status).toBe("succeeded");
    expect(snapshot.records).toHaveLength(357);
    expect(snapshot.failures).toEqual([]);
  });

  it("calculator input: clean, review and pending rows; excluded and duplicate stay out", () => {
    const { input } = snapshot;
    // 151 rows − R0034, R0061, R0072 excluded − the copy of R0015
    expect(input.reservations).toHaveLength(147);
    // 76 − P0017, P0036 excluded − the copy of P0075
    expect(input.payments).toHaveLength(73);
    expect(input.expenses).toHaveLength(89); // 90 − E0017
    expect(input.commissionRules).toHaveLength(20);
    const ids = new Set(input.reservations.map((r) => r.reservationId));
    for (const out of ["R0034", "R0061", "R0072"]) expect(ids.has(out)).toBe(false);
    expect(input.reservations.filter((r) => r.reservationId === "R0015")).toHaveLength(1);
    // pending rows (DQ-12 overlap, DQ-13 modified) are under review at level 1
    expect(input.reservations.find((r) => r.reservationId === "R0143")?.dqStatus).toBe("review");
    expect(input.reservations.find((r) => r.reservationId === "R0102")?.dqStatus).toBe("review");
    const statuses = new Map(snapshot.records.map((r) => [r.unitId, r.status]));
    const clean = input.reservations.filter((r) => r.dqStatus === "clean").length;
    expect(clean).toBe(snapshot.records.filter((r) => r.entity === "reservation" && r.status === "clean").length);
    expect(statuses.size).toBe(357);
  });
});

describe("golden: V011, September 2026 — the same numbers as lib/calc/golden.test.ts", () => {
  const d = dashboardOf(snapshot, filtersOf(snapshot, { ...SEPTEMBER, property: "V011" }));

  it("headline", () => {
    expect(amounts(d.headline)).toEqual({
      nights: 15,
      gross: 26791884n,
      refund: 0n,
      otaFee: 3603816n,
      otaFeeOta: 1994230n,
      otaFeeDirect: 1609586n,
      netRental: 23188068n,
      managementFee: 4554620n,
      operatingExpenses: 1103588n,
      ownerBalance: 17529860n,
      received: 10302481n,
      paidExpenses: 325200n,
      netCashFlow: 9977281n,
      expected: 23188068n,
      reconciledReceived: 10302481n,
      difference: -12885587n,
    });
    expect(d.properties.map((p) => p.propertyId)).toEqual(["V011"]);
    expect(d.failures).toEqual({ calc: [], data: [] });
  });

  it("reconciliation", () => {
    const r = reconciliationOf(snapshot, filtersOf(snapshot, { ...SEPTEMBER, property: "V011" }));
    expect(r.rows.map((l) => [l.reservationId, l.status, l.difference.amount])).toEqual([
      ["R0020", "matched", 0n],
      ["R0067", "not_received", -6973788n],
      ["R0110", "matched", 0n],
      ["R0143", "not_received", -5911799n],
    ]);
  });
});

describe("golden: the portfolio, records under review included", () => {
  it("whole period 2026-09-01 … 2026-11-05", () => {
    const d = dashboardOf(snapshot, filtersOf(snapshot));
    expect(amounts(d.headline)).toEqual({
      nights: 685,
      gross: 1256651523n,
      refund: 0n,
      otaFee: 183008072n,
      otaFeeOta: 143965529n,
      otaFeeDirect: 39042543n,
      netRental: 1073643451n,
      managementFee: 223293180n,
      operatingExpenses: 49462041n,
      ownerBalance: 800888230n,
      received: 511162604n,
      paidExpenses: 41079463n,
      netCashFlow: 470083141n,
      expected: 1073643451n,
      reconciledReceived: 511162604n,
      difference: -562480847n,
    });
    expect(d.byStatus).toEqual({ matched: 79, not_received: 62, underpaid: 0, overpaid: 0, not_due: 6 });
    expect(d.cancellations.count).toBe(12);
    expect(d.cancellations.gross.amount).toBe(86163513n);
    expect(d.failures).toEqual({ calc: [], data: [] });
  });

  it("September", () => {
    const d = dashboardOf(snapshot, filtersOf(snapshot, SEPTEMBER));
    expect(amounts(d.headline)).toEqual({
      nights: 393,
      gross: 716599606n,
      refund: 0n,
      otaFee: 105451267n,
      otaFeeOta: 80170599n,
      otaFeeDirect: 25280668n,
      netRental: 611148339n,
      managementFee: 127113711n,
      operatingExpenses: 22546329n,
      ownerBalance: 461488299n,
      received: 263553633n,
      paidExpenses: 16405266n,
      netCashFlow: 247148367n,
      expected: 548081851n,
      reconciledReceived: 269064407n,
      difference: -279017444n,
    });
    expect(d.byStatus).toEqual({ matched: 42, not_received: 36, underpaid: 0, overpaid: 0, not_due: 0 });
  });

  it("October", () => {
    const d = dashboardOf(snapshot, filtersOf(snapshot, OCTOBER));
    expect(amounts(d.headline)).toEqual({
      nights: 292,
      gross: 540051917n,
      refund: 0n,
      otaFee: 77556805n,
      otaFeeOta: 63794930n,
      otaFeeDirect: 13761875n,
      netRental: 462495112n,
      managementFee: 96179469n,
      operatingExpenses: 26915712n,
      ownerBalance: 339399931n,
      received: 221842916n,
      paidExpenses: 24674197n,
      netCashFlow: 197168719n,
      expected: 505398997n,
      reconciledReceived: 232645947n,
      difference: -272753050n,
    });
    // not_due: check-in after 2026-10-19, the payment is not due yet (paymentDue: check_in)
    expect(d.byStatus).toEqual({ matched: 36, not_received: 26, underpaid: 0, overpaid: 0, not_due: 5 });
  });
});

describe("golden: records under review left out (review=off)", () => {
  const d = dashboardOf(snapshot, filtersOf(snapshot, { review: "off" }));

  it("only clean records remain: DQ-16, DQ-23 and the cases put most of the data under review", () => {
    expect(amounts(d.headline)).toEqual({
      nights: 55,
      gross: 121313115n,
      refund: 0n,
      otaFee: 16721293n,
      otaFeeOta: 13753839n,
      otaFeeDirect: 2967454n, // marketing fee of R0035 and R0100: DQ-11 is information, nothing else flags them
      netRental: 104591822n,
      managementFee: 21455838n,
      operatingExpenses: 37386639n,
      ownerBalance: 45749345n,
      received: 24450887n,
      paidExpenses: 29004061n,
      netCashFlow: -4553174n,
      expected: 104591822n,
      reconciledReceived: 24450887n,
      difference: -80140935n,
    });
  });

  it("the part under review is the difference between the two runs, whatever the switch", () => {
    const on = dashboardOf(snapshot, filtersOf(snapshot));
    expect(d.underReview).toEqual(on.underReview);
    expect(on.underReview.gross.amount).toBe(1256651523n - 121313115n);
    expect(amounts(on.underReview)).toEqual(
      Object.fromEntries(
        Object.entries(amounts(headlineOf(on.overview.portfolio))).map(([k, v]) => [
          k,
          typeof v === "number" ? v - (amounts(d.headline)[k] as number) : v - (amounts(d.headline)[k] as bigint),
        ]),
      ),
    );
  });
});

describe("outside the figures", () => {
  it("whole period: excluded and duplicate rows by file, USD counted apart", () => {
    const d = dashboardOf(snapshot, filtersOf(snapshot));
    expect(d.outside.groups.map((g) => [g.entity, g.status, g.count, g.amount.amount, g.otherCurrency])).toEqual([
      ["reservation", "excluded", 3, 21533011n, 1], // R0034 (V999) + R0072 (refund > gross); R0061 in USD
      ["reservation", "duplicate", 1, 13628994n, 0], // the copy of R0015
      ["payment", "excluded", 2, 12727390n, 0], // P0017 (V999) + P0036 (0, R0072 excluded)
      ["payment", "duplicate", 1, 12211055n, 0], // the copy of P0075
      ["expense", "excluded", 1, 834779n, 0], // E0017 (V777)
    ]);
    expect(d.outside.records.map((r) => r.recordKey).sort()).toEqual([
      "E0017",
      "P0017",
      "P0036",
      "P0075",
      "R0015",
      "R0034",
      "R0061",
      "R0072",
    ]);
  });

  it("a villa filter hides rows of unknown villas", () => {
    const d = dashboardOf(snapshot, filtersOf(snapshot, { cluster: "Ubud" }));
    expect(d.outside.records.map((r) => r.propertyId)).not.toContain("V999");
  });

  it("reconciliation: P0017 and P0036 reached no reservation", () => {
    const r = reconciliationOf(snapshot, filtersOf(snapshot));
    expect(r.unallocated.map((u) => [u.paymentId, u.reservationId, u.amount?.amount, u.ruleIds])).toEqual([
      ["P0017", "R0034", 12727390n, ["DQ-04"]],
      ["P0036", "R0072", 0n, ["DQ-05"]],
    ]);
    expect(r.unallocatedAmount.amount).toBe(12727390n);
    expect(r.rows).toHaveLength(147); // every admitted reservation checks out by 2026-11-05
  });
});
