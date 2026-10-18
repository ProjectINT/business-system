import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES, type CalcPolicies } from "./policies";
import { idr } from "./primitives/money";
import { reconcile, reconcileReservation } from "./reconciliation";
import { calculateReservation } from "./reservation";
import { expectCode } from "./testing/expect";
import { date, NOVEMBER, OCTOBER, PAY, RES, RULES, scope, synthetic } from "./testing/fixtures";
import type { PaymentInput, ReservationInput } from "./types";

const calc = (r: ReservationInput) => calculateReservation(r, RULES, DEFAULT_POLICIES);
const pay = (id: string, reservationId: string, amount: bigint, day = "2026-09-25"): PaymentInput => ({
  paymentId: id,
  reservationId,
  propertyId: "V011",
  paymentDate: date(day),
  amount: idr(amount),
  dqStatus: "clean",
});

// GBV 1000, no OTA fee → expected 1000; stay 20.09–24.09.
const x = calc(synthetic({ gross: idr(1000n), otaFee: idr(0n) }));
const ended = date("2026-10-15");
const before = date("2026-09-19");
const byDue = (paymentDue: CalcPolicies["paymentDue"]): CalcPolicies => ({ ...DEFAULT_POLICIES, paymentDue });

describe("reconcileReservation", () => {
  // Payment is due at check-in (PLAN.md 7.4): a shortfall is "not due" only before the stay starts.
  it.each<[string, bigint[], string, string]>([
    ["equal", [1000n], "2026-10-15", "matched"],
    ["several payments", [400n, 600n], "2026-10-15", "matched"],
    ["nothing after the stay", [], "2026-10-15", "not_received"],
    ["part after the stay", [999n], "2026-10-15", "underpaid"],
    ["more than expected", [1001n], "2026-10-15", "overpaid"],
    ["more than expected before check-in", [1001n], "2026-09-19", "overpaid"],
    ["nothing before check-in", [], "2026-09-19", "not_due"],
    ["check-in day itself is due", [], "2026-09-20", "not_received"],
    ["part paid during the stay", [999n], "2026-09-22", "underpaid"],
  ])("%s → %s", (_, amounts, asOf, status) => {
    const line = reconcileReservation(
      x,
      amounts.map((a, i) => pay(`P${i}`, "X0001", a)),
      date(asOf),
      DEFAULT_POLICIES,
    );
    expect(line.status).toBe(status);
    expect(line.difference.amount).toBe(amounts.reduce((a, b) => a + b, 0n) - 1000n);
  });

  it("paymentDue 'check_out': a shortfall during the stay is not due yet; the check-out day is", () => {
    expect(reconcileReservation(x, [], date("2026-09-22"), byDue("check_out")).status).toBe("not_due");
    expect(reconcileReservation(x, [], date("2026-09-22"), byDue("check_in")).status).toBe("not_received");
    expect(reconcileReservation(x, [], date("2026-09-24"), byDue("check_out")).status).toBe("not_received");
    expectCode(() => reconcileReservation(x, [], ended, byDue("x" as CalcPolicies["paymentDue"])), "INVALID_POLICY");
  });

  it("R0102/P0051 → matched: 3 998 667 = 3 898 667 − (−100 000)", () => {
    expect(reconcileReservation(calc(RES.R0102), [PAY.P0051], ended, DEFAULT_POLICIES)).toMatchObject({
      expected: idr(3998667n),
      received: idr(3998667n),
      difference: idr(0n),
      status: "matched",
    });
  });

  it("payments of other reservations do not count; payment date does not matter", () => {
    const other = pay("P1", "R9999", 1000n);
    const late = pay("P2", "X0001", 1000n, "2026-12-01");
    expect(reconcileReservation(x, [other], ended, DEFAULT_POLICIES).status).toBe("not_received");
    expect(reconcileReservation(x, [late], before, DEFAULT_POLICIES).status).toBe("matched");
  });

  it("cancelled reservation expects nothing", () => {
    expect(reconcileReservation(calc(RES.R0131), [], ended, DEFAULT_POLICIES).status).toBe("matched");
  });
});

describe("reconcile", () => {
  const policies = (reconciliationDate: CalcPolicies["reconciliationDate"]) => ({ ...DEFAULT_POLICIES, reconciliationDate });

  it("R0003: check_out → November, last_night → October", () => {
    const c = [calc(RES.R0003)];
    expect(reconcile(c, [], scope({ period: NOVEMBER, asOf: date("2026-11-05") }), policies("check_out")).lines).toHaveLength(1);
    expect(reconcile(c, [], scope({ period: OCTOBER }), policies("check_out")).lines).toHaveLength(0);
    expect(reconcile(c, [], scope({ period: OCTOBER }), policies("last_night")).lines).toHaveLength(1);
    expect(reconcile(c, [], scope({ period: NOVEMBER }), policies("last_night")).lines).toHaveLength(0);
  });

  it("totals, statuses, sorted lines; payment in another period counts", () => {
    const c = [calc(RES.R0110), calc(RES.R0020), calc(RES.R0067)];
    const r = reconcile(c, [PAY.P0055, PAY.P0010, pay("P9", "R0067", 1n, "2026-11-30")], scope(), DEFAULT_POLICIES);
    expect(r.lines.map((l) => l.reservationId)).toEqual(["R0020", "R0067", "R0110"]);
    expect(r.byStatus).toEqual({ matched: 2, not_received: 0, underpaid: 1, overpaid: 0, not_due: 0 });
    expect(r.expected).toEqual(idr(2990297n + 7312184n + 6973788n));
    expect(r.received).toEqual(idr(2990297n + 7312184n + 1n));
    expect(r.difference).toEqual(idr(1n - 6973788n));
  });

  it("review payments are dropped when review is off", () => {
    const review = { ...PAY.P0010, dqStatus: "review" as const };
    const c = [calc({ ...RES.R0020, dqStatus: "clean" })];
    expect(reconcile(c, [review], scope({ includeReview: false }), DEFAULT_POLICIES).received).toEqual(idr(0n));
    expect(reconcile(c, [review], scope(), DEFAULT_POLICIES).received).toEqual(review.amount);
  });

  it("rejects bad input", () => {
    expectCode(
      () => reconcile([], [{ ...PAY.P0010, dqStatus: "excluded" as PaymentInput["dqStatus"] }], scope(), DEFAULT_POLICIES),
      "RECORD_NOT_ADMITTED",
    );
    expectCode(
      () => reconcile([x], [], scope(), policies("x" as CalcPolicies["reconciliationDate"])),
      "INVALID_POLICY",
    );
  });
});
