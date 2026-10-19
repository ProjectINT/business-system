// The rules of the catalogue (VALIDATION_PLAN.md 6), listed by stage (VALIDATION_PLAN.md 5). The
// registry orders them by `dependsOn`; within a stage, this order holds.
import { createRegistry, type Registry } from "../registry";
import type { Check } from "../types";
import { dq01 } from "./dq01-exact-duplicate";
import { dq02 } from "./dq02-conflicting-versions";
import { dq03 } from "./dq03-schema-and-format";
import { dq04 } from "./dq04-property-exists";
import { dq05 } from "./dq05-payment-reservation-valid";
import { dq06 } from "./dq06-currency-matches-property";
import { dq07 } from "./dq07-positive-amounts-and-nights";
import { dq08 } from "./dq08-ota-fee-bounds";
import { dq09 } from "./dq09-refund-consistent";
import { dq10 } from "./dq10-ota-rate-range";
import { dq11 } from "./dq11-direct-booking-ota-fee";
import { dq12 } from "./dq12-stay-overlap";
import { dq13 } from "./dq13-modified-without-origin";
import { dq14 } from "./dq14-payment-amount-matches";
import { dq15 } from "./dq15-zero-received-payment";
import { dq16 } from "./dq16-unpaid-at-check-in";
import { dq17 } from "./dq17-commission-rule-covers";
import { dq18 } from "./dq18-partial-refund-on-cancel";
import { dq19 } from "./dq19-payment-property-matches";
import { dq20 } from "./dq20-dated-in-future";
import { dq22 } from "./dq22-commission-rule-overlap";
import { dq23 } from "./dq23-payment-after-check-in";
import { dq24 } from "./dq24-confirmed-without-payment";
import { controlTotals } from "./dq90-control-totals";

const ROW_CHECKS: readonly Check[] = [
  // stage 0: parsing, exact duplicates, versions
  dq03,
  dq01,
  dq02,
  // stage 1: reference data
  dq22,
  // stage 2: reservations, row by row — exclusions first, then flags
  dq04,
  dq06,
  dq07,
  dq09,
  dq08,
  dq10,
  dq11,
  dq13,
  dq17,
  dq18,
  // stage 3: reservations against each other
  dq12,
  // stage 4: payments and expenses — the two rules that need no reservation first
  dq15,
  dq20,
  dq05,
  dq14,
  dq16,
  dq24,
  dq19,
  dq23,
];

/** DQ-90 runs after every other rule: the totals are over final statuses. */
export const dq90: Check = controlTotals(ROW_CHECKS.map((c) => c.id));

export const CHECKS: readonly Check[] = Object.freeze([...ROW_CHECKS, dq90]);

export function defaultRegistry(): Registry {
  return createRegistry(CHECKS);
}

export {
  dq01,
  dq02,
  dq03,
  dq04,
  dq05,
  dq06,
  dq07,
  dq08,
  dq09,
  dq10,
  dq11,
  dq12,
  dq13,
  dq14,
  dq15,
  dq16,
  dq17,
  dq18,
  dq19,
  dq20,
  dq22,
  dq23,
  dq24,
};
