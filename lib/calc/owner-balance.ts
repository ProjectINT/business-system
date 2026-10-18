import { sub } from "./primitives/money";
import type { Accruals, OwnerBalanceEstimate } from "./types";

/** Conditions from PLAN.md, 7.6 without which the owner balance is only an estimate. */
export const OWNER_BALANCE_GAPS = [
  "owner_payouts",
  "opening_balance",
  "taxes",
  "ota_fee_bearer",
  "mf_base_on_refunds",
  "direct_ota_fee_meaning",
  "fx_rates",
] as const;

export type OwnerBalanceGap = (typeof OWNER_BALANCE_GAPS)[number];

/** net rental − management fees − operating expenses. Always flagged as an estimate. */
export function estimateOwnerBalance(accruals: Accruals): OwnerBalanceEstimate {
  return {
    amount: sub(sub(accruals.netRental, accruals.managementFee), accruals.operatingExpenses),
    isEstimate: true,
    missing: [...OWNER_BALANCE_GAPS],
  };
}
