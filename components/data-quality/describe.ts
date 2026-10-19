// Words for the facts of the checks (VALIDATION_PLAN.md 3: `details` are facts, the UI builds the
// message). Server side: details carry bigint amounts, the client gets the text. Amounts in details
// are whole units of the row's currency, IDR everywhere except R0061.
import type { JournalResult, RuleId } from "@/lib/dq";
import { idrFull } from "@/lib/format";

type Details = Readonly<Record<string, unknown>>;

const num = (v: unknown): string => (typeof v === "bigint" || typeof v === "number" ? idrFull(v) : "?");
const str = (v: unknown): string => (typeof v === "string" ? v : "?");
const list = <T>(v: unknown): readonly T[] => (Array.isArray(v) ? (v as T[]) : []);

function plural(v: unknown, one: string, many = `${one}s`): string {
  const n = typeof v === "number" ? v : Number(v);
  return `${num(v)} ${n === 1 ? one : many}`;
}

function signed(v: unknown): string {
  if (typeof v !== "bigint") return num(v);
  return v < 0n ? `−${idrFull(-v)}` : `+${idrFull(v)}`;
}

/** Basis points → "25.00 %" without floats. */
function percent(bps: unknown): string {
  if (typeof bps !== "number") return "?";
  return `${(bps - (bps % 100)) / 100}.${String(bps % 100).padStart(2, "0")} %`;
}

const KIND: Record<string, string> = {
  same_dates: "same dates",
  modified_version: "with a modified booking",
  partial: "partial",
};

const PAYMENT_PROBLEM: Record<string, (id: string) => string> = {
  missing: (id) => `Reservation ${id} is not in the data`,
  reservation_excluded: (id) => `Reservation ${id} is excluded by the checks`,
  reservation_pending: (id) => `Reservation ${id} awaits a decision; the payment waits with it`,
  reservation_versions: (id) => `Reservation ${id} has several versions; the payment waits for the choice`,
};

const REFUND_PROBLEM: Record<string, (d: Details) => string> = {
  refund_negative: () => "the refund is negative",
  refund_above_gross: (d) => `the refund is above GBV ${num(d.gross)}`,
  refund_without_cancellation: (d) => `a refund on a ${str(d.status)} reservation`,
};

const FAIL: Readonly<Record<RuleId, (d: Details) => string>> = {
  "DQ-01": (d) => `Exact copy of line ${num(d.firstLineNo)} of the same file`,
  "DQ-02": (d) => `${plural(d.versions, "version")} of this id with different content · updated_at ${d.updatedAt === null ? "empty" : str(d.updatedAt)}`,
  "DQ-03": (d) =>
    list<{ field: string | null; value: string | null; message: string }>(d.issues)
      .map((i) => `${i.field ?? "row"}: ${i.message}${i.value ? ` (“${i.value}”)` : ""}`)
      .join("; "),
  "DQ-04": (d) => `Villa ${str(d.propertyId)} is not in properties.csv`,
  "DQ-05": (d) => (PAYMENT_PROBLEM[str(d.problem)] ?? (() => `Reservation ${str(d.reservationId)}: ${str(d.problem)}`))(str(d.reservationId)),
  "DQ-06": (d) => {
    const head = `In ${str(d.currency)}, the villa's currency is ${str(d.baseCurrency)}`;
    return d.perNight === undefined || d.perNight === null
      ? `${head} · amount ${num(d.amount)}`
      : `${head} · ${str(d.currency)} ${num(d.amount)} for ${plural(d.nights, "night")} = ${num(d.perNight)} a night, an IDR-sized amount`;
  },
  "DQ-07": (d) => ("gross" in d ? `GBV ${num(d.gross)} for ${plural(d.nights, "night")}` : `Amount ${num(d.amount)}`),
  "DQ-08": (d) => `OTA fee ${num(d.otaFee)} is outside 0 … GBV ${num(d.gross)}`,
  "DQ-09": (d) =>
    `Refund ${num(d.refund)}: ${list<string>(d.problems)
      .map((p) => (REFUND_PROBLEM[p] ?? (() => p))(d))
      .join("; ")}`,
  "DQ-10": (d) => `OTA fee ${num(d.otaFee)} is ${percent(d.rateBps)} of GBV ${num(d.gross)}, above ${percent(d.maxBps)}`,
  "DQ-11": (d) => `${str(d.channel)} booking: the “OTA fee” of ${num(d.otaFee)} is a marketing fee`,
  "DQ-12": (d) =>
    `Overlaps ${list<{ with: string; from: string; to: string; nights: number; kind: string }>(d.pairs)
      .map((p) => `${p.with} ${p.from} → ${p.to} (${plural(p.nights, "night")}, ${KIND[p.kind] ?? p.kind})`)
      .join(", ")}`,
  "DQ-13": () => "Modified booking with no link to the reservation it replaces",
  "DQ-14": (d) => {
    const above = d.aboveGross === true ? `more than GBV ${num(d.gross)}` : "";
    if (d.difference === 0n) return `Paid ${num(d.amount)} as GBV − OTA − refund gives, but ${above}`;
    return `Paid ${num(d.amount)}, expected GBV − OTA − refund = ${num(d.expected)} (${signed(d.difference)})${above === "" ? "" : `, ${above}`}`;
  },
  "DQ-15": () => "Zero amount marked received",
  "DQ-16": (d) =>
    d.payments === 0
      ? `Nothing paid; ${num(d.expected)} was due by check-in ${str(d.checkIn)}`
      : `Paid ${num(d.paidByCheckIn)} of ${num(d.expected)} by check-in ${str(d.checkIn)}, ${num(d.paidLater)} later · short ${num(d.shortfall)} at check-in`,
  "DQ-17": (d) =>
    d.problem === "no_rule"
      ? `No commission rule in force on check-in ${str(d.date)}`
      : d.problem === "ambiguous"
        ? `Two commission rules in force on check-in ${str(d.date)} start on the same date`
        : `Rate ${str(d.checkInRate)} at check-in becomes ${d.rateFrom === null ? "no rule" : str(d.rateFrom)} from ${str(d.from)}`,
  "DQ-18": (d) => `Cancelled with a partial refund: ${num(d.refund)} of ${num(d.gross)} refunded, ${num(d.retained)} retained`,
  "DQ-19": (d) => `Payment on villa ${str(d.paymentProperty)}, its reservation on ${str(d.reservationProperty)}`,
  "DQ-20": (d) => `Dated ${str(d.date)}, ${plural(d.daysAfter, "day")} after today, ${str(d.today)}`,
  "DQ-22": (d) =>
    `Rate ${d.rate === null ? "?" : str(d.rate)}; ${list<{ other: string; from: string; to: string | null; inForce: string }>(d.overlaps)
      .map((o) => `overlaps ${o.other} ${o.from} → ${o.to ?? "open end"}, where ${o.inForce} applies`)
      .join("; ")}`,
  "DQ-23": (d) => {
    const afterOut = typeof d.daysAfterCheckOut === "number" ? d.daysAfterCheckOut : NaN;
    const out = afterOut > 0 ? `${plural(afterOut, "day")} after check-out` : afterOut === 0 ? "on the check-out day" : "before check-out";
    return `Paid ${str(d.paymentDate)}, ${plural(d.daysAfterCheckIn, "day")} after check-in ${str(d.checkIn)}, ${out}`;
  },
  "DQ-24": (d) => {
    const days = typeof d.daysToCheckIn === "number" ? d.daysToCheckIn : NaN;
    const when =
      d.checkIn === null
        ? ""
        : days > 0
          ? ` · check-in ${str(d.checkIn)}, in ${plural(days, "day")}`
          : days === 0
            ? ` · check-in today, ${str(d.checkIn)}`
            : ` · checked in ${str(d.checkIn)}, ${plural(-days, "day")} ago`;
    const zero = typeof d.zeroPayments === "number" && d.zeroPayments > 0 ? ` (${plural(d.zeroPayments, "zero payment")} only)` : "";
    return `Confirmed, but no payment on file${zero}${when}`;
  },
  "DQ-90": (d) => `The loader read ${plural(d.rowCount, "row")}, the run checked ${num(d.rows)}`,
};

/** What a result says, for people: the facts of a `fail`, the reason of a `skip` or `error`; `null` for `pass`. */
export function describe(ruleId: RuleId, result: Pick<JournalResult, "outcome" | "reason" | "details">): string | null {
  if (result.outcome === "pass") return null;
  if (result.outcome !== "fail") return result.reason ?? null;
  const words = FAIL[ruleId];
  return words === undefined ? "Failed" : words(result.details ?? {});
}
