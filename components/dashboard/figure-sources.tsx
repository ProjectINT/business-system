"use client";

// What a figure of the villa table is made of: on hover, the records behind it and their sum, so
// that no figure comes from nowhere. The lists come from the calculator and add up to the figure
// (lib/data/invariants.test.ts); this file only labels them.
import { Tooltip } from "@heroui/react";
import type { View } from "@/lib/calc";
import type { PropertyFigures, PropertySources } from "@/lib/data";
import { count, idrFull } from "@/lib/format";
import { RECONCILIATION_META } from "@/components/status-meta";

type Figures = View<PropertyFigures>;
type Sources = View<PropertySources>;
export type FigureKey = keyof PropertyFigures;

interface Line {
  readonly key: string;
  /** A record id, or a term of the owner balance. */
  readonly label: string;
  readonly detail?: string;
  readonly value: number;
}

interface Parts {
  readonly lines: Line[];
  /** Records left out of the lines because they bring nothing to the figure. */
  readonly note?: string;
}

/** Longer lists end with one line for the rest. */
const MAX_LINES = 10;

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
          .map((x) => ({ key: x.reservationId, label: x.reservationId, detail: `${stayText(x)} · ${x.channel}`, value: x.gross }))
          .filter(nonZero),
      };
    case "otaFee":
      return {
        lines: s.stays
          .map((x) => ({
            key: x.reservationId,
            label: x.reservationId,
            detail: x.channel === "Direct" ? "Direct booking · marketing fee" : "OTA booking",
            value: x.otaFee,
          }))
          .filter(nonZero),
      };
    case "managementFee":
      return {
        lines: s.stays
          .map((x) => ({
            key: x.reservationId,
            label: x.reservationId,
            detail: `${percent(x.rate)} of gross · ${stayText(x)}`,
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

function SourcesBody({
  title,
  villa,
  hint,
  parts,
  total,
  format,
  underReview,
}: {
  title: string;
  villa: string;
  hint: string;
  parts: Parts;
  total: number;
  format: (v: number) => string;
  underReview: boolean;
}) {
  const shown = parts.lines.length > MAX_LINES ? parts.lines.slice(0, MAX_LINES - 1) : parts.lines;
  const rest = parts.lines.slice(shown.length);
  return (
    <div className="flex flex-col gap-2 p-1">
      <div className="flex flex-col">
        <span className="text-sm">
          <span className={`font-medium ${underReview ? "text-warning" : ""}`}>
            {underReview ? `${title}: records under review` : title}
          </span>
          <span className="text-muted"> · {villa}</span>
        </span>
        <span className="text-muted">{underReview ? "Not in the figure: what they would add to it" : hint}</span>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1">
        {shown.map((l) => (
          <div key={l.key} className="contents">
            <span className="font-medium whitespace-nowrap">{l.label}</span>
            <span className="text-muted">{l.detail}</span>
            <span className="text-end tabular-nums whitespace-nowrap">{format(l.value)}</span>
          </div>
        ))}
        {rest.length > 0 && (
          <>
            <span className="col-span-2 text-muted">{plural(rest.length, "more record")}</span>
            <span className="text-end tabular-nums whitespace-nowrap">{format(rest.reduce((n, l) => n + l.value, 0))}</span>
          </>
        )}
        <div className="col-span-3 border-t border-separator" />
        <span className="col-span-2 font-medium">{underReview ? "Under review" : "Total"}</span>
        <span className="text-end font-semibold tabular-nums whitespace-nowrap">{format(total)}</span>
      </div>
      {parts.note && <span className="text-muted">{parts.note}</span>}
    </div>
  );
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
