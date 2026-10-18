import { describe, expect, it } from "vitest";
import { calculateAccruals } from "./accrual";
import { estimateOwnerBalance, OWNER_BALANCE_GAPS } from "./owner-balance";
import { idr } from "./primitives/money";
import { scope } from "./testing/fixtures";

describe("estimateOwnerBalance", () => {
  it("is net rental − MF − expenses, always flagged as an estimate", () => {
    const accruals = { ...calculateAccruals([], [], scope()), netRental: idr(1000n), managementFee: idr(170n), operatingExpenses: idr(900n) };
    expect(estimateOwnerBalance(accruals)).toEqual({ amount: idr(-70n), isEstimate: true, missing: [...OWNER_BALANCE_GAPS] });
    expect(OWNER_BALANCE_GAPS).toContain("owner_payouts");
  });
});
