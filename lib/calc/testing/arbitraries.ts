import fc from "fast-check";
import { fromEpochDay, toEpochDay, parseDate, type CalendarDate } from "../primitives/calendar";
import { idr, type Money } from "../primitives/money";
import type { Rate } from "../primitives/rate";
import type {
  CommissionRuleInput,
  DqStatus,
  ExpenseInput,
  OverviewInput,
  PaymentInput,
  ReservationInput,
} from "../types";

export const BIG = 10n ** 18n; // well above 2^53

export const amount = (max = BIG) => fc.bigInt({ min: -max, max });
export const idrMoney = (max = BIG) => amount(max).map(idr);
export const positiveIdr = (max = BIG) => fc.bigInt({ min: 0n, max }).map(idr);

const MIN_DAY = toEpochDay(parseDate("1970-01-01"));
const MAX_DAY = toEpochDay(parseDate("2100-12-31"));

export const epochDay = fc.integer({ min: MIN_DAY, max: MAX_DAY - 60 });
export const calendarDate: fc.Arbitrary<CalendarDate> = epochDay.map(fromEpochDay);

export const rate: fc.Arbitrary<Rate> = fc
  .integer({ min: 0, max: 9999 })
  .map((n) => ({ num: BigInt(n), den: 10000n }));

const dqStatus = fc.constantFrom<DqStatus>("clean", "review");
const propertyId = fc.constantFrom("V001", "V002", "V003");

/** A small realistic world: three properties with an open-ended rule each, stays in 2026. */
const DAY_2026 = toEpochDay(parseDate("2026-08-01"));
const stayDay = fc.integer({ min: DAY_2026, max: DAY_2026 + 150 });
const money = (max: bigint): fc.Arbitrary<Money> => fc.bigInt({ min: 0n, max }).map(idr);

export const reservation = (id: number): fc.Arbitrary<ReservationInput> =>
  fc
    .record({
      propertyId,
      start: stayDay,
      nights: fc.integer({ min: 1, max: 60 }),
      status: fc.constantFrom<ReservationInput["status"]>("confirmed", "modified", "cancelled"),
      gross: fc.bigInt({ min: 0n, max: BIG }),
      pbjtShare: fc.integer({ min: 0, max: 200 }),
      otaShare: fc.integer({ min: -100, max: 1000 }),
      refundShare: fc.integer({ min: 0, max: 1000 }),
      channel: fc.constantFrom<ReservationInput["channel"]>("OTA", "Direct", null),
      dqStatus,
    })
    .map((r) => ({
      reservationId: `R${String(id).padStart(4, "0")}`,
      propertyId: r.propertyId,
      checkIn: fromEpochDay(r.start),
      checkOut: fromEpochDay(r.start + r.nights),
      status: r.status,
      gross: idr(r.gross),
      pbjt: idr((r.gross * BigInt(r.pbjtShare)) / 1000n),
      otaFee: idr((r.gross * BigInt(r.otaShare)) / 1000n),
      refund: idr((r.gross * BigInt(r.refundShare)) / 1000n),
      channel: r.channel,
      dqStatus: r.dqStatus,
    }));

export const rules = fc
  .tuple(rate, rate, rate)
  .map(([a, b, c]): CommissionRuleInput[] =>
    (["V001", "V002", "V003"] as const).map((propertyId, i) => ({
      propertyId,
      effectiveFrom: parseDate("2026-01-01"),
      effectiveTo: null,
      rate: [a, b, c][i] as Rate,
      feeBasis: "gross_booking_value",
    })),
  );

const payment = (id: number, reservationCount: number): fc.Arbitrary<PaymentInput> =>
  fc
    .record({
      r: fc.integer({ min: 1, max: Math.max(1, reservationCount) }),
      propertyId,
      day: stayDay,
      amount: money(BIG),
      status: fc.constantFrom<PaymentInput["status"]>("received", "pending"),
      dqStatus,
    })
    .map((p) => ({
      paymentId: `P${String(id).padStart(4, "0")}`,
      reservationId: `R${String(p.r).padStart(4, "0")}`,
      propertyId: p.propertyId,
      paymentDate: fromEpochDay(p.day),
      amount: p.amount,
      status: p.status,
      dqStatus: p.dqStatus,
    }));

const expense = (id: number): fc.Arbitrary<ExpenseInput> =>
  fc
    .record({ propertyId, day: stayDay, amount: money(10n ** 12n), dqStatus, paid: fc.boolean() })
    .map((e) => ({
      expenseId: `E${String(id).padStart(4, "0")}`,
      propertyId: e.propertyId,
      expenseDate: fromEpochDay(e.day),
      amount: e.amount,
      paymentStatus: e.paid ? "paid" : "pending",
      dqStatus: e.dqStatus,
    }));

const indexed = <T>(make: (i: number) => fc.Arbitrary<T>, max: number) =>
  fc.integer({ min: 0, max }).chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => make(i + 1))));

export const overviewInput: fc.Arbitrary<OverviewInput> = fc
  .integer({ min: 0, max: 12 })
  .chain((n) =>
    fc.record({
      reservations: fc.tuple(...Array.from({ length: n }, (_, i) => reservation(i + 1))),
      commissionRules: rules,
      payments: indexed((i) => payment(i, n), 8),
      expenses: indexed(expense, 8),
    }),
  );

/** A period inside the generated stays, split at a random day into two adjacent parts. */
export const splitPeriod = fc
  .tuple(stayDay, fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 60 }))
  .map(([start, a, b]) => ({ from: start, mid: start + a, to: start + a + b + 1 }));
