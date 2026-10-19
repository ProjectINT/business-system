// How a person sees a rule: an icon for the frequent or obvious problems, a 3–4 letter tag for the rest,
// and the problem in words. The catalogue id (DQ-NN) stays in the code, the tests and the logs; the UI
// never shows it. The order here is the order of the legend.
import {
  ArrowUturnCcwLeft,
  Calendar,
  CircleQuestion,
  CirclesIntersection,
  Clock,
  Copy,
  House,
  Layers,
  LinkSlash,
  PencilToSquare,
  Percent,
  ScalesUnbalanced,
  Wallet,
} from "@gravity-ui/icons";
import type { ComponentType, SVGProps } from "react";

export type RuleGroup = "bookings" | "payments" | "amounts" | "reference" | "files";

export const RULE_GROUP_LABEL: Record<RuleGroup, string> = {
  bookings: "Bookings",
  payments: "Payments",
  amounts: "Amounts and fees",
  reference: "Villas and commission rates",
  files: "Files and dates",
};

type Mark = { icon: ComponentType<SVGProps<SVGSVGElement>>; tag?: never } | { tag: string; icon?: never };

export type RuleMeta = Mark & {
  group: RuleGroup;
  /** The problem the rule finds, as a person would name it. */
  label: string;
  /** What is wrong with the row, in a sentence. */
  description: string;
};

export const RULE_META: Readonly<Record<string, RuleMeta>> = {
  "DQ-12": {
    icon: CirclesIntersection,
    group: "bookings",
    label: "Stays overlap",
    description: "Another booking holds the same villa on some of these nights. A person decides which booking stands.",
  },
  "DQ-13": {
    icon: PencilToSquare,
    group: "bookings",
    label: "Modified, no original",
    description: "A modified booking with no link to the booking it replaces. A person links it or drops it.",
  },
  "DQ-02": {
    icon: Layers,
    group: "bookings",
    label: "Conflicting versions",
    description: "The same id arrives with different content. A person picks the version that stands.",
  },
  "DQ-01": {
    icon: Copy,
    group: "bookings",
    label: "Exact duplicate",
    description: "An exact copy of another row of the same file. The copy is dropped.",
  },
  "DQ-18": {
    tag: "CXL",
    group: "bookings",
    label: "Partial refund on cancellation",
    description: "Cancelled with part of the money refunded; the rest stays as revenue.",
  },
  "DQ-16": {
    icon: Wallet,
    group: "payments",
    label: "Unpaid at check-in",
    description: "A villa is paid in full before check-in; on check-in day part or all of the money was missing.",
  },
  "DQ-23": {
    icon: Clock,
    group: "payments",
    label: "Paid after check-in",
    description: "The payment came after check-in, though a villa is paid in full before arrival.",
  },
  "DQ-24": {
    icon: CircleQuestion,
    group: "payments",
    label: "Confirmed, no payment",
    description: "A booking is confirmed once it is paid, yet no payment is on file: either it has not reached us yet or the confirmation is wrong. For information.",
  },
  "DQ-14": {
    icon: ScalesUnbalanced,
    group: "payments",
    label: "Payment ≠ payout",
    description: "The amount differs from what the booking should pay out: GBV − OTA fee − refund.",
  },
  "DQ-05": {
    icon: LinkSlash,
    group: "payments",
    label: "No valid reservation",
    description: "The payment's reservation is missing or excluded, or still awaits a decision — then the payment waits with it.",
  },
  "DQ-19": {
    tag: "VIL",
    group: "payments",
    label: "Villa mismatch",
    description: "The payment names a different villa than its reservation.",
  },
  "DQ-15": {
    tag: "ZERO",
    group: "payments",
    label: "Zero payment",
    description: "A payment of 0 marked as received.",
  },
  "DQ-09": {
    icon: ArrowUturnCcwLeft,
    group: "amounts",
    label: "Refund inconsistent",
    description: "The refund is negative or above GBV, or a booking that is not cancelled has one.",
  },
  "DQ-08": {
    tag: "OTA",
    group: "amounts",
    label: "OTA fee out of bounds",
    description: "The OTA fee is negative or above GBV.",
  },
  "DQ-10": {
    tag: "OTA%",
    group: "amounts",
    label: "High OTA rate",
    description: "The OTA fee is a larger share of GBV than channels charge (above 25 %).",
  },
  "DQ-11": {
    tag: "MKT",
    group: "amounts",
    label: "Marketing fee",
    description: "A direct booking with an “OTA fee”: it is the marketing fee of our own channel. For information.",
  },
  "DQ-07": {
    tag: "AMT",
    group: "amounts",
    label: "Zero or negative amount",
    description: "GBV or the number of nights is not positive, or an amount is below zero.",
  },
  "DQ-06": {
    tag: "CUR",
    group: "amounts",
    label: "Wrong currency",
    description: "The currency differs from the villa's. The amount is never added to the villa's figures.",
  },
  "DQ-04": {
    icon: House,
    group: "reference",
    label: "Unknown villa",
    description: "The villa is not in properties.csv.",
  },
  "DQ-17": {
    icon: Percent,
    group: "reference",
    label: "Commission rate gap",
    description: "No management-fee rate is in force at check-in, or the rate changes during the stay.",
  },
  "DQ-22": {
    tag: "RATE",
    group: "reference",
    label: "Overlapping rates",
    description: "Two management-fee rates of one villa cover the same dates.",
  },
  "DQ-20": {
    icon: Calendar,
    group: "files",
    label: "Dated in the future",
    description: "Received or paid on a day that has not come yet: the date is wrong.",
  },
  "DQ-03": {
    tag: "FMT",
    group: "files",
    label: "Bad format",
    description: "A value is missing or not in the expected format: a date, a number, an id.",
  },
  "DQ-90": {
    tag: "TOT",
    group: "files",
    label: "Control totals",
    description: "Rows and amounts of a file must add up: in the figures + excluded + duplicates.",
  },
};

/** The rule's meta; a rule the UI does not know yet shows its id rather than nothing. */
export function ruleMeta(id: string): RuleMeta {
  return RULE_META[id] ?? { tag: id, group: "files", label: id, description: "" };
}

/** Words to search a rule by: its name and its tag. */
export function ruleSearchText(id: string): string {
  const m = ruleMeta(id);
  return m.tag === undefined ? m.label : `${m.label} ${m.tag}`;
}
