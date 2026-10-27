// Golden figures of the whole sample (CALCULATION_MODULE.md 10.6): the portfolio for September,
// October and the whole period, fixed in numbers. They depend on the DQ statuses, so a change in a
// rule or in the calculator shows up here as a diff. Cross-checked once by an independent pass over
// the raw CSV (plain BigInt, no lib/ code): nights, GBV, OTA (and its split by channel), MF, expenses, owner balance, cash — equal to the rupiah.
// MF per night (phase 6b, 2026-10-27): rechecked by an independent per-night pass (HALF_UP per night) over the raw rows the checks admit.
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
      otaFeeUnknown: 0n,
      pbjt: 0n, // the CSV has no PBJT
      netRental: 23188068n,
      managementFee: 4554621n, // v1, one rounding per stay: 4 554 620
      ownerEstimate: 18633447n,
      operatingExpenses: 1103588n,
      ownerBalance: 17529859n,
      received: 10302481n,
      pending: 0n, // every payment of the sample is received
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
      otaFeeUnknown: 0n,
      pbjt: 0n, // the CSV has no PBJT
      netRental: 1073643451n,
      managementFee: 223293162n, // v1: 223 293 180
      ownerEstimate: 850350289n,
      operatingExpenses: 49462041n,
      ownerBalance: 800888248n,
      received: 511162604n,
      pending: 0n, // every payment of the sample is received
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
      otaFeeUnknown: 0n,
      pbjt: 0n, // the CSV has no PBJT
      netRental: 611148339n,
      managementFee: 127113685n, // v1: 127 113 711
      ownerEstimate: 484034654n,
      operatingExpenses: 22546329n,
      ownerBalance: 461488325n,
      received: 263553633n,
      pending: 0n, // every payment of the sample is received
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
      otaFeeUnknown: 0n,
      pbjt: 0n, // the CSV has no PBJT
      netRental: 462495112n,
      managementFee: 96179477n, // v1: 96 179 469
      ownerEstimate: 366315635n,
      operatingExpenses: 26915712n,
      ownerBalance: 339399923n,
      received: 221842916n,
      pending: 0n, // every payment of the sample is received
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

  it("only clean records remain: the cases put most of the data under review", () => {
    // v2 (phase 6b): DQ-16 is information and DQ-23 is merged into it, so 34 reservations and 15 payments
    // they alone kept under review are clean — v1 had 55 nights and 121 313 115 here. Rechecked by an
    // independent pass over the raw rows (amounts by night, MF per night, cash by date, reconciliation by check-out).
    expect(amounts(d.headline)).toEqual({
      nights: 224,
      gross: 426292712n,
      refund: 0n,
      otaFee: 62567706n,
      otaFeeOta: 51411703n,
      otaFeeDirect: 11156003n, // marketing fee of the clean direct bookings: DQ-11 is information
      otaFeeUnknown: 0n,
      pbjt: 0n, // the CSV has no PBJT
      netRental: 363725006n,
      managementFee: 74900366n,
      ownerEstimate: 288824640n,
      operatingExpenses: 37386639n,
      ownerBalance: 251438001n,
      received: 128717604n,
      pending: 0n, // every payment of the sample is received
      paidExpenses: 29004061n,
      netCashFlow: 99713543n,
      expected: 363725006n,
      reconciledReceived: 128717604n,
      difference: -235007402n,
    });
  });

  it("the part under review is the difference between the two runs, whatever the switch", () => {
    const on = dashboardOf(snapshot, filtersOf(snapshot));
    expect(d.underReview).toEqual(on.underReview);
    expect(on.underReview.gross.amount).toBe(1256651523n - 426292712n);
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
      ["payment", "excluded", 1, 12727390n, 0], // P0017 (V999); P0036 (0, R0072 excluded) is held, in the cash block
      ["payment", "duplicate", 1, 12211055n, 0], // the copy of P0075
      ["expense", "excluded", 1, 834779n, 0], // E0017 (V777)
    ]);
    expect(d.outside.records.map((r) => r.recordKey).sort()).toEqual([
      "E0017",
      "P0017",
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

  it("money apart: P0036 is held, 0 IDR — its reservation R0072 is excluded; nothing unallocated; P0017 is a wrong row (V999), excluded", () => {
    const r = reconciliationOf(snapshot, filtersOf(snapshot));
    expect(r.apart.held.map((u) => [u.paymentId, u.reservationId, u.amount?.amount, u.reason, u.ruleIds])).toEqual([
      ["P0036", "R0072", 0n, "reservation_excluded", ["DQ-15", "DQ-05"]],
    ]);
    expect(r.apart.heldAmount.amount).toBe(0n);
    expect(r.apart.unallocated).toEqual([]); // v1 listed P0017 and P0036 as one "unallocated" list
    expect(snapshot.records.find((x) => x.recordKey === "P0017")!.money).toBe("excluded");
    expect(r.rows).toHaveLength(147); // every admitted reservation checks out by 2026-11-05
  });
});
