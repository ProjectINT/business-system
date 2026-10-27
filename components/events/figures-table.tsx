"use client";

// The figures of the report and what each is made of (docs/EVENTS_VISUALIZATION_PLAN.md, 3.2): the grid
// villa × month the report is built from, months with their villas under them, the period at the bottom.
// A table, not a chart: six figures of different meaning on one axis would invite false comparisons.
// Hover a figure for its nights or payments and their sum; click to light them up in the other sections.
// With decisions applied, a changed figure shows its difference from the CLI's output.
import { Card, Switch, Tooltip } from "@heroui/react";
import { useState } from "react";
import { idrFull, signedFull } from "@/lib/format";
import { SourcesBody, type Parts } from "@/components/shared/sources-body";
import { useEvents } from "./selection";
import { cellOf, dayText, METRICS, monthText, percentOfBps, type Cell, type Figures, type MetricKey, type Model } from "./view-of";

/** Mgmt fee + OTA fee + Owner estimate = Accommodation (ТЗ 8): the first three categorical slots, dark steps. */
const SEGMENTS = [
  { key: "management_fee_idr", label: "Mgmt fee", color: "#3987e5" },
  { key: "ota_fee_idr", label: "OTA fee", color: "#d95926" },
  { key: "owner_estimate_idr", label: "Owner est.", color: "#199e70" },
] as const;

/** PBJT is not a part of accommodation: hatched in the muted text colour. */
const HATCH = { backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 5px)" };

function partsOf(metric: MetricKey, cell: Cell, f: Figures): Parts {
  const nights = (value: (n: Cell["nights"][number]) => number, detail: (n: Cell["nights"][number]) => string) =>
    cell.nights.map((n) => ({ key: `${n.reservation_id}|${n.night}`, label: n.reservation_id, detail: detail(n), value: value(n) })).filter((l) => l.value !== 0);
  switch (metric) {
    case "accommodation_gross_idr":
      return { lines: nights((n) => n.accommodation_gross_idr, (n) => dayText(n.night)) };
    case "pbjt_liability_idr":
      return { lines: nights((n) => n.pbjt_idr, (n) => dayText(n.night)), note: "A liability to the state, not income" };
    case "ota_fee_idr":
      return { lines: nights((n) => n.ota_fee_idr, (n) => dayText(n.night)) };
    case "management_fee_idr":
      return {
        lines: nights(
          (n) => n.management_fee_idr,
          (n) => `${dayText(n.night)} · ${idrFull(n.accommodation_gross_idr)} × ${percentOfBps(n.rate_bps)}`,
        ),
      };
    case "owner_estimate_idr":
      return {
        lines: [
          { key: "a", label: "Accommodation", value: f.accommodation_gross_idr },
          { key: "o", label: "OTA fee", value: -f.ota_fee_idr },
          { key: "m", label: "Mgmt fee", value: -f.management_fee_idr },
        ],
        note: "An estimate before expenses and payouts, not an amount to pay",
      };
    case "cash_received_idr":
      return {
        lines: cell.payments.map((p) => ({ key: String(p.row), label: p.payment_id, detail: `${dayText(p.payment_date)} · for ${p.reservation_id}`, value: p.amount_idr })),
        note: "By payment date, not by the nights it pays for",
      };
  }
}

export function FiguresTable() {
  const { model } = useEvents();
  const decided = model.applied.length > 0;
  const [asComputed, setAsComputed] = useState(false);
  const report = asComputed ? model.as_computed : model.report;
  const villas = model.properties.map((p) => p.property_id);

  return (
    <Card className="gap-4">
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Card.Title>Figures and what they are made of</Card.Title>
          <Card.Description>
            Nights accrue in the month of the night, cash in the month of payment. Amounts in IDR; hover a figure for its records.
          </Card.Description>
        </div>
        {decided && (
          <Switch size="sm" isSelected={!asComputed} onChange={(on) => setAsComputed(!on)}>
            <Switch.Content className="text-sm">
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              {asComputed ? "As computed (CLI)" : "With decisions"}
            </Switch.Content>
          </Switch>
        )}
      </Card.Header>
      <Card.Content className="flex flex-col gap-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-separator text-muted">
                <th className="py-2 pe-3 text-start font-normal" />
                {METRICS.map((m) => (
                  <th key={m.key} className="px-2 py-2 text-end font-normal" title={m.hint}>
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.report_months.map((month) => (
                <MonthRows key={month} month={month} villas={villas} report={report} model={model} asComputed={asComputed} />
              ))}
              <FigureRow
                label="Total"
                strong
                figures={report.total}
                base={decided && !asComputed ? model.as_computed.total : null}
                property_id={null}
                month={null}
                model={model}
                live={!asComputed}
              />
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">
          Not in the totals: held IDR {idrFull(report.cash_held_idr)} · unmatched IDR {idrFull(report.cash_unmatched_idr)}
        </p>
        <CompositionBars report={report} months={model.report_months} />
      </Card.Content>
    </Card>
  );
}

function MonthRows({ month, villas, report, model, asComputed }: { month: string; villas: string[]; report: Model["report"]; model: Model; asComputed: boolean }) {
  const decided = model.applied.length > 0 && !asComputed;
  return (
    <>
      <FigureRow
        label={monthText(month)}
        strong
        figures={report.monthly[month]!}
        base={decided ? model.as_computed.monthly[month]! : null}
        property_id={null}
        month={month}
        model={model}
        live={!asComputed}
      />
      {villas.map((v) => (
        <FigureRow
          key={v}
          label={v}
          indent
          figures={report.by_property[v]![month]!}
          base={decided ? model.as_computed.by_property[v]![month]! : null}
          property_id={v}
          month={month}
          model={model}
          live={!asComputed}
        />
      ))}
    </>
  );
}

function FigureRow(props: {
  label: string;
  strong?: boolean;
  indent?: boolean;
  figures: Figures;
  /** The CLI's figures, to show a difference; null without decisions. */
  base: Figures | null;
  property_id: string | null;
  month: string | null;
  model: Model;
  /** The model's sources describe these figures (not the CLI's, shown for comparison). */
  live: boolean;
}) {
  const { selection, select } = useEvents();
  const { label, strong = false, indent = false, figures, base, property_id, month, model, live } = props;
  const cell = cellOf(model, property_id, month);
  return (
    <tr className={`border-b border-separator/60 ${strong ? "font-medium" : ""}`}>
      <th scope="row" className={`py-1.5 pe-3 text-start font-[inherit] whitespace-nowrap ${indent ? "ps-4 text-muted" : ""}`}>
        {label}
      </th>
      {METRICS.map((m) => {
        const value = figures[m.key];
        const delta = base === null ? 0 : value - base[m.key];
        const active =
          selection?.kind === "cell" && selection.property_id === property_id && selection.month === month && selection.metric === m.key;
        const parts = partsOf(m.key, cell, figures);
        const text = <span className={value === 0 ? "text-muted" : ""}>{idrFull(value)}</span>;
        return (
          <td key={m.key} className={`px-2 py-1.5 text-end whitespace-nowrap ${active ? "bg-accent-soft" : ""}`}>
            {live && (parts.lines.length > 0 || m.key === "owner_estimate_idr") ? (
              <Tooltip delay={250} closeDelay={100}>
                <Tooltip.Trigger
                  className="cursor-pointer underline decoration-muted/40 decoration-dotted underline-offset-4 hover:decoration-current"
                  onClick={() => select({ kind: "cell", property_id, month, metric: m.key })}
                >
                  {text}
                </Tooltip.Trigger>
                <Tooltip.Content placement="bottom end" className="max-w-[30rem] min-w-72 break-normal text-start">
                  <SourcesBody
                    title={m.label}
                    villa={`${property_id ?? "all villas"} · ${month === null ? "period" : monthText(month)}`}
                    hint={m.hint}
                    parts={parts}
                    total={value}
                    format={idrFull}
                  />
                </Tooltip.Content>
              </Tooltip>
            ) : (
              text
            )}
            {delta !== 0 && <div className="text-xs font-normal text-accent">{signedFull(delta)}</div>}
          </td>
        );
      })}
    </tr>
  );
}

/** Accommodation split into Mgmt fee + OTA fee + Owner estimate per month and for the period; PBJT apart, hatched. */
function CompositionBars({ report, months }: { report: Model["report"]; months: readonly string[] }) {
  const rows = [...months.map((m) => ({ key: m, label: monthText(m), f: report.monthly[m]! })), { key: "total", label: "Total", f: report.total }];
  const max = Math.max(...rows.map((r) => r.f.accommodation_gross_idr + r.f.pbjt_liability_idr), 1);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="text-sm text-foreground">Where the accommodation goes</span>
        {SEGMENTS.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-muted/60 text-muted" style={HATCH} />
          PBJT — liability to the state, not income
        </span>
      </div>
      {rows.map((r) => {
        const negative = SEGMENTS.some((s) => r.f[s.key] < 0);
        return (
          <div key={r.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
            <span className="text-sm text-muted">{r.label}</span>
            {r.f.accommodation_gross_idr === 0 ? (
              <span className="text-xs text-muted">No accommodation</span>
            ) : negative ? (
              <span className="text-xs text-muted">Owner estimate below zero: a part larger than the whole, see the table</span>
            ) : (
              <div className="flex h-6 gap-px" style={{ width: `${((r.f.accommodation_gross_idr + r.f.pbjt_liability_idr) / max) * 100}%` }}>
                {SEGMENTS.map((s) =>
                  r.f[s.key] === 0 ? null : (
                    <Tooltip key={s.key} delay={150}>
                      <Tooltip.Trigger
                        className="flex h-full min-w-0 items-center overflow-hidden rounded-sm px-1.5 text-[11px] font-medium text-white"
                        style={{ background: s.color, flexGrow: r.f[s.key], flexBasis: 0 }}
                      >
                        <span className="truncate">{s.label}</span>
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {s.label}: IDR {idrFull(r.f[s.key])} · {((r.f[s.key] / r.f.accommodation_gross_idr) * 100).toFixed(1)}% of accommodation
                      </Tooltip.Content>
                    </Tooltip>
                  ),
                )}
                {r.f.pbjt_liability_idr > 0 && (
                  <Tooltip delay={150}>
                    <Tooltip.Trigger
                      className="ms-1 h-full rounded-sm border border-muted/60 text-muted"
                      style={{ ...HATCH, flexGrow: r.f.pbjt_liability_idr, flexBasis: 0 }}
                      aria-label="PBJT"
                    />
                    <Tooltip.Content>PBJT: IDR {idrFull(r.f.pbjt_liability_idr)} — owed to the state on top of accommodation</Tooltip.Content>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
