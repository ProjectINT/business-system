// Source rows + verdicts → the calculator input (ROADMAP.md phase 4; CALCULATION_MODULE.md 2):
//   clean              → dqStatus 'clean';
//   review, pending    → dqStatus 'review': in the figures with a flag. Level 1 has no decisions,
//                        so a row waiting for one counts as under review (PLAN.md 5.2);
//   excluded, duplicate, superseded → not in the figures; their amounts are shown apart.
// Commission rules carry no status in the calculator: every admitted rule is in force.
import {
  money,
  SCALE,
  type CommissionRuleInput,
  type Currency,
  type DqStatus,
  type ExpenseInput,
  type Money,
  type OverviewInput,
  type PaymentInput,
  type ReservationInput,
} from "../calc";
import type { Dataset, Status, Verdict } from "../dq";
import type { DataFailure } from "./types";

export function calcStatus(status: Status): DqStatus | null {
  switch (status) {
    case "clean":
      return "clean";
    case "review":
    case "pending":
      return "review";
    default:
      return null;
  }
}

/** Whole units of a known currency → Money in its minor units; `null` for an unknown currency. */
export function toMoney(units: bigint, currency: string): Money | null {
  if (!Object.hasOwn(SCALE, currency)) return null;
  const c = currency as Currency;
  return money(units * 10n ** BigInt(SCALE[c]), c);
}

/** DQ-03 excludes every row with a value that did not parse, so an admitted row has all of them. */
function need<T>(value: T | null, field: string, unitId: string): T {
  if (value === null) throw new Error(`${unitId}: ${field} is empty in an admitted row; DQ-03 should have excluded it`);
  return value;
}

type Row<E extends "reservation" | "payment" | "expense" | "commission_rule"> = Dataset["rows"][E][number];

export interface Admitted {
  readonly input: OverviewInput;
  readonly failures: readonly DataFailure[];
}

export function admit(dataset: Dataset, verdicts: readonly Verdict[]): Admitted {
  const statusOf = new Map(verdicts.map((v) => [v.unitId, v.status]));
  const admitted = <E extends "reservation" | "payment" | "expense" | "commission_rule">(rows: readonly Row<E>[]) =>
    rows.flatMap((row) => {
      const status = statusOf.get(row.unitId);
      if (status === undefined) throw new Error(`${row.unitId} has no verdict`);
      const dqStatus = calcStatus(status);
      return dqStatus === null ? [] : [{ row, dqStatus }];
    });
  const failures: DataFailure[] = [];

  const unknownCurrency = (entity: DataFailure["entity"], recordId: string, propertyId: string, currency: string) =>
    failures.push({ entity, recordId, propertyId, code: "UNKNOWN_CURRENCY", message: `Unknown currency: ${currency}` });

  const reservations: ReservationInput[] = [];
  for (const { row, dqStatus } of admitted<"reservation">(dataset.rows.reservation)) {
    const v = row.values;
    const id = need(v.reservation_id, "reservation_id", row.unitId);
    const propertyId = need(v.property_id, "property_id", row.unitId);
    const currency = need(v.currency, "currency", row.unitId);
    const gross = toMoney(need(v.gross_booking_value, "gross_booking_value", row.unitId), currency);
    const otaFee = toMoney(need(v.ota_fee, "ota_fee", row.unitId), currency);
    const refund = toMoney(need(v.refund_amount, "refund_amount", row.unitId), currency);
    const pbjt = toMoney(0n, currency); // the CSV has no PBJT column (PLAN.md 15)
    if (gross === null || pbjt === null || otaFee === null || refund === null) {
      unknownCurrency("reservation", id, propertyId, currency);
      continue;
    }
    reservations.push({
      reservationId: id,
      propertyId,
      checkIn: need(v.check_in, "check_in", row.unitId),
      checkOut: need(v.check_out, "check_out", row.unitId),
      status: need(v.status, "status", row.unitId),
      gross,
      pbjt,
      otaFee,
      refund,
      channel: need(v.channel, "channel", row.unitId),
      dqStatus,
    });
  }

  const payments: PaymentInput[] = [];
  for (const { row, dqStatus } of admitted<"payment">(dataset.rows.payment)) {
    const v = row.values;
    const id = need(v.payment_id, "payment_id", row.unitId);
    const propertyId = need(v.property_id, "property_id", row.unitId);
    const currency = need(v.currency, "currency", row.unitId);
    const amount = toMoney(need(v.amount, "amount", row.unitId), currency);
    if (amount === null) {
      unknownCurrency("payment", id, propertyId, currency);
      continue;
    }
    const status = need(v.status, "status", row.unitId);
    if (status !== "received" && status !== "pending") {
      failures.push({ entity: "payment", recordId: id, propertyId, code: "UNKNOWN_STATUS", message: `Unknown payment status: ${status}` });
      continue;
    }
    payments.push({
      paymentId: id,
      reservationId: need(v.reservation_id, "reservation_id", row.unitId),
      propertyId,
      paymentDate: need(v.payment_date, "payment_date", row.unitId),
      amount,
      status,
      dqStatus,
    });
  }

  const expenses: ExpenseInput[] = [];
  for (const { row, dqStatus } of admitted<"expense">(dataset.rows.expense)) {
    const v = row.values;
    const id = need(v.expense_id, "expense_id", row.unitId);
    const propertyId = need(v.property_id, "property_id", row.unitId);
    const currency = need(v.currency, "currency", row.unitId);
    const amount = toMoney(need(v.amount, "amount", row.unitId), currency);
    if (amount === null) {
      unknownCurrency("expense", id, propertyId, currency);
      continue;
    }
    expenses.push({
      expenseId: id,
      propertyId,
      expenseDate: need(v.expense_date, "expense_date", row.unitId),
      amount,
      paymentStatus: need(v.payment_status, "payment_status", row.unitId),
      dqStatus,
    });
  }

  const commissionRules: CommissionRuleInput[] = admitted<"commission_rule">(dataset.rows.commission_rule).map(
    ({ row }) => ({
      propertyId: need(row.values.property_id, "property_id", row.unitId),
      effectiveFrom: need(row.values.effective_from, "effective_from", row.unitId),
      effectiveTo: row.values.effective_to,
      rate: need(row.values.management_fee_rate, "management_fee_rate", row.unitId),
      feeBasis: need(row.values.fee_basis, "fee_basis", row.unitId),
    }),
  );

  return { input: { reservations, commissionRules, payments, expenses }, failures };
}
