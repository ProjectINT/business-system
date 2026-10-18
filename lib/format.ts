// Amounts are whole IDR unless a Money says otherwise. bigint comes from lib/calc and is formatted without loss of precision.
import { toDecimalString, type Money } from "@/lib/calc";

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "IDR 1.3B" — for KPI tiles and chart axes. */
export function idrCompact(value: number | bigint): string {
  return `IDR ${compact.format(value)}`;
}

/** "1,252,752,856" — for table cells. */
export function idrFull(value: number | bigint): string {
  return full.format(value);
}

/** "+IDR 1.1B", "−IDR 279M": a change, sign first. */
export function idrSignedCompact(value: number | bigint): string {
  const negative = value < 0;
  const abs = negative ? -value : value;
  return `${negative ? "−" : "+"}IDR ${compact.format(abs)}`;
}

/** "+1,120,600,000", "−279,000": a change in a table cell, sign first. */
export function signedFull(value: number | bigint): string {
  const negative = value < 0;
  const abs = negative ? -value : value;
  return `${negative ? "−" : "+"}${full.format(abs)}`;
}

export function count(value: number | bigint): string {
  return full.format(value);
}

export function signedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** Exact, digits grouped, no code: "13,681,939" in IDR, "4,280,874.00" in USD. */
export function moneyDigits(m: Money): string {
  const [whole = "0", fraction] = toDecimalString(m).split(".");
  return `${full.format(BigInt(whole))}${fraction === undefined ? "" : `.${fraction}`}`;
}

/** "13,681,939" for IDR (tables name it in the header), "USD 4,280,874.00" for another currency. */
export function moneyFull(m: Money): string {
  return m.currency === "IDR" ? moneyDigits(m) : `${m.currency} ${moneyDigits(m)}`;
}
