// Records copied verbatim from Technical_Challenge_Data (fixtures.test.ts checks that they still match)
// and parsed with the module's own parsers, as the import will do.
import { parseDate, period, type CalendarDate } from "../primitives/calendar";
import { parseCurrency, parseMoney } from "../primitives/money";
import { parseRate } from "../primitives/rate";
import type {
  CommissionRuleInput,
  DqStatus,
  ExpenseInput,
  PaymentInput,
  ReservationInput,
  Scope,
} from "../types";

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const d = parseDate;

export const RESERVATION_ROWS = {
  R0003: "R0003,V013,2026-10-25,2026-11-01,confirmed,12170856,IDR,1460503,0,OTA,2026-09-15",
  R0018: "R0018,V013,2026-09-28,2026-10-04,confirmed,14989658,IDR,2248449,0,OTA,2026-09-15",
  R0020: "R0020,V011,2026-09-12,2026-09-15,confirmed,3602767,IDR,612470,0,Direct,2026-09-15",
  R0067: "R0067,V011,2026-09-20,2026-09-24,confirmed,7924759,IDR,950971,0,OTA,2026-09-15",
  R0102: "R0102,V003,2026-09-10,2026-09-14,confirmed,3898667,IDR,-100000,0,OTA,2026-10-15",
  R0110: "R0110,V011,2026-09-15,2026-09-17,confirmed,8309300,IDR,997116,0,Direct,2026-10-15",
  R0131: "R0131,V015,2026-09-22,2026-09-30,cancelled,6699678,IDR,1004952,6699678,OTA,2026-10-15",
  R0143: "R0143,V011,2026-09-05,2026-09-11,modified,6955058,IDR,1043259,0,OTA,2026-10-15",
} as const;

export const RULE_ROWS = {
  V003: "V003,2026-09-01,2026-12-31,0.17,gross_booking_value,OTA fees are separate",
  V011: "V011,2026-09-01,2026-12-31,0.17,gross_booking_value,OTA fees are separate",
  V013: "V013,2026-09-01,2026-12-31,0.17,gross_booking_value,OTA fees are separate",
  V015: "V015,2026-09-01,2026-12-31,0.17,gross_booking_value,OTA fees are separate",
} as const;

export const PAYMENT_ROWS = {
  P0009: "P0009,R0018,V013,2026-10-05,12741209,IDR,received",
  P0010: "P0010,R0020,V011,2026-09-19,2990297,IDR,received",
  P0051: "P0051,R0102,V003,2026-09-12,3998667,IDR,received",
  P0055: "P0055,R0110,V011,2026-09-20,7312184,IDR,received",
} as const;

export const EXPENSE_ROWS = {
  E0016: "E0016,V011,2026-10-18,Electricity,274425,IDR,paid",
  E0018: "E0018,V011,2026-09-06,Electricity,778388,IDR,pending",
  E0057: "E0057,V011,2026-09-29,Supplies,325200,IDR,paid",
  E0072: "E0072,V011,2026-10-19,Maintenance,238459,IDR,pending",
} as const;

/** DQ statuses as the validation module assigns them (DQ-08, DQ-11, DQ-13). */
const DQ: Record<string, DqStatus> = { R0020: "review", R0110: "review", R0143: "review", R0102: "review" };

function cells(row: string, n: number): string[] {
  const c = row.split(",");
  if (c.length !== n) throw new Error(`Expected ${n} cells: ${row}`);
  return c;
}

export function reservationFromRow(row: string): ReservationInput {
  const [id, property, checkIn, checkOut, status, gross, currency, ota, refund, channel] = cells(row, 11) as string[] &
    { length: 11 };
  const cur = parseCurrency(currency as string);
  return {
    reservationId: id as string,
    propertyId: property as string,
    checkIn: d(checkIn as string),
    checkOut: d(checkOut as string),
    status: status as ReservationInput["status"],
    gross: parseMoney(gross as string, cur),
    otaFee: parseMoney(ota as string, cur),
    refund: parseMoney(refund as string, cur),
    channel: channel as ReservationInput["channel"],
    dqStatus: DQ[id as string] ?? "clean",
  };
}

export function ruleFromRow(row: string): CommissionRuleInput {
  const [property, from, to, rate, basis] = cells(row, 6);
  return {
    propertyId: property as string,
    effectiveFrom: d(from as string),
    effectiveTo: to ? d(to) : null,
    rate: parseRate(rate as string),
    feeBasis: basis as CommissionRuleInput["feeBasis"],
  };
}

export function paymentFromRow(row: string): PaymentInput {
  const [id, reservation, property, date, amount, currency] = cells(row, 7);
  return {
    paymentId: id as string,
    reservationId: reservation as string,
    propertyId: property as string,
    paymentDate: d(date as string),
    amount: parseMoney(amount as string, parseCurrency(currency as string)),
    dqStatus: "clean",
  };
}

export function expenseFromRow(row: string): ExpenseInput {
  const [id, property, date, , amount, currency, status] = cells(row, 7);
  return {
    expenseId: id as string,
    propertyId: property as string,
    expenseDate: d(date as string),
    amount: parseMoney(amount as string, parseCurrency(currency as string)),
    paymentStatus: status as ExpenseInput["paymentStatus"],
    dqStatus: "clean",
  };
}

function mapValues<K extends string, A, B>(o: Record<K, A>, f: (a: A) => B): Record<K, B> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v as A)])) as Record<K, B>;
}

export const RES = deepFreeze(mapValues(RESERVATION_ROWS, reservationFromRow));
export const RULES = deepFreeze(Object.values(RULE_ROWS).map(ruleFromRow));
export const PAY = deepFreeze(mapValues(PAYMENT_ROWS, paymentFromRow));
export const EXP = deepFreeze(mapValues(EXPENSE_ROWS, expenseFromRow));

export const SEPTEMBER = period(d("2026-09-01"), d("2026-09-30"));
export const OCTOBER = period(d("2026-10-01"), d("2026-10-31"));
export const NOVEMBER = period(d("2026-11-01"), d("2026-11-30"));

export function scope(overrides: Partial<Scope> = {}): Scope {
  return {
    period: SEPTEMBER,
    propertyIds: "all",
    includeReview: true,
    baseCurrency: "IDR",
    asOf: d("2026-10-15"),
    ...overrides,
  };
}

/** A synthetic reservation in V011 with the given overrides. */
export function synthetic(overrides: Partial<ReservationInput> = {}): ReservationInput {
  return deepFreeze({ ...RES.R0067, reservationId: "X0001", dqStatus: "clean", ...overrides });
}

export function date(text: string): CalendarDate {
  return d(text);
}
