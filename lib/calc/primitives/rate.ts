import { CalcError } from "../errors";
import { assertSameCurrency, type Money } from "./money";
import { roundDiv, type RoundingMode } from "./rounding";

export interface Rate {
  readonly num: bigint; // 17n
  readonly den: bigint; // 100n — always a power of 10
}

const RATE_RE = /^0(?:\.(\d{1,4}))?$/; // 0 ≤ rate < 1, up to 4 digits as numeric(6,4)

/** "0.17" → 17/100. The only way a rate enters a calculation. */
export function parseRate(text: string): Rate {
  const m = RATE_RE.exec(text);
  if (!m) throw new CalcError("INVALID_RATE", `Not a rate in [0, 1): "${text}"`, { text });
  const digits = (m[1] ?? "").replace(/0+$/, "");
  return { num: BigInt(digits || "0"), den: 10n ** BigInt(digits.length) };
}

export function rateToString(rate: Rate): string {
  const scale = rate.den.toString().length - 1;
  return scale === 0 ? rate.num.toString() : `0.${rate.num.toString().padStart(scale, "0")}`;
}

/** amount × rate with a single rounding. */
export function applyRate(m: Money, rate: Rate, mode: RoundingMode): Money {
  return { amount: roundDiv(m.amount * rate.num, rate.den, mode), currency: m.currency };
}

/** part / whole > rate, without division: part × den > whole × num. */
export function exceedsShare(part: Money, whole: Money, rate: Rate): boolean {
  assertSameCurrency(part, whole);
  return part.amount * rate.den > whole.amount * rate.num;
}
