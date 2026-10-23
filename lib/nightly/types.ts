// Shared shapes of the nightly module: exception rows as final-test/output_schema.json prints them
// and the dedup counters. Every list that reaches the report is built from these.

/** Where a code comes from: the event feed, the chosen snapshot, the commission rules (fees.ts), payments, the report window (report.ts). */
export type ExceptionCode =
  | "CONFLICTING_EVENT" // one source_event_id, different content
  | "AMBIGUOUS_VERSION" // equal latest updated_at, different content (ТЗ 14)
  | "UNKNOWN_PROPERTY" // villa not in properties (ТЗ 14)
  | "CURRENCY_MISMATCH" // booking not in the villa's base currency, or that currency is not IDR (ТЗ 12)
  | "INVALID_STAY" // check_out ≤ check_in
  | "UNKNOWN_STATUS" // reservation status not confirmed | modified; payment status not received | pending
  | "NO_COMMISSION_RULE" // a night without a rule (ТЗ 14)
  | "AMBIGUOUS_COMMISSION_RULE" // a night with several rules
  | "CONFLICTING_PAYMENT" // one payment_id, different content
  | "PENDING_PAYMENT" // ТЗ 11
  | "UNMATCHED_PAYMENT" // ТЗ 13
  | "PAYMENT_HELD" // received payment of a reservation on hold
  | "OUTSIDE_REPORT_MONTHS"; // a night or a payment outside report_months

/** One row of `exceptions`. `action` is always `hold`: the amount did not enter the confirmed totals (plan 4.5). */
export interface Exception {
  readonly record_type: "reservation" | "payment";
  readonly record_id: string;
  readonly code: ExceptionCode;
  readonly action: "hold";
}

export interface Dedup {
  readonly reservation_event_duplicates: number;
  readonly superseded_reservation_versions: number;
  readonly payment_duplicates: number;
}
