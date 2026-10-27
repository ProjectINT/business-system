import { describe, expect, it } from "vitest";
import { describeContract } from "../testing/contract";
import { COMMISSION_RULE, PAYMENT, PROPERTY, RESERVATION, datasetFrom } from "../testing/fixture";
import { contextBefore, resultFor, runOn, skipsAlone, statusOf } from "../testing/run";
import { dq19 } from "./dq19-payment-property-matches";

const ds = datasetFrom({
  property: [PROPERTY, { ...PROPERTY, property_id: "V002" }],
  commission_rule: [COMMISSION_RULE],
  reservation: [RESERVATION],
  payment: [PAYMENT, { ...PAYMENT, payment_id: "P0002", property_id: "V002" }, { ...PAYMENT, payment_id: "P0003", reservation_id: "R0099" }],
});

describeContract(dq19, contextBefore(dq19, ds));

describe("DQ-19", () => {
  it("passes a payment on the reservation's villa and flags another villa", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-19", "P0001").outcome).toBe("pass");
    expect(resultFor(report, "DQ-19", "P0002")).toMatchObject({
      outcome: "fail",
      details: { paymentProperty: "V002", reservationProperty: "V001" },
      relatedKeys: ["R0001"],
      amountIdr: 2550000n,
    });
    expect(statusOf(report, "P0002")).toBe("review");
  });

  it("skips a payment already out (DQ-05), and alone unparsed values and unknown reservations", async () => {
    const report = await runOn(ds);
    expect(resultFor(report, "DQ-19", "P0003").reason).toBe("row excluded, duplicate or superseded by an earlier rule");
    const bad = datasetFrom({
      reservation: [RESERVATION, { ...RESERVATION, reservation_id: "R0002" }, { ...RESERVATION, reservation_id: "R0002", gross_booking_value: "5" }],
      payment: [
        { ...PAYMENT, reservation_id: "" },
        { ...PAYMENT, payment_id: "P0002", property_id: "" },
        { ...PAYMENT, payment_id: "P0003", reservation_id: "R0099" },
        { ...PAYMENT, payment_id: "P0004", reservation_id: "R0002" },
      ],
    });
    expect(await skipsAlone(dq19, bad)).toEqual({
      P0001: "reservation_id not parsed (DQ-03)",
      P0002: "property_id not parsed (DQ-03)",
      P0003: "reservation missing or excluded (DQ-05)",
      P0004: "reservation has several versions (DQ-02)",
    });
  });
});
