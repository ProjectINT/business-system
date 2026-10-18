"use client";

// Cases a human will decide on (VALIDATION_PLAN.md 7.5), level 1: a list, villa → case → bookings, no
// decision buttons. Each case shows its bookings night by night — the shape of the overlap is easier to
// read than a list of pairs — and the number of bookings on every night.
import { Card, Chip, Tooltip } from "@heroui/react";
import { addDays, nightsBetween, type CalendarDate } from "@/lib/calc";
import type { RuleInfo } from "@/lib/data";
import { count } from "@/lib/format";
import { RuleBadges } from "@/components/rules/rule-badge";
import { CASE_TYPE_LABEL, KIND_LABEL } from "./labels";
import type { CaseCardView, CaseRowView, VillaView } from "./view-of";

interface Props {
  villas: VillaView[];
  ruleOf: ReadonlyMap<string, RuleInfo>;
  onOpen: (unitId: string) => void;
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function dateText(d: string, withMonth = true): string {
  return (withMonth ? DAY_MONTH : DAY).format(new Date(`${d}T00:00:00Z`));
}

function spanText(from: string | null, to: string | null): string {
  if (from === null || to === null) return "no stay dates";
  return `${dateText(from)} → ${dateText(to)}`;
}

export function CaseList({ villas, ruleOf, onOpen }: Props) {
  return (
    <div className="flex flex-col gap-8">
      {villas.map((v) => (
        <section key={v.propertyId} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-base font-semibold">{v.propertyId}</h3>
            <span className="text-sm text-muted">
              {[v.name, v.cluster].filter((x) => x !== null).join(" · ")} · {v.cases.length} case{v.cases.length === 1 ? "" : "s"}
            </span>
          </div>
          {v.cases.map((c) => (
            <CaseCard key={c.caseKey} c={c} ruleOf={ruleOf} onOpen={onOpen} />
          ))}
        </section>
      ))}
    </div>
  );
}

function CaseCard({ c, ruleOf, onOpen }: { c: CaseCardView; ruleOf: ReadonlyMap<string, RuleInfo>; onOpen: (unitId: string) => void }) {
  const nights = c.from !== null && c.to !== null ? nightsBetween(c.from as CalendarDate, c.to as CalendarDate) : 0;
  const days = Array.from({ length: nights }, (_, i) => addDays(c.from as CalendarDate, i));
  const perNight = days.map((d) => c.rows.filter((r) => r.checkIn !== null && r.checkOut !== null && r.checkIn <= d && d < r.checkOut).length);

  return (
    <Card variant="secondary" className="gap-4">
      <Card.Header className="flex-row flex-wrap items-center gap-x-3 gap-y-2">
        <Card.Title className="text-sm">{spanText(c.from, c.to)}</Card.Title>
        <span className="text-sm text-muted">
          {count(c.rows.length)} booking{c.rows.length === 1 ? "" : "s"}
          {c.pairs > 0 && ` · ${count(c.pairs)} overlapping pair${c.pairs === 1 ? "" : "s"} · up to ${c.maxPerNight} a night`}
          {c.gross !== null && ` · GBV ${c.gross}`}
        </span>
        <div className="ms-auto flex flex-wrap gap-1">
          <Chip size="sm" variant="soft">
            {CASE_TYPE_LABEL[c.type]}
          </Chip>
          {c.kinds.map((k) => (
            <Chip key={k} size="sm" variant="soft" color={k === "same_dates" ? "danger" : k === "modified_version" ? "warning" : "default"}>
              {KIND_LABEL[k] ?? k}
            </Chip>
          ))}
          {c.type === "conflict" && c.hasModified && !c.kinds.includes("modified_version") && (
            <Chip size="sm" variant="soft" color="warning">
              Modified booking
            </Chip>
          )}
        </div>
      </Card.Header>

      <Card.Content className="overflow-x-auto">
        <div
          className="grid min-w-[760px] items-center gap-x-3 gap-y-1.5 text-sm"
          style={{ gridTemplateColumns: "6.5rem 7.5rem 7.5rem minmax(14rem, 1fr) 7rem" }}
        >
          <span className="text-xs text-muted">Booking</span>
          <span className="text-end text-xs text-muted">GBV, IDR</span>
          <span className="text-end text-xs text-muted">Paid, IDR</span>
          <Nights days={days} render={(d, i) => (i === 0 || d.endsWith("-01") ? dateText(d) : dateText(d, false))} muted />
          <span className="text-xs text-muted">Other flags</span>

          {c.rows.map((r) => (
            <Row key={r.unitId} r={r} days={days} from={c.from} ruleOf={ruleOf} onOpen={onOpen} />
          ))}

          {days.length > 0 && c.rows.length > 1 && (
            <>
              <span className="col-span-3 text-xs text-muted">Bookings per night</span>
              <Nights
                days={days}
                render={(_, i) => String(perNight[i])}
                tone={(i) => (perNight[i]! > 1 ? "bg-danger/15 text-danger" : "text-muted")}
              />
              <span />
            </>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}

function Nights({
  days,
  render,
  tone,
  muted = false,
}: {
  days: string[];
  render: (d: string, i: number) => string;
  tone?: (i: number) => string;
  muted?: boolean;
}) {
  if (days.length === 0) return <span />;
  return (
    <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((d, i) => (
        <span
          key={d}
          className={`rounded-sm text-center text-[11px] tabular-nums ${muted ? "text-muted" : ""} ${tone?.(i) ?? ""}`}
        >
          {render(d, i)}
        </span>
      ))}
    </div>
  );
}

function Row({
  r,
  days,
  from,
  ruleOf,
  onOpen,
}: {
  r: CaseRowView;
  days: string[];
  from: string | null;
  ruleOf: ReadonlyMap<string, RuleInfo>;
  onOpen: (unitId: string) => void;
}) {
  const modified = r.reservationStatus === "modified";
  const start = from !== null && r.checkIn !== null ? nightsBetween(from as CalendarDate, r.checkIn as CalendarDate) : 0;
  const overlapText = r.overlaps.map((o) => `${o.with}: ${o.nights} night${o.nights === 1 ? "" : "s"}`).join(", ");

  return (
    <>
      <button
        type="button"
        onClick={() => onOpen(r.unitId)}
        className="flex flex-col items-start rounded-md text-start leading-tight hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="font-mono text-[13px] font-medium">{r.key}</span>
        <span className="text-xs text-muted">
          {r.reservationStatus ?? "—"}
          {r.channel !== null && ` · ${r.channel}`}
        </span>
      </button>
      <span className="text-end tabular-nums">{r.gross ?? "—"}</span>
      <span className="text-end tabular-nums text-muted">
        {r.paid === null ? "—" : (
          <Tooltip delay={200}>
            <Tooltip.Trigger>
              <span className="cursor-help text-foreground">{r.paid}</span>
            </Tooltip.Trigger>
            <Tooltip.Content>{r.paymentIds.join(", ")} · waits with the booking</Tooltip.Content>
          </Tooltip>
        )}
      </span>
      {days.length === 0 || r.nights === null ? (
        <span className="text-xs text-muted">{r.checkIn === null ? "no stay" : `${r.checkIn} → ${r.checkOut}`}</span>
      ) : (
        <div className="grid h-6 gap-px" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          <Tooltip delay={150}>
            {/* The trigger is the bar itself: it renders a div, so it can take the grid columns. */}
            <Tooltip.Trigger
              className={`h-6 cursor-help rounded-md ${modified ? "bg-warning/70" : "bg-accent/70"}`}
              style={{ gridColumn: `${start + 1} / span ${r.nights}` }}
              aria-label={`${r.key}: ${r.checkIn} to ${r.checkOut}`}
            />
            <Tooltip.Content>
              {r.checkIn} → {r.checkOut} · {r.nights} night{r.nights === 1 ? "" : "s"}
              {overlapText !== "" && ` · overlaps ${overlapText}`}
            </Tooltip.Content>
          </Tooltip>
        </div>
      )}
      <RuleBadges rules={r.flags.map((id) => ({ id, action: ruleOf.get(id)?.action }))} />
    </>
  );
}
