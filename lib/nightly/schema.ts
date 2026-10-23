// zod schema of a case file (final-test/case_public.json): CaseInput.
//
// Field names stay as the test names them (snake_case): the module speaks the vocabulary of the ТЗ
// and the report uses the same words; lib/calc shapes appear only where its functions are called.
//
// Conversions follow lib/calc. Amounts are whole rupiah ≥ 0 as bigint: z.int() rejects a fraction
// and an unsafe integer, fromSafeInteger is the one place a JSON number becomes bigint — nothing is
// rounded. Dates go through parseDate. updated_at must be ISO 8601 with a zone and becomes
// milliseconds since the epoch, so versions compare as instants ("…T09:00:00Z" and
// "…T13:00:00+04:00" are the same time), not as strings. Unknown fields are ignored (z.object
// strips them). Status and currency stay free text: a value the rules do not know is an exception
// on the record (snapshots.ts), not a format error of the whole file.
import { z } from "zod";
import { fromSafeInteger, parseDate } from "../calc";

const id = z.string().min(1, "empty id");

function tryDate(s: string, ctx: z.RefinementCtx) {
  try {
    return parseDate(s);
  } catch {
    ctx.addIssue({ code: "custom", message: "not a calendar date YYYY-MM-DD" });
    return z.NEVER;
  }
}

const date = z.string().transform(tryDate);

const month = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "not a month YYYY-MM");

const idrAmount = z.int().nonnegative().transform((n) => fromSafeInteger(n, "IDR").amount);

/** Date.parse is exact for ISO 8601 with Z or an offset; sub-millisecond digits are dropped. */
const instant = z.iso.datetime({ offset: true }).transform((s) => Date.parse(s));

function uniqueBy<T>(what: string, key: (item: T) => string) {
  return (items: readonly T[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      const k = key(item);
      if (seen.has(k)) ctx.addIssue({ code: "custom", message: `duplicate ${what}: ${k}`, path: [i] });
      seen.add(k);
    });
  };
}

const PropertySchema = z.object({
  property_id: id,
  base_currency: z.string().min(1, "empty currency"),
});

const CommissionRuleSchema = z
  .object({
    property_id: id,
    effective_from: date,
    effective_to: date.nullable().default(null), // inclusive; null or absent — open-ended, as lib/calc reads it
    rate_bps: z.int().min(0).max(10000),
  })
  .refine((r) => r.effective_to === null || r.effective_from <= r.effective_to, {
    message: "effective_to is before effective_from",
    path: ["effective_to"],
  });

const ReservationEventSchema = z.object({
  source_event_id: id,
  reservation_id: id,
  property_id: id,
  updated_at: instant,
  status: z.string(),
  check_in: date,
  check_out: date,
  accommodation_gross_idr: idrAmount,
  pbjt_idr: idrAmount,
  ota_fee_idr: idrAmount,
  currency: z.string(),
});

const PaymentSchema = z.object({
  payment_id: id,
  reservation_id: id,
  payment_date: date,
  amount_idr: idrAmount,
  status: z.string(),
});

export const CaseSchema = z.object({
  case_id: id,
  report_months: z.array(month).min(1, "no report months").superRefine(uniqueBy("month", (m) => m)),
  properties: z.array(PropertySchema).superRefine(uniqueBy("property_id", (p) => p.property_id)),
  commission_rules: z.array(CommissionRuleSchema),
  reservation_events: z.array(ReservationEventSchema),
  payments: z.array(PaymentSchema),
});

export type CaseInput = z.output<typeof CaseSchema>;
export type Property = CaseInput["properties"][number];
export type CommissionRule = CaseInput["commission_rules"][number];
export type ReservationEvent = CaseInput["reservation_events"][number];
export type Payment = CaseInput["payments"][number];

/** Throws ZodError; scripts/nightly.ts prints it with z.prettifyError, which names the path to the field. */
export function parseCase(input: unknown): CaseInput {
  return CaseSchema.parse(input);
}
