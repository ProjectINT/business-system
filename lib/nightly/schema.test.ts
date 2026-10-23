import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import publicCase from "../../final-test/case_public.json";
import { CaseSchema, parseCase } from "./schema";
import { rawCase, rawEvent, rawPayment, type Raw } from "./testing/fixtures";

/** Paths of the issues of an invalid input, "a.b.0" style. */
function issuePaths(input: unknown): string[] {
  const result = CaseSchema.safeParse(input);
  if (result.success) throw new Error("expected the input to be rejected");
  return result.error.issues.map((i) => i.path.join("."));
}

const withEvent = (overrides: Raw) => rawCase({ reservation_events: [rawEvent(overrides)] });

describe("parseCase", () => {
  it("parses the public case: bigint amounts, calendar dates, instants, plain numbers for bps", () => {
    const c = parseCase(publicCase);
    expect(c.case_id).toBe("FINAL_VILLA_2026_PUBLIC_A");
    expect(c.report_months).toEqual(["2026-11", "2026-12"]);
    expect(c.properties).toEqual([
      { property_id: "V01", base_currency: "IDR" },
      { property_id: "V02", base_currency: "IDR" },
    ]);
    expect(c.commission_rules).toHaveLength(3);
    expect(c.commission_rules[0]).toEqual({
      property_id: "V01",
      effective_from: "2026-11-01",
      effective_to: "2026-11-30",
      rate_bps: 1700,
    });
    expect(c.reservation_events).toHaveLength(5);
    expect(c.reservation_events[2]).toEqual({
      source_event_id: "E_R101_V2",
      reservation_id: "R101",
      property_id: "V01",
      updated_at: Date.UTC(2026, 10, 20, 8),
      status: "modified",
      check_in: "2026-11-29",
      check_out: "2026-12-03",
      accommodation_gross_idr: 4_400_000n,
      pbjt_idr: 440_000n,
      ota_fee_idr: 660_000n,
      currency: "IDR",
    });
    expect(c.reservation_events[4]?.currency).toBe("USD");
    expect(c.payments).toHaveLength(5);
    expect(c.payments[3]).toEqual({
      payment_id: "P303",
      reservation_id: "R101",
      payment_date: "2026-12-15",
      amount_idr: 50_000n,
      status: "pending",
    });
  });

  it("ignores unknown fields at every level", () => {
    const c = parseCase(
      rawCase({
        notes: "ignored",
        properties: [{ property_id: "V01", base_currency: "IDR", name: "Villa One" }],
        reservation_events: [rawEvent({ guest_name: "ignored" })],
        payments: [rawPayment({ method: "ignored" })],
      }),
    );
    expect(c).not.toHaveProperty("notes");
    expect(Object.keys(c.properties[0]!)).toEqual(["property_id", "base_currency"]);
    expect(c.reservation_events[0]).not.toHaveProperty("guest_name");
    expect(c.payments[0]).not.toHaveProperty("method");
  });

  it("throws ZodError on a malformed file", () => {
    expect(() => parseCase(withEvent({ accommodation_gross_idr: "4400000" }))).toThrow(ZodError);
    expect(() => parseCase(null)).toThrow(ZodError);
    expect(() => parseCase("case")).toThrow(ZodError);
    expect(() => parseCase([])).toThrow(ZodError);
  });

  describe("updated_at", () => {
    it("is the instant: Z and an offset for the same moment parse to the same number", () => {
      const [z, offset, fraction] = parseCase(
        rawCase({
          reservation_events: [
            rawEvent({ updated_at: "2026-11-20T08:00:00Z" }),
            rawEvent({ updated_at: "2026-11-20T12:00:00+04:00" }),
            rawEvent({ updated_at: "2026-11-20T08:00:00.000Z" }),
          ],
        }),
      ).reservation_events;
      expect(z?.updated_at).toBe(Date.UTC(2026, 10, 20, 8));
      expect(offset?.updated_at).toBe(z?.updated_at);
      expect(fraction?.updated_at).toBe(z?.updated_at);
    });

    it.each(["2026-11-20T08:00:00", "2026-11-20", "20.11.2026 08:00", "", 1763625600000])(
      "%j is not an instant with a zone",
      (updated_at) => expect(issuePaths(withEvent({ updated_at }))).toContain("reservation_events.0.updated_at"),
    );
  });

  describe("amounts", () => {
    it.each([4400000.5, -1, 2 ** 53, "4400000", null, undefined])("%j is not whole rupiah ≥ 0", (amount) => {
      for (const field of ["accommodation_gross_idr", "pbjt_idr", "ota_fee_idr"]) {
        expect(issuePaths(withEvent({ [field]: amount }))).toContain(`reservation_events.0.${field}`);
      }
      expect(issuePaths(rawCase({ payments: [rawPayment({ amount_idr: amount })] }))).toContain("payments.0.amount_idr");
    });

    it("accepts 0 and the largest safe integer", () => {
      const c = parseCase(withEvent({ accommodation_gross_idr: 0, pbjt_idr: Number.MAX_SAFE_INTEGER }));
      expect(c.reservation_events[0]?.accommodation_gross_idr).toBe(0n);
      expect(c.reservation_events[0]?.pbjt_idr).toBe(9_007_199_254_740_991n);
    });
  });

  describe("dates and months", () => {
    it.each(["2026-02-30", "29.11.2026", "2026-11-1", "2026-11-29T00:00:00Z", ""])("%j is not a calendar date", (d) => {
      expect(issuePaths(withEvent({ check_in: d }))).toContain("reservation_events.0.check_in");
      expect(issuePaths(withEvent({ check_out: d }))).toContain("reservation_events.0.check_out");
      expect(issuePaths(rawCase({ payments: [rawPayment({ payment_date: d })] }))).toContain("payments.0.payment_date");
    });

    it.each(["2026-13", "2026-1", "202611", "2026-00", "2026-11-01"])("%j is not a month", (m) =>
      expect(issuePaths(rawCase({ report_months: [m] }))).toContain("report_months.0"),
    );

    it("needs at least one report month, each once", () => {
      expect(issuePaths(rawCase({ report_months: [] }))).toContain("report_months");
      expect(issuePaths(rawCase({ report_months: ["2026-11", "2026-12", "2026-11"] }))).toEqual(["report_months.2"]);
    });
  });

  describe("properties and rules", () => {
    it("lists each villa once", () => {
      const properties = [
        { property_id: "V01", base_currency: "IDR" },
        { property_id: "V01", base_currency: "USD" },
      ];
      expect(issuePaths(rawCase({ properties }))).toEqual(["properties.1"]);
    });

    it("effective_to: null or absent is open-ended, the same day as effective_from is allowed, earlier is not", () => {
      const rule = (overrides: Raw) => ({ property_id: "V01", effective_from: "2026-11-01", rate_bps: 1700, ...overrides });
      const c = parseCase(
        rawCase({
          commission_rules: [rule({ effective_to: null }), rule({}), rule({ effective_to: "2026-11-01" })],
        }),
      );
      expect(c.commission_rules.map((r) => r.effective_to)).toEqual([null, null, "2026-11-01"]);
      expect(issuePaths(rawCase({ commission_rules: [rule({ effective_to: "2026-10-31" })] }))).toEqual([
        "commission_rules.0.effective_to",
      ]);
    });

    it.each([10001, -1, 17.5, "1700", null])("rate_bps %j is not basis points in [0, 10000]", (rate_bps) =>
      expect(
        issuePaths(rawCase({ commission_rules: [{ property_id: "V01", effective_from: "2026-11-01", rate_bps }] })),
      ).toContain("commission_rules.0.rate_bps"),
    );

    it("accepts 0 and 10000 bps", () => {
      const rules = [0, 10000].map((rate_bps) => ({ property_id: "V01", effective_from: "2026-11-01", rate_bps }));
      expect(parseCase(rawCase({ commission_rules: rules })).commission_rules.map((r) => r.rate_bps)).toEqual([0, 10000]);
    });
  });

  it("rejects empty ids and missing sections", () => {
    expect(issuePaths(withEvent({ source_event_id: "" }))).toContain("reservation_events.0.source_event_id");
    expect(issuePaths(withEvent({ reservation_id: "" }))).toContain("reservation_events.0.reservation_id");
    expect(issuePaths(rawCase({ payments: [rawPayment({ payment_id: "" })] }))).toContain("payments.0.payment_id");
    expect(issuePaths(rawCase({ case_id: "" }))).toContain("case_id");
    const withoutPayments = rawCase();
    delete withoutPayments.payments;
    expect(issuePaths(withoutPayments)).toContain("payments");
  });

  it("keeps status and currency as text: unknown values are a question for snapshots, not a format error", () => {
    const c = parseCase(
      rawCase({ reservation_events: [rawEvent({ status: "cancelled", currency: "EUR" })], payments: [rawPayment({ status: "refunded" })] }),
    );
    expect(c.reservation_events[0]).toMatchObject({ status: "cancelled", currency: "EUR" });
    expect(c.payments[0]?.status).toBe("refunded");
  });
});
