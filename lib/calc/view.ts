import { invariant } from "./errors";
import { toSafeNumber, type Money } from "./primitives/money";
import { rateToString, type Rate } from "./primitives/rate";

/** The same shape with Money → number (units of account), Rate → "0.17", Set → array. */
export type View<T> = T extends Money
  ? number
  : T extends Rate
    ? string
    : T extends bigint
      ? never
      : T extends string | number | boolean | null | undefined
        ? T // a branded CalendarDate stays a string, not an object
        : T extends ReadonlySet<infer U>
          ? View<U>[]
          : T extends readonly (infer U)[]
            ? View<U>[]
            : T extends object
              ? { -readonly [K in keyof T]: View<T[K]> }
              : T;

function isMoney(v: object): v is Money {
  return "amount" in v && typeof v.amount === "bigint" && "currency" in v;
}

function isRate(v: object): v is Rate {
  return "num" in v && typeof v.num === "bigint" && "den" in v;
}

function convert(v: unknown): unknown {
  invariant(typeof v !== "bigint", "bigint without a currency cannot be shown");
  if (typeof v !== "object" || v === null) return v;
  if (isMoney(v)) return toSafeNumber(v);
  if (isRate(v)) return rateToString(v);
  if (v instanceof Set || Array.isArray(v)) return [...v].map(convert);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convert(x)]));
}

/** The only place where bigint becomes number: for Recharts and tables. Throws UNSAFE_NUMBER instead of losing precision. */
export function toView<T>(value: T): View<T> {
  return convert(value) as View<T>;
}
