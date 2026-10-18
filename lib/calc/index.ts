// Public API of the calculation module (docs/CALCULATION_MODULE.md). Import only from "@/lib/calc".
export { CALC_ERROR_CODES, CalcError, isCalcError, type CalcErrorCode, type CalcErrorDetails } from "./errors";
export { DEFAULT_POLICIES, type CalcPolicies } from "./policies";
export * from "./primitives/money";
export * from "./primitives/rate";
export * from "./primitives/rounding";
export * from "./primitives/allocate";
export * from "./primitives/calendar";
export { commissionRulesOn, resolveCommissionRule, calculateManagementFee } from "./commission";
export {
  calculateNetRental,
  calculateExpectedPayout,
  calculateOwnerShare,
  calculateReservation,
  calculateReservations,
} from "./reservation";
export { calculateAccruals } from "./accrual";
export { calculateCashFlow } from "./cash";
export { reconcileReservation, reconcile } from "./reconciliation";
export { estimateOwnerBalance, OWNER_BALANCE_GAPS, type OwnerBalanceGap } from "./owner-balance";
export { calculateOverview } from "./overview";
export { toView, type View } from "./view";
export type * from "./types";
