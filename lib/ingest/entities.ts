// Target format of the five source files (PLAN.md 5.1; IMPORT_PLAN.md 5 calls it `targets`).
// The zod shape of each entity is the single source of truth: its keys, in order, are the
// columns that enter `rowHash`, and its codecs are what staging does in SQL (`try_date`,
// `try_numeric`). Keys are the source column names, 1:1 with the `stg_*` tables.
//
// A value that does not parse becomes `null` and leaves a `ParseIssue` on the row; nothing
// throws. DQ-03 turns those issues into `excluded`.
import { z } from "zod";
import { parseDate, parseRate } from "../calc";

export const ENTITIES = ["property", "commission_rule", "reservation", "payment", "expense"] as const;
export type Entity = (typeof ENTITIES)[number];

export const FILE_NAMES: Readonly<Record<Entity, string>> = Object.freeze({
  property: "properties.csv",
  commission_rule: "commission_rules.csv",
  reservation: "reservations.csv",
  payment: "payments.csv",
  expense: "expenses.csv",
});

/** Natural key columns. A composite key is joined with "@": `V001@2026-09-01`. */
export const KEY_COLUMNS: Readonly<Record<Entity, readonly string[]>> = Object.freeze({
  property: ["property_id"],
  commission_rule: ["property_id", "effective_from"],
  reservation: ["reservation_id"],
  payment: ["payment_id"],
  expense: ["expense_id"],
});

// ── codecs ──────────────────────────────────────────────────────────────────

const text = z.string().trim().min(1, "empty");

const optionalText = z.string().trim().transform((s) => (s === "" ? null : s));

function tryDate(s: string, ctx: z.RefinementCtx) {
  try {
    return parseDate(s);
  } catch {
    ctx.addIssue({ code: "custom", message: "not a calendar date YYYY-MM-DD" });
    return z.NEVER;
  }
}

const date = z.string().trim().transform(tryDate);

const optionalDate = z.string().trim().transform((s, ctx) => (s === "" ? null : tryDate(s, ctx)));

// Whole units of account, as lib/calc keeps money (IDR has no fractions). A fraction is accepted
// only when it is all zeros: "10011978.00" → 10011978n, "0.5" → issue. No rounding, ever.
const AMOUNT_RE = /^(-?)(\d+)(?:\.(0+))?$/;

const amount = z.string().trim().transform((s, ctx) => {
  const m = AMOUNT_RE.exec(s);
  if (!m) {
    ctx.addIssue({ code: "custom", message: "not a whole amount" });
    return z.NEVER;
  }
  const units = BigInt(m[2]!);
  return m[1] ? -units : units;
});

const rate = z.string().trim().transform((s, ctx) => {
  try {
    return parseRate(s);
  } catch {
    ctx.addIssue({ code: "custom", message: "not a rate in [0, 1) with up to 4 decimals" });
    return z.NEVER;
  }
});

function choice<const T extends readonly [string, ...string[]]>(values: T) {
  return z.string().trim().pipe(z.enum(values));
}

// ── schemas ─────────────────────────────────────────────────────────────────

export const SCHEMAS = {
  property: z.object({
    property_id: text,
    property_name: optionalText,
    cluster: optionalText,
    owner_id: text,
    base_currency: text,
  }),
  commission_rule: z.object({
    property_id: text,
    effective_from: date,
    effective_to: optionalDate, // inclusive; empty — open-ended
    management_fee_rate: rate,
    fee_basis: choice(["gross_booking_value"]),
    note: optionalText,
  }),
  reservation: z.object({
    reservation_id: text,
    property_id: text,
    check_in: date,
    check_out: date,
    status: choice(["confirmed", "modified", "cancelled"]),
    gross_booking_value: amount,
    currency: text, // whether it matches the property is DQ-06, not a format question
    ota_fee: amount, // sign is not restricted here: R0102 = −100 000 is DQ-08
    refund_amount: amount,
    channel: choice(["OTA", "Direct"]),
    updated_at: date,
  }),
  payment: z.object({
    payment_id: text,
    reservation_id: text,
    property_id: text,
    payment_date: date,
    amount,
    currency: text,
    status: text, // only "received" in the sample; other statuses are a DQ question, not a format error
  }),
  expense: z.object({
    expense_id: text,
    property_id: text,
    expense_date: date,
    category: optionalText,
    amount,
    currency: text,
    payment_status: choice(["paid", "pending"]),
  }),
} as const;

export type Schemas = typeof SCHEMAS;

/** Columns of the target format in canonical order; the only columns that enter `rowHash`. */
export const FIELDS: Readonly<Record<Entity, readonly string[]>> = Object.freeze(
  Object.fromEntries(ENTITIES.map((e) => [e, Object.freeze(Object.keys(SCHEMAS[e].shape))])) as Record<
    Entity,
    readonly string[]
  >,
);

type Nullable<T> = { readonly [K in keyof T]: T[K] | null };

/** Typed row values of an entity; every field may be `null` when it did not parse. */
export type Values<E extends Entity> = Nullable<z.output<Schemas[E]>>;

export type PropertyValues = Values<"property">;
export type CommissionRuleValues = Values<"commission_rule">;
export type ReservationValues = Values<"reservation">;
export type PaymentValues = Values<"payment">;
export type ExpenseValues = Values<"expense">;
