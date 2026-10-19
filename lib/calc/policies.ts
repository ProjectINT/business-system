import { CalcError } from "./errors";
import type { RoundingMode } from "./primitives/rounding";

export interface CalcPolicies {
  /** 'nights' — pro rata by night (PLAN.md, 7.3); 'checkout' — whole stay on the check-out date. */
  readonly revenueRecognition: "nights" | "checkout";
  readonly rounding: RoundingMode;
  /** Which period a reservation is reconciled in: by check-out date or by its last night. */
  readonly reconciliationDate: "check_out" | "last_night";
  /**
   * When the payout is due: 'check_in' — the villa is paid in full before check-in (PLAN.md decision
   * log 2026-10-18), so only a stay that has not started by today is `not_due`; 'check_out' — by the end of the stay.
   */
  readonly paymentDue: "check_in" | "check_out";
}

export const DEFAULT_POLICIES: CalcPolicies = Object.freeze({
  revenueRecognition: "nights",
  rounding: "half-up",
  reconciliationDate: "check_out",
  paymentDue: "check_in",
});

const ALLOWED: { readonly [K in keyof CalcPolicies]: readonly CalcPolicies[K][] } = {
  revenueRecognition: ["nights", "checkout"],
  rounding: ["half-up", "half-even"],
  reconciliationDate: ["check_out", "last_night"],
  paymentDue: ["check_in", "check_out"],
};

/** Policies come from the caller, so they are checked at runtime too. */
export function assertPolicies(policies: CalcPolicies): void {
  for (const key of Object.keys(ALLOWED) as (keyof CalcPolicies)[]) {
    if (!(ALLOWED[key] as readonly string[]).includes(policies[key])) {
      throw new CalcError("INVALID_POLICY", `Unknown ${key}: ${String(policies[key])}`, {
        policy: key,
        value: String(policies[key]),
      });
    }
  }
}
