import { assertNever, CalcError } from "../errors";

export type RoundingMode = "half-up" | "half-even";

/**
 * The only rounding in the module: n / d rounded to an integer.
 * half-up = half away from zero (2.5 → 3, −2.5 → −3), same as Postgres round(numeric).
 * half-even = banker's (2.5 → 2, 3.5 → 4).
 */
export function roundDiv(n: bigint, d: bigint, mode: RoundingMode): bigint {
  if (d <= 0n) throw new CalcError("INVALID_DIVISOR", "Divisor must be positive", { divisor: d.toString() });
  const q = n / d; // truncates toward zero
  const r = n % d; // remainder has the sign of n
  if (r === 0n) return q;
  const sign = n < 0n ? -1n : 1n;
  const twice = 2n * (r < 0n ? -r : r);
  switch (mode) {
    case "half-up":
      return twice >= d ? q + sign : q;
    case "half-even":
      return twice > d || (twice === d && q % 2n !== 0n) ? q + sign : q;
    default:
      return assertNever(mode, "INVALID_POLICY", "rounding");
  }
}
