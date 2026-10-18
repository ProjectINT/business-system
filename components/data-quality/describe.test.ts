import { describe as group, expect, it } from "vitest";
import { qualityOf } from "@/lib/data";
import { sampleSnapshot } from "@/lib/data/testing/snapshot";
import type { RunReport } from "@/lib/dq";
import { apart, COMMISSION_RULE, datasetFrom, PAYMENT, PROPERTY, RESERVATION } from "@/lib/dq/testing/fixture";
import { runOn } from "@/lib/dq/testing/run";
import { describe } from "./describe";

/** Text that leaked a missing fact. */
const BROKEN = /\?|undefined|null|NaN|\[object/;

function fails(report: RunReport) {
  return [...report.results].flatMap(([ruleId, results]) => results.filter((r) => r.outcome === "fail").map((r) => ({ ruleId, r })));
}

group("describe", () => {
  it("words every problem of the sample files from its facts", async () => {
    const q = qualityOf(await sampleSnapshot());
    expect(q.issues).toHaveLength(401);
    for (const i of q.issues) {
      const text = describe(i.ruleId, i.result);
      expect(text, `${i.ruleId} ${i.record.unitId}`).toBeTruthy();
      expect(text, `${i.ruleId} ${i.record.unitId}`).not.toMatch(BROKEN);
    }
    const text = (ruleId: string, key: string) => describe(ruleId as `DQ-${string}`, q.issues.find((i) => i.ruleId === ruleId && i.record.recordKey === key)!.result);
    expect(text("DQ-01", "R0015")).toBe("Exact copy of line 16 of the same file");
    expect(text("DQ-04", "R0034")).toBe("Villa V999 is not in properties.csv");
    expect(text("DQ-05", "P0036")).toBe("Reservation R0072 is excluded by the checks");
    expect(text("DQ-06", "R0061")).toBe("In USD, the villa's currency is IDR · USD 4,280,874 for 4 nights = 1,070,218 a night, an IDR-sized amount");
    expect(text("DQ-08", "R0102")).toBe("OTA fee -100,000 is outside 0 … GBV 3,898,667");
    expect(text("DQ-09", "R0072")).toBe("Refund 7,970,068: the refund is above GBV 7,070,068; a refund on a confirmed reservation");
    expect(text("DQ-12", "R0017")).toBe("Overlaps R0096 2026-09-09 → 2026-09-11 (2 nights, partial), R0102 2026-09-10 → 2026-09-11 (1 night, partial)");
    expect(text("DQ-14", "P0051")).toBe("Paid 3,998,667 as GBV − OTA − refund gives, but more than GBV 3,898,667");
    expect(text("DQ-16", "R0017")).toBe("Nothing paid; 8,458,500 was due by check-in 2026-09-09");
    expect(text("DQ-23", "P0048")).toBe("Paid 2026-09-07, 1 day after check-in 2026-09-06, before check-out");
  });

  it("words the rules that stay quiet on the sample files", async () => {
    const ds = datasetFrom({
      property: [PROPERTY, { ...PROPERTY, property_id: "V002" }],
      commission_rule: [COMMISSION_RULE, { ...COMMISSION_RULE, effective_from: "2026-10-01", management_fee_rate: "0.17" }],
      reservation: [
        ...apart([
          RESERVATION,
          { ...RESERVATION, reservation_id: "R0003", gross_booking_value: "0" },
          { ...RESERVATION, reservation_id: "R0004", gross_booking_value: "4000000", ota_fee: "1000001" },
          { ...RESERVATION, reservation_id: "R0006", status: "cancelled", refund_amount: "1000000" },
          { ...RESERVATION, reservation_id: "R0007", property_id: "V002" },
        ]),
        { ...RESERVATION, reservation_id: "R0001", updated_at: "2026-09-05" }, // a second version of R0001
        { ...RESERVATION, reservation_id: "R0002", check_in: "2026-13-01" },
        { ...RESERVATION, reservation_id: "R0005", check_in: "2026-09-28", check_out: "2026-10-03" }, // the rate changes inside
      ],
      payment: [{ ...PAYMENT, payment_id: "P0002", reservation_id: "R0004", property_id: "V002", amount: "2999999" }],
    });
    const report = await runOn(ds);
    const words = new Map<string, string | null>();
    for (const { ruleId, r } of fails(report)) {
      const key = `${ruleId} ${r.recordKey ?? r.unitId}`;
      if (!words.has(key)) words.set(key, describe(ruleId, r)); // the first row of a key
    }
    for (const [key, text] of words) expect(text, key).not.toMatch(BROKEN);
    expect(words.get("DQ-02 R0001")).toBe("2 versions of this id with different content · updated_at 2026-09-01");
    expect(words.get("DQ-03 R0002")).toBe("check_in: not a calendar date YYYY-MM-DD (“2026-13-01”)");
    expect(words.get("DQ-07 R0003")).toBe("GBV 0 for 3 nights");
    expect(words.get("DQ-10 R0004")).toBe("OTA fee 1,000,001 is 25.00 % of GBV 4,000,000, above 25.00 %");
    expect(words.get("DQ-17 R0005")).toBe("Rate 0.15 at check-in becomes 0.17 from 2026-10-01");
    expect(words.get("DQ-17 R0007")).toBe("No commission rule in force on check-in 2026-09-17");
    expect(words.get("DQ-18 R0006")).toBe("Cancelled with a partial refund: 1,000,000 of 3,000,000 refunded, 2,000,000 retained");
    expect(words.get("DQ-19 P0002")).toBe("Payment on villa V002, its reservation on V001");
    expect(words.get("DQ-22 V001@2026-09-01")).toBe("Rate 0.15; overlaps V001@2026-10-01 2026-10-01 → open end, where V001@2026-10-01 applies");
  });

  it("a pass says nothing, a skip or an error gives its reason; an unknown rule still says it failed", () => {
    expect(describe("DQ-12", { outcome: "pass" })).toBeNull();
    expect(describe("DQ-12", { outcome: "skip", reason: "cancelled reservation" })).toBe("cancelled reservation");
    expect(describe("DQ-12", { outcome: "error", reason: "threw: boom" })).toBe("threw: boom");
    expect(describe("DQ-99", { outcome: "fail", details: {} })).toBe("Failed");
  });
});
