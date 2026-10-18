import { CalcError } from "../errors";

export type Currency = "IDR" | "USD";

export interface Money {
  readonly amount: bigint; // whole units of account of the currency
  readonly currency: Currency;
}

/** Accounting scale is a company policy, not ISO 4217: IDR is kept in whole rupiah. */
export const SCALE: Readonly<Record<Currency, number>> = Object.freeze({ IDR: 0, USD: 2 });

const AMOUNT_RE = /^(-?)(\d+)(?:\.(\d+))?$/; // \d without the u flag is ASCII 0–9 only

export function parseCurrency(text: string): Currency {
  if (!Object.hasOwn(SCALE, text)) {
    throw new CalcError("UNKNOWN_CURRENCY", `Unknown currency: ${text}`, { currency: text });
  }
  return text as Currency;
}

function scaleOf(currency: Currency): number {
  return SCALE[parseCurrency(currency)];
}

/** "10011978" / "10011978.00" → 10011978n. Extra fraction digits must be zeros: no silent rounding. */
export function parseMoney(text: string, currency: Currency): Money {
  const scale = scaleOf(currency);
  const m = AMOUNT_RE.exec(text);
  if (!m) throw new CalcError("INVALID_AMOUNT", `Not an amount: "${text}"`, { text, currency });
  const [, minus = "", whole = "", fraction = ""] = m;
  const kept = fraction.slice(0, scale);
  if (/[^0]/.test(fraction.slice(scale))) {
    throw new CalcError("AMOUNT_SCALE", `More than ${scale} fraction digits for ${currency}: "${text}"`, {
      text,
      currency,
      scale,
    });
  }
  const units = BigInt(whole + kept.padEnd(scale, "0"));
  return { amount: minus ? -units : units, currency };
}

/** For fixtures and mocks only: a safe integer number of units of account. */
export function fromSafeInteger(n: number, currency: Currency): Money {
  scaleOf(currency);
  if (!Number.isInteger(n)) throw new CalcError("INVALID_AMOUNT", `Not an integer: ${n}`, { value: String(n) });
  if (!Number.isSafeInteger(n)) throw new CalcError("UNSAFE_NUMBER", `Unsafe integer: ${n}`, { value: String(n) });
  return { amount: BigInt(n), currency };
}

export function money(amount: bigint, currency: Currency): Money {
  scaleOf(currency);
  return { amount, currency };
}

export function idr(amount: bigint): Money {
  return { amount, currency: "IDR" };
}

export function zero(currency: Currency): Money {
  return money(0n, currency);
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CalcError("CURRENCY_MISMATCH", `Currency mismatch: ${a.currency} vs ${b.currency}`, {
      left: a.currency,
      right: b.currency,
    });
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function neg(a: Money): Money {
  return { amount: -a.amount, currency: a.currency };
}

/** sum([]) is zero in the given currency; every item must be in that currency. */
export function sum(list: Iterable<Money>, currency: Currency): Money {
  let total = zero(currency);
  for (const m of list) total = add(total, m);
  return total;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
}

export function isZero(a: Money): boolean {
  return a.amount === 0n;
}

export function isNegative(a: Money): boolean {
  return a.amount < 0n;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** bigint → number at the module boundary (units of account). Throws instead of losing precision. */
export function toSafeNumber(m: Money): number {
  if (m.amount > MAX_SAFE || m.amount < -MAX_SAFE) {
    throw new CalcError("UNSAFE_NUMBER", `Amount does not fit a safe number: ${m.amount}`, {
      amount: m.amount.toString(),
      currency: m.currency,
    });
  }
  return Number(m.amount);
}

/** For JSON and the database: 10011978n IDR → "10011978", 1250n USD → "12.50". */
export function toDecimalString(m: Money): string {
  const scale = scaleOf(m.currency);
  const abs = (m.amount < 0n ? -m.amount : m.amount).toString();
  const sign = m.amount < 0n ? "-" : "";
  if (scale === 0) return sign + abs;
  const padded = abs.padStart(scale + 1, "0");
  return `${sign}${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}
