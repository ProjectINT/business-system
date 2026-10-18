// Labels and colours of the statuses the UI shows: rows after the checks (PLAN.md 5.2), reservations
// after reconciliation (PLAN.md 7.4), and the conditions that keep the owner balance an estimate (PLAN.md 7.6).
import type { OwnerBalanceGap, ReconciliationStatus } from "@/lib/calc";
import type { Action, Status } from "@/lib/dq";

export type ChipColor = "default" | "accent" | "success" | "warning" | "danger";

export const STATUS_META: Record<Status, { label: string; color: ChipColor; description: string }> = {
  clean: { label: "Clean", color: "success", description: "No issues, in the figures" },
  review: { label: "Review", color: "warning", description: "In the figures, flagged for a human check" },
  pending: {
    label: "Pending",
    color: "accent",
    description: "Overlap or modified booking: awaits a decision, counted as review until then",
  },
  excluded: { label: "Excluded", color: "danger", description: "Not in the figures, shown apart" },
  duplicate: { label: "Duplicate", color: "default", description: "Exact copy of another row, dropped" },
  superseded: { label: "Superseded", color: "default", description: "Replaced by a newer version" },
};

/** Statuses in the order the UI lists them. */
export const STATUS_ORDER: readonly Status[] = ["clean", "review", "pending", "excluded", "duplicate", "superseded"];

export const ACTION_LABEL: Record<Action, string> = {
  duplicate: "dropped as a duplicate",
  exclude: "excluded",
  decide: "awaits a decision",
  hold: "waits for its reservation's decision",
  review: "flagged for review",
  info: "for information",
};

export const RECONCILIATION_META: Record<ReconciliationStatus, { label: string; color: ChipColor; description: string }> = {
  matched: { label: "Matched", color: "success", description: "Received equals the expected payout" },
  underpaid: { label: "Underpaid", color: "warning", description: "Due, part of the payout received" },
  not_received: { label: "Not received", color: "danger", description: "Due, nothing received" },
  overpaid: { label: "Overpaid", color: "accent", description: "Received more than expected" },
  not_due: { label: "Not due", color: "default", description: "Check-in after the as-of date" },
};

export const RECONCILIATION_ORDER: readonly ReconciliationStatus[] = [
  "not_received",
  "underpaid",
  "overpaid",
  "matched",
  "not_due",
];

export const OWNER_BALANCE_GAP_LABEL: Record<OwnerBalanceGap, string> = {
  owner_payouts: "Payouts to owners",
  opening_balance: "Opening balances",
  taxes: "Taxes: PB1 on stays, VAT on management fees",
  ota_fee_bearer: "Who bears the OTA fee (assumed: the owner)",
  mf_base_on_refunds: "Management fee base when there are refunds",
  fx_rates: "Exchange rates",
};
