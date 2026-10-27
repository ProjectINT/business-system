import type { CalcErrorCode } from "./errors";
import type { OwnerBalanceGap } from "./owner-balance";
import type { CalendarDate, Period } from "./primitives/calendar";
import type { Currency, Money } from "./primitives/money";
import type { Rate } from "./primitives/rate";

/** Only records admitted by DQ reach the calculator. */
export type DqStatus = "clean" | "review";

export type ReservationStatus = "confirmed" | "modified" | "cancelled";
export type FeeBasis = "gross_booking_value";
export type ExpenseStatus = "paid" | "pending";
export type Channel = "OTA" | "Direct";
/** pending — not money yet (ТЗ п. 11 of the final test); other statuses DQ-25 excludes. */
export type PaymentStatus = "received" | "pending";

export interface ReservationInput {
  readonly reservationId: string;
  readonly propertyId: string;
  readonly checkIn: CalendarDate;
  readonly checkOut: CalendarDate;
  readonly status: ReservationStatus;
  readonly gross: Money; // accommodation without PBJT: gross_booking_value (CSV), accommodation_gross_idr (feed)
  readonly pbjt: Money; // a liability, not revenue; the CSV has no column — 0 (PLAN.md 7.2)
  readonly otaFee: Money; // sign is not restricted: R0102 = −100 000 (DQ-08, review)
  readonly refund: Money;
  readonly channel: Channel | null; // null — unknown: the event feed has no channel, it is not guessed
  readonly dqStatus: DqStatus;
}

export interface CommissionRuleInput {
  readonly propertyId: string;
  readonly effectiveFrom: CalendarDate;
  readonly effectiveTo: CalendarDate | null; // inclusive; null — open-ended
  readonly rate: Rate;
  readonly feeBasis: FeeBasis;
}

export interface PaymentInput {
  readonly paymentId: string;
  readonly reservationId: string;
  readonly propertyId: string;
  readonly paymentDate: CalendarDate;
  readonly amount: Money;
  readonly status: PaymentStatus;
  readonly dqStatus: DqStatus;
}

export interface ExpenseInput {
  readonly expenseId: string;
  readonly propertyId: string;
  readonly expenseDate: CalendarDate;
  readonly amount: Money;
  readonly paymentStatus: ExpenseStatus;
  readonly dqStatus: DqStatus;
}

export interface NightLine {
  readonly date: CalendarDate; // the night from date to date + 1; check-out date under 'checkout'
  readonly nights: number; // 1 per night; the whole stay on the single 'checkout' line
  readonly rate: Rate | null; // the night's rate; null on the 'checkout' line, which may carry several
  readonly gross: Money;
  readonly pbjt: Money;
  readonly refund: Money;
  readonly otaFee: Money;
  readonly managementFee: Money; // rounded per night; on the 'checkout' line — the sum of the nights
}

export interface ReservationCalc {
  readonly reservationId: string;
  readonly propertyId: string;
  readonly checkIn: CalendarDate;
  readonly checkOut: CalendarDate;
  readonly channel: Channel | null;
  readonly dqStatus: DqStatus;
  readonly nights: number;
  readonly active: boolean; // confirmed | modified
  readonly rates: readonly Rate[]; // the different rates of the nights in night order; empty for a cancellation
  // Recognised amounts; all zero for a cancellation.
  readonly gross: Money;
  readonly pbjt: Money;
  readonly refund: Money;
  readonly otaFee: Money;
  readonly managementFee: Money; // Σ of the night lines
  readonly netRental: Money;
  readonly expectedPayout: Money;
  readonly ownerShare: Money;
  /** For reference only: the source amounts of a cancellation and what was kept. */
  readonly cancelled: { readonly gross: Money; readonly refund: Money; readonly retained: Money } | null;
  readonly lines: readonly NightLine[];
}

export interface Scope {
  readonly period: Period;
  readonly propertyIds: ReadonlySet<string> | "all";
  readonly includeReview: boolean;
  readonly baseCurrency: Currency;
  readonly today: CalendarDate;
}

export interface Accruals {
  readonly nights: number; // sum of reservation nights; overlaps (DQ-12) count twice
  readonly gross: Money;
  readonly refund: Money;
  readonly otaFee: Money;
  /** otaFee split by the booking's channel; on Direct it is the marketing fee (DQ-11, info); `unknown` — no channel. */
  readonly otaFeeByChannel: Readonly<Record<Channel | "unknown", Money>>;
  readonly pbjt: Money; // PBJT payable: a liability, not in revenue, the fee or the owner estimate
  readonly netRental: Money;
  readonly managementFee: Money;
  readonly ownerEstimate: Money; // netRental − managementFee, before expenses (ТЗ п. 8)
  readonly operatingExpenses: Money; // paid + pending, by expense_date
  /** Cancellations with check-in in the period, for reference. */
  readonly cancellations: {
    readonly count: number;
    readonly gross: Money;
    readonly refund: Money;
    readonly retained: Money;
  };
}

export interface CashFlow {
  readonly received: Money; // payments `received`, by payment_date
  readonly pending: Money; // payments `pending`: not money yet (ТЗ п. 11), the admitted part of "held"
  readonly paidExpenses: Money;
  readonly netCashFlow: Money; // received − paid expenses
}

export type ReconciliationStatus = "matched" | "not_received" | "underpaid" | "overpaid" | "not_due";

export interface ReconciliationLine {
  readonly reservationId: string;
  readonly propertyId: string;
  readonly checkOut: CalendarDate;
  readonly expected: Money;
  readonly received: Money;
  readonly difference: Money; // received − expected
  readonly status: ReconciliationStatus;
}

export interface Reconciliation {
  readonly lines: readonly ReconciliationLine[];
  readonly expected: Money;
  readonly received: Money;
  readonly difference: Money;
  readonly byStatus: Readonly<Record<ReconciliationStatus, number>>;
}

/** A reservation's share of the accruals: its night lines dated in the period, added up. */
export interface StayPart {
  readonly reservationId: string;
  readonly propertyId: string;
  readonly checkIn: CalendarDate;
  readonly checkOut: CalendarDate;
  readonly channel: Channel | null;
  readonly dqStatus: DqStatus;
  readonly rates: readonly Rate[]; // the different rates of its nights in the period
  readonly stayNights: number; // the whole stay
  readonly nights: number; // of them in the period
  readonly gross: Money;
  readonly pbjt: Money;
  readonly refund: Money;
  readonly otaFee: Money;
  readonly managementFee: Money;
}

/**
 * The records behind the accrual and cash totals, under the same scope; each list adds up to its
 * totals. Reconciliation lists its records itself: Reconciliation.lines.
 */
export interface Breakdown {
  readonly stays: readonly StayPart[]; // nights, gross, pbjt, refund, otaFee, managementFee
  readonly expenses: readonly ExpenseInput[]; // operatingExpenses: paid + pending, by expense_date
  readonly payments: readonly PaymentInput[]; // cashFlow.received: `received`, by payment_date
  readonly pendingPayments: readonly PaymentInput[]; // cashFlow.pending, by payment_date
}

export interface OwnerBalanceEstimate {
  readonly amount: Money;
  readonly isEstimate: true;
  readonly missing: readonly OwnerBalanceGap[];
}

export type FailureEntity = "reservation" | "payment" | "expense";

export interface CalcFailure {
  readonly entity: FailureEntity;
  readonly recordId: string;
  readonly propertyId: string;
  readonly code: CalcErrorCode;
  readonly message: string;
  /** gross for a reservation, amount for a payment or expense */
  readonly amount: Money;
}

export interface BatchResult<T> {
  readonly results: readonly T[];
  readonly failures: readonly CalcFailure[];
}

export interface OverviewInput {
  readonly reservations: readonly ReservationInput[];
  readonly commissionRules: readonly CommissionRuleInput[];
  readonly payments: readonly PaymentInput[];
  readonly expenses: readonly ExpenseInput[];
}

export interface Summary {
  readonly accruals: Accruals;
  readonly cashFlow: CashFlow;
  readonly reconciliation: Reconciliation;
  readonly ownerEstimate: OwnerBalanceEstimate; // before expenses
  readonly ownerBalance: OwnerBalanceEstimate; // after them
}

export interface PropertySummary extends Summary {
  readonly propertyId: string;
}

export interface Overview {
  readonly scope: {
    readonly period: Period;
    readonly includeReview: boolean;
    readonly baseCurrency: Currency;
    readonly today: CalendarDate;
  };
  readonly portfolio: Summary;
  readonly properties: readonly PropertySummary[];
  readonly failures: readonly CalcFailure[];
}
