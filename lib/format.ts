// All amounts are whole IDR. bigint comes from lib/calc and is formatted without loss of precision.

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

export function count(value: number | bigint): string {
  return full.format(value);
}

export function signedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
