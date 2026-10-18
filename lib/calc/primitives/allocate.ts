import { CalcError, invariant } from "../errors";
import type { Money } from "./money";

/**
 * Split total by weights so that the parts sum to total exactly (largest remainder).
 * Leftover units go one by one to the largest remainders; ties go to the lower index.
 */
export function allocateByWeights(total: Money, weights: readonly bigint[]): Money[] {
  if (weights.length === 0) throw new CalcError("EMPTY_ALLOCATION", "Nothing to allocate to");
  let w = 0n;
  for (const x of weights) {
    if (x < 0n) throw new CalcError("INVALID_WEIGHTS", "Negative weight", { weight: x.toString() });
    w += x;
  }
  if (w === 0n) throw new CalcError("INVALID_WEIGHTS", "Weights sum to zero");

  const negative = total.amount < 0n;
  const abs = negative ? -total.amount : total.amount;
  const parts = weights.map((x) => (abs * x) / w);
  const remainders = weights.map((x, i) => ({ i, r: (abs * x) % w }));
  let leftover = abs - parts.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of remainders) {
    if (leftover === 0n) break;
    parts[i] = (parts[i] as bigint) + 1n;
    leftover -= 1n;
  }

  const result = parts.map((p) => ({ amount: negative ? -p : p, currency: total.currency }));
  invariant(
    result.reduce((a, b) => a + b.amount, 0n) === total.amount,
    "allocation does not sum to total",
  );
  return result;
}

/** Equal split into n parts; the first parts get the extra units. */
export function allocate(total: Money, n: number): Money[] {
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new CalcError("EMPTY_ALLOCATION", `Cannot allocate into ${n} parts`, { parts: n });
  }
  return allocateByWeights(total, Array.from({ length: n }, () => 1n));
}
