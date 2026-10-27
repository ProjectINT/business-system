import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, PAYMENT, PROPERTY, RESERVATION, apart, datasetFrom } from "../testing/fixture";
import { contextBefore, resultFor, runAlone, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq05 } from "./dq05-payment-reservation-valid";

const pay = (payment_id: string, reservation_id: string, extra: Record<string, string> = {}) => ({ ...PAYMENT, payment_id, reservation_id, ...extra });

const ds = datasetFrom({
  property: [PROPERTY],
  commission_rule: [COMMISSION_RULE],
  reservation: [
    ...apart([
      RESERVATION,
      { ...RESERVATION, reservation_id: "R0002", property_id: "V999" }, // excluded
      { ...RESERVATION, reservation_id: "R0003", status: "modified" }, // pending (DQ-13)
      { ...RESERVATION, reservation_id: "R0004" },
      { ...RESERVATION, reservation_id: "R0004", gross_booking_value: "1" }, // second version → DQ-02
      { ...RESERVATION, reservation_id: "R0005" },
    ]),
    { ...RESERVATION, reservation_id: "R0005", check_in: "2026-09-21", check_out: "2026-09-24" }, // exact copy of the R0005 above (apart gives it 21–24)
  ],
  payment: [
    PAYMENT,
    pay("P0002", "R0099"),
    pay("P0003", "R0002"),
    pay("P0004", "R0003"),
    pay("P0005", "R0004"),
    pay("P0006", "R0005"),
    pay("P0007", "R0001", { property_id: "V999" }), // out by DQ-04
  ],
});

describeContract(dq05, contextBefore(dq05, ds));

describe("DQ-05", () => {
  it("passes a payment of a live reservation; a duplicate copy of the reservation does not matter", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-05", "P0001").outcome).toBe("pass");
    expect(report.verdicts.filter((v) => v.recordKey === "R0005").map((v) => v.status)).toEqual(["clean", "duplicate"]); // unpaid at check-in is information (DQ-16)
    expect(resultFor(report, "DQ-05", "P0006").outcome).toBe("pass");
  });

  it("excludes a payment whose reservation is missing or excluded: unallocated money", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-05", "P0002")).toMatchObject({ outcome: "fail", details: { reservationId: "R0099", problem: "missing" }, amountIdr: 2550000n });
    expect(resultFor(report, "DQ-05", "P0002").action).toBeUndefined();
    expect(resultFor(report, "DQ-05", "P0003")).toMatchObject({ outcome: "fail", details: { problem: "reservation_excluded" }, relatedKeys: ["R0002"] });
    expect(statusOf(report, "P0002")).toBe("excluded");
    expect(statusOf(report, "P0003")).toBe("excluded");
  });

  it("holds a payment whose reservation waits for a human, by a case or by two versions", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-05", "P0004")).toMatchObject({ outcome: "fail", action: "hold", details: { problem: "reservation_pending" }, relatedKeys: ["R0003"] });
    expect(resultFor(report, "DQ-05", "P0005")).toMatchObject({ outcome: "fail", action: "hold", details: { problem: "reservation_versions" } });
    expect(statusOf(report, "P0004")).toBe("pending");
    expect(statusOf(report, "P0005")).toBe("pending");
    expect(report.verdicts.find((v) => v.recordKey === "P0004")!.ruleIds).toEqual(["DQ-05"]);
  });

  it("skips a payment already out, and alone one whose reservation id did not parse", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-05", "P0007").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const bad = datasetFrom({ reservation: [{ ...RESERVATION, reservation_id: "" }], payment: [{ ...PAYMENT, reservation_id: "" }, pay("P0002", "R0001"), pay("P0003", "R0001")] });
    expect(await skipsAlone(dq05, bad)).toEqual({ P0001: "reservation_id not parsed (DQ-03)" });
    const alone = await runAlone(dq05, bad); // a reservation without a key is no reservation; the lookup is cached per id
    expect(alone.filter((r) => r.outcome === "fail").map((r) => r.recordKey)).toEqual(["P0002", "P0003"]);
  });
});
