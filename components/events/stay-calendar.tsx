"use client";

// The calendar of nights (docs/EVENTS_VISUALIZATION_PLAN.md, 3.3): fees accrue by night, money arrives
// by date. One column per day of the report months, a row per booking under its villa's commission
// rules; a night is coloured by its rate, a payment is a circle on its date, a held booking shows its
// stay dates hatched. Clicking a night or a payment selects it, clicking a booking opens its card.
import { Card, Tooltip } from "@heroui/react";
import { ArrowLeft, ArrowRight } from "@gravity-ui/icons";
import { useMemo } from "react";
import type { ExceptionCode } from "@/lib/nightly";
import { idrFull } from "@/lib/format";
import { ACTION_COLOR, type ChipColor } from "@/components/status-meta";
import { calendarLayout, exactFee, labelSide, type BookingRow, type PaymentMark, type RuleBand, type Span } from "./calendar-layout";
import { CodeBadge } from "./code-badge";
import { actionOf, CODE_META } from "./exception-meta";
import { useEvents, useLit } from "./selection";
import { dayText, monthText, MONEY_KIND_META, nightKey, percentOfBps, type Model, type Reservation } from "./view-of";

const DAY_PX = 18;
/** Columns: label, left edge, the days, right edge, marks and notes. */
const FIRST_DAY_COL = 3;
const LANE_H = "1.25rem";
const ROW_H = "2.25rem";

const TONE: Record<ChipColor, string> = {
  default: "var(--muted)",
  accent: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function hatch(tone: string): React.CSSProperties {
  return {
    backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, ${tone} 55%, transparent) 0 2px, transparent 2px 6px)`,
    boxShadow: `inset 0 0 0 1.5px ${tone}`,
  };
}

/** Grid placement of days [start, end) of the axis. */
const daysCol = (start: number, end: number) => `${FIRST_DAY_COL + start} / ${FIRST_DAY_COL + end}`;

/** The action colour of a held booking: its first exception's. */
function holdTone(r: Reservation): string {
  const code = r.codes[0];
  return TONE[code === undefined ? "default" : ACTION_COLOR[actionOf(code)]];
}

function ruleText(model: Model, i: number): string {
  const r = model.rules[i]!;
  return `${r.property_id} · ${percentOfBps(r.rate_bps)} · ${dayText(r.effective_from)} → ${r.effective_to === null ? "open" : dayText(r.effective_to)}`;
}

export function StayCalendar() {
  const { model } = useEvents();
  const layout = useMemo(() => calendarLayout(model), [model]);
  const { axis } = layout;
  const n = axis.days.length;

  // Every grid row in order, with its height: the header, then per villa its rule lanes and bookings.
  const heights: string[] = ["1.25rem", "1.25rem"];
  const villaRows = layout.villas.map((v) => {
    const first = heights.length + 1;
    heights.push(...Array.from({ length: v.rules.lanes }, () => LANE_H));
    const bookings = v.bookings.map(() => {
      heights.push(ROW_H);
      return heights.length;
    });
    return { v, first, bookings };
  });
  const orphanRow = layout.orphans.length > 0 ? (heights.push(ROW_H), heights.length) : null;

  return (
    <Card className="gap-4">
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Card.Title>Calendar of nights</Card.Title>
          <Card.Description>
            Fees accrue night by night at the rate in force that night; money counts on its payment date. Hover a night for its
            formula, click to light up the records behind it.
          </Card.Description>
        </div>
        <Legend rates={layout.rates} />
      </Card.Header>
      <Card.Content className="overflow-x-auto">
        <div
          className="relative grid w-max min-w-full text-sm"
          style={{
            gridTemplateColumns: `8.5rem 2.25rem repeat(${n}, ${DAY_PX}px) 2.25rem minmax(14rem, 1fr)`,
            gridTemplateRows: heights.join(" "),
          }}
        >
          {/* Month boundaries run through every row. */}
          {axis.boundaries.map((b) => (
            <div
              key={b}
              aria-hidden
              className="pointer-events-none border-l border-separator"
              style={{ gridColumn: `${FIRST_DAY_COL + b} / span 1`, gridRow: "1 / -1" }}
            />
          ))}

          <AxisHeader days={axis.days} />

          {villaRows.map(({ v, first, bookings }) => (
            <div key={v.property_id} className="contents">
              <div aria-hidden className="pointer-events-none border-t border-separator" style={{ gridColumn: "1 / -1", gridRow: `${first} / span 1` }} />
              <div className="flex items-baseline gap-1.5 pt-0.5" style={{ gridColumn: "1 / span 1", gridRow: `${first} / span ${v.rules.lanes}` }}>
                <span className="font-semibold">{v.property_id}</span>
                <span className={`text-[11px] ${v.known ? "text-muted" : "text-danger"}`}>{v.known ? "rules" : "unknown villa"}</span>
              </div>
              <RuleLanes model={model} band={v.rules} rates={layout.rates} row={first} days={n} known={v.known} />
              {v.bookings.map((b, i) => (
                <BookingLine key={b.r.reservation_id} model={model} b={b} row={bookings[i]!} rates={layout.rates} index={axis.index} />
              ))}
            </div>
          ))}

          {orphanRow !== null && (
            <div className="contents">
              <div aria-hidden className="pointer-events-none border-t border-separator" style={{ gridColumn: "1 / -1", gridRow: `${orphanRow} / span 1` }} />
              <div className="flex flex-col justify-center leading-tight" style={{ gridColumn: "1 / span 1", gridRow: `${orphanRow} / span 1` }}>
                <span className="font-medium">No booking</span>
                <span className="text-[11px] text-muted">its booking never arrived</span>
              </div>
              <PaymentMarks marks={layout.orphans} row={orphanRow} days={n} />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ps-3" style={{ gridColumn: `${FIRST_DAY_COL + n + 1} / span 1`, gridRow: `${orphanRow} / span 1` }}>
                {layout.orphans.map((p) => (
                  <span key={p.payment_id} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                    <span className="font-mono">{p.payment_id}</span>
                    <span className="text-muted">→ {p.reservation_id}</span>
                    {p.codes.map((c) => (
                      <CodeBadge key={c} code={c} record_type="payment" />
                    ))}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}

function Legend({ rates }: { rates: ReadonlyMap<number, string> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        Rate
        {[...rates].map(([bps, colour]) => (
          <span key={bps} className="flex items-center gap-1">
            <span className="size-3 rounded-[3px]" style={{ backgroundColor: colour }} />
            <span className="text-foreground tabular-nums">{percentOfBps(bps)}</span>
          </span>
        ))}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: TONE.success }} /> received
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full border-2" style={{ borderColor: TONE.accent }} /> held, not counted
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: TONE.danger }} /> unmatched
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-[3px]" style={hatch(TONE.default)} /> stay not in the figures, outlined in its action colour
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-[3px] border border-dashed border-muted" /> dates of a replaced version
      </span>
    </div>
  );
}

function AxisHeader({ days }: { days: readonly string[] }) {
  const months: { month: string; start: number; length: number }[] = [];
  days.forEach((d, i) => {
    const m = d.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.month === m) last.length += 1;
    else months.push({ month: m, start: i, length: 1 });
  });
  return (
    <>
      {months.map((m) => (
        <span key={m.month} className="ps-1 text-xs font-medium" style={{ gridColumn: `${FIRST_DAY_COL + m.start} / span ${m.length}`, gridRow: "1 / span 1" }}>
          {monthText(m.month)}
        </span>
      ))}
      {days.map((d, i) => (
        <span key={d} className="text-center text-[10px] leading-5 text-muted tabular-nums" style={{ gridColumn: `${FIRST_DAY_COL + i} / span 1`, gridRow: "2 / span 1" }}>
          {Number(d.slice(8))}
        </span>
      ))}
    </>
  );
}

function RuleLanes({ model, band, rates, row, days, known }: { model: Model; band: RuleBand; rates: ReadonlyMap<number, string>; row: number; days: number; known: boolean }) {
  if (band.segments.length === 0 && band.before.length === 0 && band.after.length === 0) {
    return (
      <span className="self-center ps-1 text-[11px] text-muted italic" style={{ gridColumn: daysCol(0, days), gridRow: `${row} / span 1` }}>
        {known ? "No commission rules" : "Not in properties: no rules, no currency"}
      </span>
    );
  }
  const edge = (rules: readonly number[], side: "before" | "after") =>
    rules.length > 0 && (
      <Tooltip delay={150}>
        <Tooltip.Trigger
          className={`flex cursor-help items-center gap-0.5 self-center text-[10.5px] text-muted ${side === "before" ? "justify-end pe-1" : "ps-1"}`}
          style={{ gridColumn: side === "before" ? "2 / span 1" : `${FIRST_DAY_COL + days} / span 1`, gridRow: `${row} / span 1` }}
        >
          {side === "before" && <ArrowLeft className="size-3" />}
          {percentOfBps(model.rules[rules[0]!]!.rate_bps)}
          {side === "after" && <ArrowRight className="size-3" />}
        </Tooltip.Trigger>
        <Tooltip.Content>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{side === "before" ? "Before the report months" : "After the report months"}</span>
            {rules.map((i) => (
              <span key={i}>{ruleText(model, i)}</span>
            ))}
          </div>
        </Tooltip.Content>
      </Tooltip>
    );
  return (
    <>
      {edge(band.before, "before")}
      {band.segments.map((s) => {
        const rule = model.rules[s.rule]!;
        return (
          <Tooltip key={s.rule} delay={150}>
            <Tooltip.Trigger
              className="flex cursor-help flex-col justify-end gap-0.5 px-px pb-1"
              style={{ gridColumn: daysCol(s.start, s.end), gridRow: `${row + s.lane} / span 1` }}
              aria-label={ruleText(model, s.rule)}
            >
              <span className="truncate ps-0.5 text-[10.5px] leading-none text-muted tabular-nums">{percentOfBps(rule.rate_bps)}</span>
              <span className="h-1 rounded-full" style={{ backgroundColor: rates.get(rule.rate_bps) }} />
            </Tooltip.Trigger>
            <Tooltip.Content>
              Commission rule {ruleText(model, s.rule)}
              {band.lanes > 1 && " · overlaps another rule of the villa"}
            </Tooltip.Content>
          </Tooltip>
        );
      })}
      {edge(band.after, "after")}
    </>
  );
}

function BookingLine({
  model,
  b,
  row,
  rates,
  index,
}: {
  model: Model;
  b: BookingRow;
  row: number;
  rates: ReadonlyMap<number, string>;
  index: ReadonlyMap<string, number>;
}) {
  const days = index.size;
  const { open, select } = useEvents();
  const lit = useLit();
  const { r } = b;
  const id = r.reservation_id;
  const dim = (on: boolean) => (on ? "" : "opacity-30");
  const at = (col: string) => ({ gridColumn: col, gridRow: `${row} / span 1` });
  const inWindow = r.nights.filter((x) => x.in_window).length;
  const tone = holdTone(r);
  const stayText = b.stay === null ? "no stay dates" : `${dayText(b.stay.check_in)} → ${dayText(b.stay.check_out)}`;
  const foreign = r.hold && b.stay !== null && b.stay.currency !== "IDR";
  const press = (e: React.KeyboardEvent, f: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      f();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => open({ type: "reservation", id })}
        className={`flex flex-col items-start justify-center rounded-md text-start leading-tight transition-opacity hover:text-accent focus-visible:outline-2 focus-visible:outline-accent ${dim(lit.reservation(id))}`}
        style={at("1 / span 1")}
      >
        <span className="font-mono text-[13px] font-medium">{id}</span>
        <span className="text-[11px] text-muted">{r.hold ? "not in the figures" : `${plural(r.nights.length, "night")}`}</span>
      </button>

      {b.earlier.map(
        (e) =>
          e.span.range !== null && (
            <Tooltip key={e.event.source_event_id} delay={150}>
              <Tooltip.Trigger
                className={`mx-px my-1 cursor-help rounded-[4px] border border-dashed border-muted transition-opacity ${dim(lit.reservation(id))}`}
                style={at(daysCol(e.span.range.start, e.span.range.end))}
                aria-label={`${e.event.source_event_id}: replaced version dates`}
              />
              <Tooltip.Content>
                {e.event.source_event_id}, replaced: {dayText(e.event.check_in)} → {dayText(e.event.check_out)}
              </Tooltip.Content>
            </Tooltip>
          ),
      )}

      {r.hold ? (
        <>
          {b.span.range !== null && (
            <Tooltip delay={150}>
              <Tooltip.Trigger
                className={`mx-px my-1.5 cursor-pointer rounded-[4px] transition-opacity ${dim(lit.reservation(id))}`}
                style={{ ...at(daysCol(b.span.range.start, b.span.range.end)), ...hatch(tone) }}
                aria-label={`${id}: stay not in the figures`}
                onClick={() => select({ kind: "reservation", id })}
                onKeyDown={(e: React.KeyboardEvent) => press(e, () => select({ kind: "reservation", id }))}
              />
              <Tooltip.Content className="max-w-80">
                <HeldBody b={b} stayText={stayText} />
              </Tooltip.Content>
            </Tooltip>
          )}
          {b.noNights !== null && (
            <Tooltip delay={150}>
              <Tooltip.Trigger
                className={`my-1.5 w-1 cursor-pointer rounded-sm transition-opacity ${dim(lit.reservation(id))}`}
                style={{ ...at(daysCol(b.noNights, b.noNights + 1)), ...hatch(tone) }}
                aria-label={`${id}: no nights`}
                onClick={() => select({ kind: "reservation", id })}
                onKeyDown={(e: React.KeyboardEvent) => press(e, () => select({ kind: "reservation", id }))}
              />
              <Tooltip.Content className="max-w-80">
                <HeldBody b={b} stayText={stayText} />
              </Tooltip.Content>
            </Tooltip>
          )}
        </>
      ) : (
        r.nights.map((night) => {
          const i = index.get(night.night);
          if (i === undefined) return null; // counted by the arrow at the edge
          const key = nightKey(id, night.night);
          return (
            <Tooltip key={night.night} delay={150} closeDelay={50}>
              <Tooltip.Trigger
                className={`mx-px my-1.5 cursor-pointer rounded-[4px] transition-opacity ${dim(lit.night(key))}`}
                style={{ ...at(daysCol(i, i + 1)), backgroundColor: rates.get(night.rate_bps) }}
                aria-label={`${id} night of ${dayText(night.night)} at ${percentOfBps(night.rate_bps)}`}
                onClick={() => select({ kind: "reservation", id })}
                onKeyDown={(e: React.KeyboardEvent) => press(e, () => select({ kind: "reservation", id }))}
              />
              <Tooltip.Content placement="top" className="max-w-[26rem] min-w-64">
                <NightBody model={model} id={id} night={night} />
              </Tooltip.Content>
            </Tooltip>
          );
        })
      )}

      <EdgeArrows span={b.span} row={row} days={days} hold={r.hold} dim={dim(lit.reservation(id))} />
      <PaymentMarks marks={b.payments} row={row} days={days} occupied={b.occupied} />

      <div className="flex flex-wrap items-center gap-1.5 ps-3" style={at(`${FIRST_DAY_COL + days + 1} / span 1`)}>
        {r.codes.map((c) => (
          <CodeBadge key={c} code={c} action={actionOf(c)} />
        ))}
        {foreign && (
          <span className="text-xs text-muted whitespace-nowrap">
            {b.stay!.currency} {idrFull(b.stay!.accommodation_gross_idr)}, not converted
          </span>
        )}
        {!r.hold && inWindow < r.nights.length && (
          <span className="text-xs text-muted whitespace-nowrap">{plural(r.nights.length - inWindow, "night")} outside the report months</span>
        )}
      </div>
    </>
  );
}

function HeldBody({ b, stayText }: { b: BookingRow; stayText: string }) {
  const nights = (b.span.range === null ? 0 : b.span.range.end - b.span.range.start) + b.span.before + b.span.after;
  return (
    <div className="flex flex-col gap-1 py-0.5">
      <span className="font-medium">
        {b.r.reservation_id} · {b.r.property_id} · not in the figures
      </span>
      <span className="text-muted">
        {stayText} · {plural(nights, "night")}
        {b.stay !== null && ` · from ${b.stay.source_event_id}${b.r.selected === null ? " (latest row; no version stands)" : ""}`}
      </span>
      {b.r.codes.map((c) => (
        <span key={c}>
          {CODE_META[c].label}: <span className="text-muted">{CODE_META[c].description}</span>
        </span>
      ))}
      <span className="text-muted">No amounts: nothing of it reaches the figures.</span>
    </div>
  );
}

function NightBody({ model, id, night }: { model: Model; id: string; night: Reservation["nights"][number] }) {
  const rule = model.rules[night.rule];
  const exact = exactFee(night.accommodation_gross_idr, night.rate_bps);
  const line = (label: string, value: React.ReactNode) => (
    <>
      <span className="text-muted">{label}</span>
      <span className="text-end tabular-nums">{value}</span>
    </>
  );
  return (
    <div className="flex flex-col gap-1.5 p-0.5">
      <span>
        <span className="font-medium">
          {id} · night of {dayText(night.night)}
        </span>
        <span className="text-muted"> · {monthText(night.month)}</span>
      </span>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-0.5">
        {line("Accommodation", idrFull(night.accommodation_gross_idr))}
        {line("PBJT", idrFull(night.pbjt_idr))}
        {line("OTA fee", idrFull(night.ota_fee_idr))}
        {line("Rule", rule === undefined ? percentOfBps(night.rate_bps) : ruleText(model, night.rule))}
        <div className="col-span-2 border-t border-separator" />
        {line(
          "Mgmt fee",
          <>
            {idrFull(night.accommodation_gross_idr)} × {percentOfBps(night.rate_bps)} ={" "}
            {exact.rounded ? (
              <>
                {exact.text} → <span className="font-semibold">{idrFull(night.management_fee_idr)}</span>
              </>
            ) : (
              <span className="font-semibold">{idrFull(night.management_fee_idr)}</span>
            )}
          </>,
        )}
      </div>
      {exact.rounded && <span className="text-muted">Rounded HALF_UP to the rupiah, night by night.</span>}
    </div>
  );
}

function EdgeArrows({ span, row, days, hold, dim }: { span: Span; row: number; days: number; hold: boolean; dim: string }) {
  const arrow = (count: number, side: "before" | "after") =>
    count > 0 && (
      <Tooltip delay={150}>
        <Tooltip.Trigger
          className={`flex cursor-help items-center gap-0.5 self-center text-[11px] text-muted tabular-nums transition-opacity ${side === "before" ? "justify-end pe-1" : "ps-1"} ${dim}`}
          style={{ gridColumn: side === "before" ? "2 / span 1" : `${FIRST_DAY_COL + days} / span 1`, gridRow: `${row} / span 1` }}
          aria-label={`${plural(count, "night")} ${side} the report months`}
        >
          {side === "before" && <ArrowLeft className="size-3" />}
          {count}
          {side === "after" && <ArrowRight className="size-3" />}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {plural(count, "night")} {side} the report months{hold ? "" : ": listed, not in the figures of the period"}
        </Tooltip.Content>
      </Tooltip>
    );
  return (
    <>
      {arrow(span.before, "before")}
      {arrow(span.after, "after")}
    </>
  );
}

/** Payments of a row; those dated off the axis sit at its edges. Several on one day share the cell. */
function PaymentMarks({
  marks,
  row,
  days,
  occupied = new Set(),
}: {
  marks: readonly PaymentMark[];
  row: number;
  days: number;
  occupied?: ReadonlySet<number>;
}) {
  const groups = new Map<string, { col: string; day: number | null; side: "before" | "after" | null; marks: PaymentMark[] }>();
  for (const m of marks) {
    const col = m.day !== null ? `${FIRST_DAY_COL + m.day} / span 1` : m.side === "before" ? "2 / span 1" : `${FIRST_DAY_COL + days} / span 1`;
    const g = groups.get(col) ?? { col, day: m.day, side: m.side, marks: [] };
    g.marks.push(m);
    groups.set(col, g);
  }
  return (
    <>
      {[...groups.values()].map((g) => (
        <div
          key={g.col}
          className={`pointer-events-none relative z-10 flex items-center gap-0.5 ${g.side === "before" ? "justify-end pe-1" : g.side === "after" ? "ps-1" : "justify-center"}`}
          style={{ gridColumn: g.col, gridRow: `${row} / span 1` }}
        >
          {g.side === "before" && <ArrowLeft className="size-3 shrink-0 text-muted" />}
          {g.marks.map((m) => (
            <Mark key={m.payment_id} m={m} />
          ))}
          {g.day !== null && <MarkLabel marks={g.marks} side={labelSide(g.day, occupied, days)} />}
          {g.side === "after" && <ArrowRight className="size-3 shrink-0 text-muted" />}
        </div>
      ))}
    </>
  );
}

/** The ids next to the marks of a day, "×2" for a repeated payment. */
function MarkLabel({ marks, side }: { marks: readonly PaymentMark[]; side: "right" | "left" | null }) {
  if (side === null) return null;
  return (
    <span
      className={`absolute top-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap text-muted ${side === "right" ? "left-full ms-0.5" : "right-full me-0.5"}`}
    >
      {marks.map((m) => m.payment_id + (m.rows.length > 1 ? ` ×${m.rows.length}` : "")).join(", ")}
    </span>
  );
}

function Mark({ m }: { m: PaymentMark }) {
  const { select } = useEvents();
  const lit = useLit();
  const tone = TONE[MONEY_KIND_META[m.kind].color];
  const pick = () => select({ kind: "payment", id: m.payment_id });
  return (
    <Tooltip delay={150} closeDelay={50}>
      <Tooltip.Trigger
        className={`pointer-events-auto size-3 shrink-0 cursor-pointer rounded-full ring-2 ring-surface transition-opacity ${lit.payment(m.payment_id) ? "" : "opacity-30"}`}
        style={m.filled ? { backgroundColor: tone } : { border: `2px solid ${tone}`, backgroundColor: "var(--surface)" }}
        aria-label={`Payment ${m.payment_id} on ${dayText(m.date)}`}
        onClick={pick}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick();
          }
        }}
      />
      <Tooltip.Content className="max-w-80">
        <PaymentBody m={m} />
      </Tooltip.Content>
    </Tooltip>
  );
}

function PaymentBody({ m }: { m: PaymentMark }) {
  const meta = MONEY_KIND_META[m.kind];
  const amounts = [...new Set(m.rows.map((r) => r.amount_idr))];
  const identical = new Set(m.rows.map((r) => r.content)).size === 1;
  return (
    <div className="flex flex-col gap-1 py-0.5">
      <span>
        <span className="font-medium">{m.payment_id}</span>
        <span className="text-muted">
          {" "}
          · {dayText(m.date)} · for {m.reservation_id}
        </span>
      </span>
      <span className="tabular-nums">{amounts.map((a) => idrFull(a)).join(" / ")} IDR</span>
      <span>
        {meta.label}: <span className="text-muted">{meta.description}</span>
      </span>
      {m.rows.length > 1 && (
        <span className="text-muted">
          {identical ? `×${m.rows.length} identical rows, counted once` : `${m.rows.length} copies differ: in no sum until one is picked`}
        </span>
      )}
      {m.codes.map((c: ExceptionCode) => (
        <span key={c}>
          {CODE_META[c].label}: <span className="text-muted">{CODE_META[c].description}</span>
        </span>
      ))}
    </div>
  );
}
