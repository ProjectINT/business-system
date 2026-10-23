// The public case against the hand-made table of docs/FINAL_TEST_PLAN.md, section 5, the shape of
// final-test/output_schema.json, the agreement of the figures with each other, and determinism.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import publicCase from "../../final-test/case_public.json";
import outputSchema from "../../final-test/output_schema.json";
import { formatReport, runCase, type ReportView } from "./index";
import { parseCase } from "./schema";
import { selectSnapshots } from "./snapshots";
import { figures } from "./testing/fixtures";

type Figures = ReportView["total"];
const FIGURE_KEYS = Object.keys(figures(0, 0, 0, 0, 0, 0)) as (keyof Figures)[];

const report = runCase(publicCase);

const sumBy = (rows: readonly Figures[], key: keyof Figures) => rows.reduce((acc, row) => acc + row[key], 0);

describe("golden: case_public.json against the table of the plan (section 5)", () => {
  it("monthly: November accrues two nights of R101 and receives the advance of R202", () => {
    expect(report.monthly).toEqual({
      "2026-11": figures(2_200_000, 220_000, 330_000, 374_000, 1_496_000, 2_200_000),
      "2026-12": figures(4_200_000, 420_000, 330_000, 640_000, 3_230_000, 4_180_000),
    });
  });

  it("total is the sum of the two months", () => {
    expect(report.total).toEqual(figures(6_400_000, 640_000, 660_000, 1_014_000, 4_726_000, 6_380_000));
  });

  it("by_property: V01 accrues in both months and is paid in December; V02 is paid in November for December", () => {
    expect(report.by_property).toEqual({
      V01: {
        "2026-11": figures(2_200_000, 220_000, 330_000, 374_000, 1_496_000, 0),
        "2026-12": figures(2_200_000, 220_000, 330_000, 440_000, 1_430_000, 4_180_000),
      },
      V02: {
        "2026-11": figures(0, 0, 0, 0, 0, 2_200_000),
        "2026-12": figures(2_000_000, 200_000, 0, 200_000, 1_800_000, 0),
      },
    });
  });

  it("cash_unmatched 100 000 (P404 → R999), cash_held 50 000 (P303 pending)", () => {
    expect(report.cash_unmatched_idr).toBe(100_000);
    expect(report.cash_held_idr).toBe(50_000);
  });

  it("dedup: one repeated event, one superseded version, one repeated payment", () => {
    expect(report.dedup).toEqual({
      reservation_event_duplicates: 1,
      superseded_reservation_versions: 1,
      payment_duplicates: 1,
    });
  });

  it("exceptions: R303 in USD, P303 pending, P404 without a reservation — all hold", () => {
    expect(report.exceptions).toEqual([
      { record_type: "reservation", record_id: "R303", code: "CURRENCY_MISMATCH", action: "hold" },
      { record_type: "payment", record_id: "P303", code: "PENDING_PAYMENT", action: "hold" },
      { record_type: "payment", record_id: "P404", code: "UNMATCHED_PAYMENT", action: "hold" },
    ]);
  });

  it("trace: R101 is E_R101_V2 over E_R101_V1, 4 nights, 17% in November and 20% in December; R303 is held", () => {
    expect(report.trace).toEqual({
      R101: {
        selected_source_event_id: "E_R101_V2",
        superseded_source_event_ids: ["E_R101_V1"],
        hold: false,
        nights: 4,
        monthly: {
          "2026-11": { nights: 2, rate_bps: [1700], accommodation_gross_idr: 2_200_000, management_fee_idr: 374_000 },
          "2026-12": { nights: 2, rate_bps: [2000], accommodation_gross_idr: 2_200_000, management_fee_idr: 440_000 },
        },
      },
      R202: {
        selected_source_event_id: "E_R202",
        superseded_source_event_ids: [],
        hold: false,
        nights: 2,
        monthly: { "2026-12": { nights: 2, rate_bps: [1000], accommodation_gross_idr: 2_000_000, management_fee_idr: 200_000 } },
      },
      R303: { selected_source_event_id: "E_R303", superseded_source_event_ids: [], hold: true, nights: 0, monthly: {} },
    });
  });

  it("header: schema_version 1 and the case_id of the input", () => {
    expect(report.schema_version).toBe(1);
    expect(report.case_id).toBe("FINAL_VILLA_2026_PUBLIC_A");
  });

  it("has the keys of output_schema.json, and no others, at every level the schema spells out", () => {
    const keysOf = (o: object) => Object.keys(o).sort();
    expect(keysOf(report)).toEqual(keysOf(outputSchema));
    expect(keysOf(report.monthly)).toEqual(keysOf(outputSchema.monthly));
    expect(keysOf(report.monthly["2026-11"]!)).toEqual(keysOf(outputSchema.monthly["2026-11"]));
    expect(keysOf(report.total)).toEqual(keysOf(outputSchema.total));
    expect(keysOf(report.by_property)).toEqual(keysOf(outputSchema.by_property));
    expect(keysOf(report.by_property.V01!)).toEqual(keysOf(outputSchema.by_property.V01));
    expect(keysOf(report.dedup)).toEqual(keysOf(outputSchema.dedup));
    expect(keysOf(report.exceptions[0]!)).toEqual(keysOf(outputSchema.exceptions[0]!));
    // The trace row carries the schema's three keys plus the superseded versions and the hold flag.
    expect(keysOf(report.trace.R101!)).toEqual(expect.arrayContaining(keysOf(outputSchema.trace.R101)));
  });
});

describe("golden: the figures agree with each other", () => {
  it("the night lines of every accepted reservation sum to its snapshot, to the rupiah", () => {
    const snapshots = selectSnapshots(parseCase(publicCase));
    const accepted = snapshots.reservations.filter((r) => !r.hold);
    expect(accepted.map((r) => r.reservation_id)).toEqual(["R101", "R202"]);
    for (const r of accepted) {
      const total = (key: "accommodation_gross_idr" | "pbjt_idr" | "ota_fee_idr") => r.nights.reduce((acc, n) => acc + n[key], 0n);
      expect(total("accommodation_gross_idr")).toBe(r.snapshot.accommodation_gross_idr);
      expect(total("pbjt_idr")).toBe(r.snapshot.pbjt_idr);
      expect(total("ota_fee_idr")).toBe(r.snapshot.ota_fee_idr);
    }
  });

  it("Σ by_property = monthly for every figure and month, and Σ monthly = total", () => {
    const villas = Object.values(report.by_property);
    for (const [month, row] of Object.entries(report.monthly)) {
      for (const key of FIGURE_KEYS) {
        expect(sumBy(villas.map((v) => v[month]!), key), `${key} of ${month}`).toBe(row[key]);
      }
    }
    for (const key of FIGURE_KEYS) {
      expect(sumBy(Object.values(report.monthly), key), key).toBe(report.total[key]);
    }
  });

  it("owner_estimate = accommodation − ota_fee − management_fee at every level (ТЗ 8)", () => {
    const rows = [report.total, ...Object.values(report.monthly), ...Object.values(report.by_property).flatMap((v) => Object.values(v))];
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.owner_estimate_idr).toBe(row.accommodation_gross_idr - row.ota_fee_idr - row.management_fee_idr);
    }
  });

  it("P101 is what the OTA remits for R101, accommodation + PBJT − OTA fee (ТЗ 3): December cash of V01, not reduced again", () => {
    expect(report.by_property.V01!["2026-12"]!.cash_received_idr).toBe(4_400_000 + 440_000 - 660_000);
  });

  it("R101 accrues in two months and is paid in one; R202 is paid in the month before its stay (ТЗ 7)", () => {
    expect(Object.keys(report.trace.R101!.monthly)).toEqual(["2026-11", "2026-12"]);
    expect(report.by_property.V01!["2026-11"]!.cash_received_idr).toBe(0);
    expect(report.by_property.V02!["2026-11"]!.cash_received_idr).toBe(2_200_000);
    expect(report.by_property.V02!["2026-11"]!.accommodation_gross_idr).toBe(0);
  });

  it("the management fee of R101 is 814 000: 374 000 at 17% plus 440 000 at 20%, not one rate for the stay", () => {
    const months = Object.values(report.trace.R101!.monthly);
    expect(months.reduce((acc, m) => acc + m.management_fee_idr, 0)).toBe(814_000);
    expect(months.map((m) => m.rate_bps)).toEqual([[1700], [2000]]);
  });
});

describe("determinism (plan, phase 3)", () => {
  const text = formatReport(report);

  it("no bigint reaches the view: the report is plain JSON", () => {
    const walk = (v: unknown): void => {
      expect(typeof v).not.toBe("bigint");
      if (typeof v === "object" && v !== null) Object.values(v).forEach(walk);
    };
    walk(report);
    expect(JSON.parse(text)).toEqual(report);
  });

  it("two runs give the same bytes", () => {
    expect(formatReport(runCase(publicCase))).toBe(text);
    expect(formatReport(runCase(JSON.parse(JSON.stringify(publicCase))))).toBe(text);
  });

  it("the text is two-space JSON with sorted keys at every level and a final newline", () => {
    const parsed: unknown = JSON.parse(text);
    expect(text).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
    const sorted = (v: unknown): void => {
      if (typeof v !== "object" || v === null) return;
      if (Array.isArray(v)) return v.forEach(sorted);
      const keys = Object.keys(v);
      expect(keys).toEqual([...keys].sort());
      Object.values(v).forEach(sorted);
    };
    sorted(parsed);
  });

  it("any order of the five input arrays gives the same bytes", () => {
    const permutation = <T>(list: T[]) => fc.shuffledSubarray(list, { minLength: list.length, maxLength: list.length });
    fc.assert(
      fc.property(
        permutation(publicCase.report_months),
        permutation(publicCase.properties),
        permutation(publicCase.commission_rules),
        permutation(publicCase.reservation_events),
        permutation(publicCase.payments),
        (report_months, properties, commission_rules, reservation_events, payments) => {
          const shuffled = { ...publicCase, report_months, properties, commission_rules, reservation_events, payments };
          expect(formatReport(runCase(shuffled))).toBe(text);
        },
      ),
    );
  });
});
