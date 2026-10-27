"use client";

// How the rows of the file became the figures (docs/EVENTS_VISUALIZATION_PLAN.md, 3.1): a line of steps,
// not a chart — the numbers are small and the difference between steps matters more than a shape.
// Below, the control totals: every row and every rupiah of the file is somewhere.
import { Card } from "@heroui/react";
import { CircleCheck, CircleXmark } from "@gravity-ui/icons";
import { count, idrFull } from "@/lib/format";
import { useEvents } from "./selection";
import { MONEY_KIND_META, MONEY_KIND_ORDER, type FlowStep } from "./view-of";

function plural(n: number, word: string) {
  return `${count(n)} ${word}${n === 1 ? "" : "s"}`;
}

function Step({ step, children, minus = false }: { step?: FlowStep; children: React.ReactNode; minus?: boolean }) {
  const { selection, select } = useEvents();
  const active = step !== undefined && selection?.kind === "flow" && JSON.stringify(selection.step) === JSON.stringify(step);
  const base = "rounded-lg px-2 py-1 text-sm whitespace-nowrap tabular-nums";
  if (step === undefined) return <span className={`${base} font-medium`}>{children}</span>;
  return (
    <button
      type="button"
      onClick={() => select({ kind: "flow", step })}
      className={`${base} cursor-pointer transition-colors ${active ? "bg-accent-soft text-accent-soft-foreground" : minus ? "text-muted hover:bg-surface-secondary" : "font-medium hover:bg-surface-secondary"}`}
    >
      {children}
    </button>
  );
}

const Arrow = () => <span className="text-muted" aria-hidden>→</span>;

export function FlowStrip() {
  const { model } = useEvents();
  const e = model.controls.events;
  const p = model.controls.payments;
  const versions = e.rows - e.duplicate - e.rejected;
  const k = p.kinds;
  const payments = p.rows - k.duplicate.rows - k.rejected.rows;

  const eventsTotal = e.selected + e.superseded + e.duplicate + e.candidate + e.blocked + e.rejected;
  const moneyTotal = MONEY_KIND_ORDER.reduce((n, kind) => n + k[kind].amount, 0);

  return (
    <Card className="gap-4">
      <Card.Header>
        <Card.Title>How the rows became the figures</Card.Title>
        <Card.Description>Each step drops or sets aside rows; click a step to light up its records.</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <span className="w-20 text-sm text-muted">Events</span>
          <Step>{plural(e.rows, "row")}</Step>
          {e.duplicate > 0 && (
            <>
              <Arrow />
              <Step minus step={{ side: "events", part: "duplicate" }}>−{plural(e.duplicate, "duplicate")}</Step>
            </>
          )}
          {e.rejected > 0 && (
            <>
              <Arrow />
              <Step minus step={{ side: "events", part: "rejected" }}>−{count(e.rejected)} rejected</Step>
            </>
          )}
          <Arrow />
          <Step>{plural(versions, "version")}</Step>
          {e.superseded > 0 && (
            <>
              <Arrow />
              <Step minus step={{ side: "events", part: "superseded" }}>−{count(e.superseded)} superseded</Step>
            </>
          )}
          <Arrow />
          <Step>{plural(e.bookings, "booking")}</Step>
          {e.candidate + e.blocked > 0 && (
            <Step step={{ side: "events", part: "candidate" }}>({plural(e.candidate, "disputed record")})</Step>
          )}
          {e.held_bookings > 0 && (
            <>
              <Arrow />
              <Step minus step={{ side: "events", part: "held" }}>−{count(e.held_bookings)} out of the figures</Step>
            </>
          )}
          <Arrow />
          <Step step={{ side: "events", part: "in_figures" }}>{count(e.in_figures)} in figures</Step>
          <span className="text-sm text-muted">· {plural(e.nights, "night")}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <span className="w-20 text-sm text-muted">Payments</span>
          <Step>{plural(p.rows, "row")}</Step>
          {k.duplicate.rows > 0 && (
            <>
              <Arrow />
              <Step minus step={{ side: "payments", part: "duplicate" }}>−{plural(k.duplicate.rows, "duplicate")}</Step>
            </>
          )}
          {k.rejected.rows > 0 && (
            <>
              <Arrow />
              <Step minus step={{ side: "payments", part: "rejected" }}>−{count(k.rejected.rows)} rejected</Step>
            </>
          )}
          <Arrow />
          <Step>{plural(payments, "payment")}</Step>
          <Arrow />
          {MONEY_KIND_ORDER.filter((kind) => kind !== "duplicate" && kind !== "rejected" && k[kind].rows > 0).map((kind, i) => (
            <span key={kind} className="flex items-center">
              {i > 0 && <span className="px-1 text-muted">|</span>}
              <Step step={{ side: "payments", part: kind }}>
                <span className="font-normal text-muted">{MONEY_KIND_META[kind].label.toLowerCase()}</span> {count(k[kind].rows)} · {idrFull(k[kind].amount)}
              </Step>
            </span>
          ))}
        </div>

        <div className="mt-1 flex flex-col gap-1 border-t border-separator pt-3 text-sm">
          <Control ok={eventsTotal === e.rows}>
            Event rows {count(e.rows)} = selected {count(e.selected)} + superseded {count(e.superseded)} + duplicates {count(e.duplicate)}
            {e.candidate > 0 && ` + disputed ${count(e.candidate)}`}
            {e.blocked > 0 && ` + waiting ${count(e.blocked)}`}
            {e.rejected > 0 && ` + rejected ${count(e.rejected)}`}
          </Control>
          <Control ok={moneyTotal === p.amount}>
            Payments file IDR {idrFull(p.amount)} ={" "}
            {MONEY_KIND_ORDER.filter((kind) => k[kind].rows > 0)
              .map((kind) => `${MONEY_KIND_META[kind].label.toLowerCase()} ${idrFull(k[kind].amount)}`)
              .join(" + ")}
          </Control>
        </div>
      </Card.Content>
    </Card>
  );
}

function Control({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2">
      {ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" /> : <CircleXmark className="mt-0.5 size-3.5 shrink-0 text-danger" />}
      <span className="tabular-nums">{children}</span>
    </span>
  );
}
