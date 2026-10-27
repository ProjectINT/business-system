import { describe, expect, it } from "vitest";
import { calculateAccruals } from "./accrual";
import { estimateOwnerBalance, estimateOwnerShare, OWNER_BALANCE_GAPS } from "./owner-balance";
import { idr } from "./primitives/money";
import { scope } from "./testing/fixtures";

describe("owner estimate and owner balance", () => {
  it("owner estimate = net rental − MF; owner balance = owner estimate − expenses; both always flagged as estimates", () => {
    const accruals = { ...calculateAccruals([], [], scope()), ownerEstimate: idr(830n), operatingExpenses: idr(900n) };
    expect(estimateOwnerShare(accruals)).toEqual({ amount: idr(830n), isEstimate: true, missing: [...OWNER_BALANCE_GAPS] });
    expect(estimateOwnerBalance(accruals)).toEqual({ amount: idr(-70n), isEstimate: true, missing: [...OWNER_BALANCE_GAPS] });
    expect(OWNER_BALANCE_GAPS).toContain("owner_payouts");
    expect(OWNER_BALANCE_GAPS).not.toContain("ota_fee_bearer"); // v2: ТЗ п. 8 takes the OTA fee off the owner's estimate
  });
});
