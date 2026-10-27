"use client";

// What a figure of the villa table is made of: on hover, the records behind it and their sum, so
// that no figure comes from nowhere. The lists come from the calculator and add up to the figure
// (lib/data/invariants.test.ts); this file only labels them.
import { Tooltip } from "@heroui/react";
import type { View } from "@/lib/calc";
import type { PropertyFigures, PropertySources } from "@/lib/data";
import { count, idrFull } from "@/lib/format";
import { SourcesBody, type Line, type Parts } from "@/components/shared/sources-body";
import { RECONCILIATION_META } from "@/components/status-meta";

type Figures = View<PropertyFigures>;
type Sources = View<PropertySources>;
export type FigureKey = keyof PropertyFigures;

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const day = (d: string) => DAY_MONTH.format(new Date(`${d}T00:00:00Z`));

function plural(n: number, word: string): string {
  return `${count(n)} ${word}${n === 1 ? "" : "s"}`;
}

/** "0.17" → "17%" */
function percent(rate: string): string {
  return `${Number((Number(rate) * 100).toFixed(2))}%`;
}

type Stay = Sources["stays"][number];

function stayText(s: Stay): string {
  const nights = s.nights === s.stayNights ? plural(s.nights, "night") : `${s.nights} of ${plural(s.stayNights, "night")}`;
  return `${day(s.checkIn)} → ${day(s.checkOut)} · ${nights}`;
}

/** Nothing to show for a record that adds nothing to a money figure. */
const nonZero = (l: Line) => l.value !== 0;

function partsOf(id: FigureKey, s: Sources, f: Figures, underReview: boolean): Parts {
  switch (id) {
    case "nights":
      return { lines: s.stays.map((x) => ({ key: x.reservationId, label: x.reservationId, detail: stayText(x), value: x.nights })) };
    case "gross":
      return {
        lines: s.stays
          .map((x) => ({ key: x.reservationId, label: x.reservationId, detail: `${stayText(x)} · ${x.channel ?? "channel unknown"}`, value: x.gross }))
          .filter(nonZero),
      };
    case "otaFee":
      return {
        lines: s.stays
          .map((x) => ({
            key: x.reservationId,
            label: x.reservationId,
            detail: x.channel === "Direct" ? "Direct booking · marketing fee" : x.channel === "OTA" ? "OTA booking" : "Channel unknown",
            value: x.otaFee,
          }))
          .filter(nonZero),
      };
    case "pbjt":
      return {
        lines: s.stays
          .map((x) => ({ key: x.reservationId, label: x.reservationId, detail: stayText(x), value: x.pbjt }))
          .filter(nonZero),
        note: "A tax collected with the stay and owed to the state: not revenue, not in the fee",
      };
    case "managementFee":
      return {
        lines: s.stays
          .map((x) => ({
            key: x.reservationId,
            label: x.reservationId,
            detail: `${x.rates.map(percent).join(" / ")} of gross · ${stayText(x)}`,
            value: x.managementFee,
          }))
          .filter(nonZero),
      };
    case "operatingExpenses":
      return {
        lines: s.expenses.map((x) => ({
          key: x.expenseId,
          label: x.expenseId,
          detail: [day(x.expenseDate), x.category, x.paymentStatus].filter((v) => v !== null && v !== "").join(" · "),
          value: x.amount,
        })),
      };
    case "received":
      return {
        lines: s.payments.map((x) => ({
          key: x.paymentId,
          label: x.paymentId,
          detail: `${day(x.paymentDate)} · for ${x.reservationId}`,
          value: x.amount,
        })),
      };
    case "difference": {
      const lines = s.reconciliation
        .map((x) => ({
          key: x.reservationId,
          label: x.reservationId,
          detail: `${underReview ? "with them" : `out ${day(x.checkOut)} · ${RECONCILIATION_META[x.status].label}`}: expected ${idrFull(x.expected)}, received ${idrFull(x.received)}`,
          value: x.difference,
        }))
        .filter(nonZero);
      const rest = s.reconciliation.length - lines.length;
      return { lines, note: rest > 0 ? `${plural(rest, "more reservation")} matched: difference 0` : undefined };
    }
    case "ownerEstimate": {
      const terms: Line[] = [
        { key: "gross", label: "Gross bookings", value: f.gross },
        { key: "refund", label: "Refunds", value: -s.refund },
        { key: "otaFee", label: "OTA fees", value: -f.otaFee },
        { key: "managementFee", label: "Mgmt fees", value: -f.managementFee },
      ];
      return { lines: terms.filter((t) => t.key !== "refund" || t.value !== 0) };
    }
    case "ownerBalance": {
      const terms: Line[] = [
        { key: "gross", label: "Gross bookings", value: f.gross },
        { key: "refund", label: "Refunds", value: -s.refund },
        { key: "otaFee", label: "OTA fees", value: -f.otaFee },
        { key: "managementFee", label: "Mgmt fees", value: -f.managementFee },
        { key: "expenses", label: "Expenses", value: -f.operatingExpenses },
      ];
      return { lines: terms.filter((t) => t.key !== "refund" || t.value !== 0) };
    }
  }
}

/**
 * A figure, or the part under review of one, with the records behind it on hover. Without records
 * (a villa with no stays shows 0 nights) it stays plain text.
 */
export function FigureWithSources({
  id,
  title,
  villa,
  hint,
  value,
  figures,
  sources,
  underReview = false,
  children,
  className,
}: {
  id: FigureKey;
  title: string;
  villa: string;
  hint: string;
  value: number;
  /** The figures of the same row (or their parts under review): the owner balance is made of them. */
  figures: Figures;
  sources: Sources;
  underReview?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const parts = partsOf(id, sources, figures, underReview);
  const empty = id === "ownerBalance" ? parts.lines.every((l) => l.value === 0) : parts.lines.length === 0 && !parts.note;
  if (empty) return <span className={className}>{children}</span>;
  return (
    <Tooltip delay={250} closeDelay={100}>
      <Tooltip.Trigger
        className={`cursor-help underline decoration-muted/40 decoration-dotted underline-offset-4 hover:decoration-current ${className ?? ""}`}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Content placement="bottom end" className="max-w-[30rem] min-w-72 break-normal text-start">
        <SourcesBody
          title={title}
          villa={villa}
          hint={hint}
          parts={parts}
          total={value}
          format={id === "nights" ? count : idrFull}
          underReview={underReview}
        />
      </Tooltip.Content>
    </Tooltip>
  );
}
