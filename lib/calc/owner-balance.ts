import { sub } from "./primitives/money";
import type { Accruals, OwnerBalanceEstimate } from "./types";

/** Conditions from PLAN.md, 7.6 without which the owner balance is only an estimate. */
export const OWNER_BALANCE_GAPS = [
  "owner_payouts",
  "opening_balance",
  "taxes",
  "mf_base_on_refunds",
  "fx_rates",
] as const;

export type OwnerBalanceGap = (typeof OWNER_BALANCE_GAPS)[number];

/** Owner estimate: net rental − management fees, before expenses (ТЗ п. 8). Always flagged as an estimate. */
export function estimateOwnerShare(accruals: Accruals): OwnerBalanceEstimate {
  return { amount: accruals.ownerEstimate, isEstimate: true, missing: [...OWNER_BALANCE_GAPS] };
}

/** Owner balance: owner estimate − operating expenses. Always flagged as an estimate. */
export function estimateOwnerBalance(accruals: Accruals): OwnerBalanceEstimate {
  return { amount: sub(accruals.ownerEstimate, accruals.operatingExpenses), isEstimate: true, missing: [...OWNER_BALANCE_GAPS] };
}
