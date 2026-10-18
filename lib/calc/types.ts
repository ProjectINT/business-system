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

export interface ReservationInput {
  readonly reservationId: string;
  readonly propertyId: string;
  readonly checkIn: CalendarDate;
  readonly checkOut: CalendarDate;
  readonly status: ReservationStatus;
  readonly gross: Money; // gross_booking_value
  readonly otaFee: Money; // sign is not restricted: R0102 = −100 000 (DQ-08, review)
  readonly refund: Money;
  readonly channel: "OTA" | "Direct";
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
  readonly gross: Money;
  readonly refund: Money;
  readonly otaFee: Money;
  readonly managementFee: Money;
}

export interface ReservationCalc {
  readonly reservationId: string;
  readonly propertyId: string;
  readonly checkIn: CalendarDate;
  readonly checkOut: CalendarDate;
  readonly dqStatus: DqStatus;
  readonly nights: number;
  readonly active: boolean; // confirmed | modified
  readonly rate: Rate | null; // null for a cancellation
  // Recognised amounts; all zero for a cancellation.
  readonly gross: Money;
  readonly refund: Money;
  readonly otaFee: Money;
  readonly managementFee: Money;
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
  readonly asOf: CalendarDate;
}

export interface Accruals {
  readonly nights: number; // sum of reservation nights; overlaps (DQ-12) count twice
  readonly gross: Money;
  readonly refund: Money;
  readonly otaFee: Money;
  readonly netRental: Money;
  readonly managementFee: Money;
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
  readonly received: Money;
  readonly paidExpenses: Money;
  readonly netCashFlow: Money;
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
  readonly ownerBalance: OwnerBalanceEstimate;
}

export interface PropertySummary extends Summary {
  readonly propertyId: string;
}

export interface Overview {
  readonly scope: {
    readonly period: Period;
    readonly includeReview: boolean;
    readonly baseCurrency: Currency;
    readonly asOf: CalendarDate;
  };
  readonly portfolio: Summary;
  readonly properties: readonly PropertySummary[];
  readonly failures: readonly CalcFailure[];
}
