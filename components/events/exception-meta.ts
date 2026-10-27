// How a person sees an exception code of the nightly report (docs/EVENTS_VISUALIZATION_PLAN.md, 2.5):
// its kind by what the system does (VALIDATION_PLAN.md 6.1), the mark of the matching data-quality rule
// in the colour of its action — the same mark as on /import/data-quality, learnt once — and what
// would fix it. The code itself stays in the tests; the page shows words and the mark.
import type { Action } from "@/lib/dq";
import type { ExceptionCode } from "@/lib/nightly";

/** decide — a person picks one of the records that arrived; exclude — fixed in the source; wait — pending money or outside the report. */
export type ExceptionKind = "decide" | "exclude" | "wait";

export const KIND_META: Record<ExceptionKind, { label: string; description: string; action: Action }> = {
  decide: {
    label: "Decide",
    description: "Disputed values: different records arrived where one is expected. A person picks the one to believe.",
    action: "decide",
  },
  exclude: {
    label: "Excluded — fix in the source",
    description: "Left out of the figures until the source data is corrected. No button: the fix is new data, not a choice.",
    action: "exclude",
  },
  wait: {
    label: "Waiting or outside the report",
    description: "Money not received yet, waiting for its booking, or dated outside the report months. Shown, not counted.",
    action: "info",
  },
};

export const KIND_ORDER: readonly ExceptionKind[] = ["decide", "exclude", "wait"];

export interface CodeMeta {
  readonly kind: ExceptionKind;
  /** The data-quality rule whose mark the code borrows; null — the code has its own tag. */
  readonly rule: string | null;
  /** The tag of a code without a rule. */
  readonly tag?: string;
  readonly label: string;
  readonly description: string;
  /** What would fix it, in one line. */
  readonly fix: string;
}

/** The order of the catalogue: by kind, then as a person meets them. */
export const CODE_META: Readonly<Record<ExceptionCode, CodeMeta>> = {
  AMBIGUOUS_VERSION: {
    kind: "decide",
    rule: "DQ-02",
    label: "Two latest versions",
    description: "Versions of a booking with different content share the latest updated_at: nothing says which came last.",
    fix: "Pick the version that stands",
  },
  CONFLICTING_EVENT: {
    kind: "decide",
    rule: "DQ-02",
    label: "One event, different content",
    description: "Copies of one source event differ: the feed for this booking cannot be trusted until one copy is picked.",
    fix: "Pick the copy that is right",
  },
  CONFLICTING_PAYMENT: {
    kind: "decide",
    rule: "DQ-02",
    label: "One payment, different content",
    description: "Copies of one payment differ: there is no single amount, so it is in no sum at all.",
    fix: "Pick the copy that is right",
  },
  UNKNOWN_PROPERTY: {
    kind: "exclude",
    rule: "DQ-04",
    label: "Unknown villa",
    description: "The booking's villa is not in the list of properties.",
    fix: "Add the villa to properties, or correct the booking's villa",
  },
  CURRENCY_MISMATCH: {
    kind: "exclude",
    rule: "DQ-06",
    label: "Wrong currency",
    description: "The booking is not in the villa's currency, or that currency is not IDR. Amounts are never converted.",
    fix: "An approved exchange rate, or the booking re-sent in IDR",
  },
  INVALID_STAY: {
    kind: "exclude",
    rule: "DQ-07",
    label: "No nights",
    description: "Check-out is not after check-in: the stay has no night to accrue.",
    fix: "Correct the stay dates in the source",
  },
  NO_COMMISSION_RULE: {
    kind: "exclude",
    rule: "DQ-17",
    label: "No commission rate",
    description: "A night of the stay has no management-fee rule: no rate is invented.",
    fix: "A commission rule for the villa covering these nights",
  },
  AMBIGUOUS_COMMISSION_RULE: {
    kind: "exclude",
    rule: "DQ-17",
    label: "Two commission rates",
    description: "Two rules of the villa cover the same night: the rate cannot be told.",
    fix: "Close the older rule the day before the new one starts",
  },
  UNKNOWN_STATUS: {
    kind: "exclude",
    rule: "DQ-03",
    label: "Unknown status",
    description: "A status the rules do not describe: no rule is invented for it.",
    fix: "A known status in the source",
  },
  UNMATCHED_PAYMENT: {
    kind: "exclude",
    rule: "DQ-05",
    label: "No such booking",
    description: "Money received for a booking nobody sent: kept as unmatched, not given to any villa.",
    fix: "The booking's events, or the payment linked to the right booking",
  },
  PENDING_PAYMENT: {
    kind: "wait",
    rule: "DQ-25",
    label: "Not received yet",
    description: "A pending payment is not money yet: held apart from what was received.",
    fix: "Nothing: it counts once it arrives as received",
  },
  PAYMENT_HELD: {
    kind: "wait",
    rule: "DQ-05",
    label: "Booking not in the figures",
    description: "Money received for a booking that is held: counting it would give the villa cash with no accrual behind it.",
    fix: "Whatever releases its booking",
  },
  OUTSIDE_REPORT_MONTHS: {
    kind: "wait",
    rule: null,
    tag: "OUT",
    label: "Outside the report months",
    description: "Nights or a payment dated outside the report months: listed, not in the figures of the period.",
    fix: "Nothing: it belongs to another period",
  },
};

export const CODE_ORDER = Object.keys(CODE_META) as ExceptionCode[];

/** UNKNOWN_STATUS borrows the rule of the record: the format rule for a booking, the payment-status rule for a payment. */
export function ruleOfCode(code: ExceptionCode, record_type: "reservation" | "payment"): string | null {
  if (code === "UNKNOWN_STATUS" && record_type === "payment") return "DQ-25";
  return CODE_META[code].rule;
}

/**
 * The action of one exception on one record, which colours its mark. PAYMENT_HELD takes its booking's:
 * waiting for a decision (`hold`) or excluded with it. PENDING_PAYMENT and OUTSIDE_REPORT_MONTHS are for information.
 */
export function actionOf(code: ExceptionCode, reservationInDispute = false): Action {
  if (code === "PAYMENT_HELD") return reservationInDispute ? "hold" : "exclude";
  return KIND_META[CODE_META[code].kind].action;
}
