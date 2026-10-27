"use client";

// The feed of events (docs/EVENTS_VISUALIZATION_PLAN.md, 3.4): per booking, its versions left to right
// by updated_at — the rightmost stands (ТЗ 10). Versions at the same time stand in one column: the same
// content is one version, different content is a dispute. Exact copies of an event lie in a stack and
// count once (ТЗ 9); copies of one event with different content are spread out, the differing fields
// marked. Clicking a card lights up its booking, clicking the booking's name opens its card.
import { Button, Card, Chip, Tooltip } from "@heroui/react";
import { ArrowRight } from "@gravity-ui/icons";
import { useMemo, type KeyboardEvent } from "react";
import { idrFull } from "@/lib/format";
import { CodeBadge } from "./code-badge";
import {
  amountText,
  BOOKING_STATE_META,
  bookingStateOf,
  caseKeysOfReservation,
  disputesOfReservation,
  feedOf,
  isAmount,
  type BookingFeed,
  type Change,
  type Column,
  type CopyStack,
  type Field,
  type VersionCard,
} from "./feed-layout";
import { useEvents, useLit } from "./selection";
import { dayText, eventFateMeta, instantText, type EventRow } from "./view-of";

export function EventFeed() {
  const { model } = useEvents();
  const feed = useMemo(() => feedOf(model), [model]);

  return (
    <Card className="gap-4">
      <Card.Header className="flex flex-col gap-1">
        <Card.Title>Event feed: what was replaced and why</Card.Title>
        <Card.Description>
          Each booking&apos;s versions from left to right by updated_at: the latest one stands, every earlier one is replaced. An exact
          copy of an event is counted once. Two different versions at the same latest time, or copies of one event that differ, wait for
          a person to pick one. Click a card to light up its booking, a booking&apos;s name to open its card.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col divide-y divide-separator">
        {feed.length === 0 ? (
          <p className="text-sm text-muted">No reservation events in this case.</p>
        ) : (
          feed.map((b) => <Booking key={b.reservation.reservation_id} b={b} />)
        )}
      </Card.Content>
    </Card>
  );
}

function Booking({ b }: { b: BookingFeed }) {
  const { model, open, review } = useEvents();
  const lit = useLit();
  const r = b.reservation;
  const state = BOOKING_STATE_META[bookingStateOf(model, r)];
  const keys = caseKeysOfReservation(model, r);
  const decided = model.applied.some((a) => keys.has(a.decision.case_key));
  const disputes = disputesOfReservation(model, r).map((d) => d.case_key);
  const toReview = disputes.length === 0 && r.codes.includes("AMBIGUOUS_VERSION") ? [`version:${r.reservation_id}`] : disputes;

  return (
    <section className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 transition-opacity ${lit.reservation(r.reservation_id) ? "" : "opacity-40"}`}>
        <button
          type="button"
          onClick={() => open({ type: "reservation", id: r.reservation_id })}
          className="rounded-md text-start hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="font-mono text-sm font-semibold">{r.reservation_id}</span>
          <span className="text-sm text-muted"> · {r.property_id}</span>
        </button>
        <Tooltip delay={200}>
          <Tooltip.Trigger className="cursor-help">
            <Chip size="sm" variant="soft" color={state.color}>
              {state.label}
            </Chip>
          </Tooltip.Trigger>
          <Tooltip.Content className="max-w-72">{state.description}</Tooltip.Content>
        </Tooltip>
        {decided && (
          <Chip size="sm" variant="soft">
            Decided by a person
          </Chip>
        )}
        {r.codes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {r.codes.map((code) => (
              <CodeBadge key={code} code={code} />
            ))}
          </div>
        )}
        <span className="text-xs text-muted">
          {r.rows.length} row{r.rows.length === 1 ? "" : "s"} in the feed
        </span>
        {toReview.length > 0 && (
          <div className="ms-auto flex gap-2">
            {toReview.map((key) => (
              <Button key={key} size="sm" variant="secondary" onPress={() => review(key)}>
                Review{toReview.length > 1 ? ` ${key.slice(key.indexOf(":") + 1)}` : ""}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto pb-1.5">
        <div className="flex w-max items-stretch gap-1">
          {b.columns.map((col, i) => (
            <div key={col.updated_at} className="flex items-stretch gap-1">
              {i > 0 && <Arrow from={b.columns[i - 1]!} />}
              <ColumnView col={col} reservation_id={r.reservation_id} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** "replaced by" when the column on the left lost to a later version; otherwise just the order in time. */
function Arrow({ from }: { from: Column }) {
  const replaced = from.stacks.some((s) => s.cards.some((c) => c.primary.fate.kind === "superseded"));
  return (
    <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 text-[11px] text-muted" aria-hidden>
      <span>{replaced ? "replaced" : "then"}</span>
      <ArrowRight className="size-4" />
      {replaced && <span>by</span>}
    </div>
  );
}

function ColumnView({ col, reservation_id }: { col: Column; reservation_id: string }) {
  const fates = col.stacks.flatMap((s) => s.cards.map((c) => c.primary.fate));
  const ambiguous = fates.some((f) => f.kind === "candidate" && f.code === "AMBIGUOUS_VERSION");
  const picked = fates.some((f) => f.kind === "rejected");
  return (
    <div className={`flex w-64 shrink-0 flex-col gap-2 ${col.tieDiffers ? "rounded-xl border border-dashed border-accent/60 p-1.5" : ""}`}>
      {col.tie && (
        <div className="flex items-start gap-1.5 px-0.5 text-xs text-muted">
          {ambiguous && <CodeBadge code="AMBIGUOUS_VERSION" />}
          <span>
            {!col.tieDiffers
              ? "Same time, same content: one version"
              : ambiguous
                ? "Same time, different content: nothing says which came last"
                : picked
                  ? "Same time, different content: a person picked one"
                  : "Same time, different content"}
          </span>
        </div>
      )}
      {col.stacks.map((s) => (
        <StackView key={s.source_event_id} s={s} reservation_id={reservation_id} />
      ))}
    </div>
  );
}

function StackView({ s, reservation_id }: { s: CopyStack; reservation_id: string }) {
  if (!s.conflicting) return <VersionCardView card={s.cards[0]!} reservation_id={reservation_id} />;
  const open = s.cards.some((c) => c.primary.fate.kind === "candidate");
  const copies = s.cards.reduce((n, c) => n + c.rows.length, 0);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-accent/60 p-1.5">
      <div className="flex items-start gap-1.5 px-0.5 text-xs text-muted">
        <CodeBadge code="CONFLICTING_EVENT" action={open ? "decide" : "info"} />
        <span>
          <span className="font-mono text-foreground">{s.source_event_id}</span> · {copies} copies, different content
          {open ? ": pick the right one" : ": a person picked one"}
        </span>
      </div>
      {s.cards.map((c) => (
        <VersionCardView key={c.primary.row} card={c} reservation_id={reservation_id} />
      ))}
    </div>
  );
}

const pressKeys = new Set(["Enter", " "]);

function VersionCardView({ card, reservation_id }: { card: VersionCard; reservation_id: string }) {
  const { select } = useEvents();
  const lit = useLit();
  const e = card.primary;
  const copies = card.rows.length;
  const isLit = card.rows.some((r) => lit.eventRow(r.row));
  const pick = () => select({ kind: "reservation", id: reservation_id });
  const mark = (f: Field) => (card.differing.has(f) ? "rounded-sm bg-accent/15 px-1 text-accent" : "");

  return (
    <div className={`relative transition-opacity ${isLit ? "" : "opacity-40"} ${copies > 1 ? "me-1.5 mb-1.5" : ""}`}>
      {copies > 1 && (
        // The copies behind the card: an identical stack.
        <div aria-hidden className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl border border-separator bg-surface-secondary" />
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={pick}
        onKeyDown={(ev: KeyboardEvent) => {
          if (pressKeys.has(ev.key)) {
            ev.preventDefault();
            pick();
          }
        }}
        aria-label={`${e.source_event_id}, row ${e.row}`}
        className="relative flex cursor-pointer flex-col gap-1.5 rounded-xl border border-separator bg-surface-secondary p-3 text-sm hover:border-muted/60 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-[13px] font-medium">{e.source_event_id}</span>
          {copies > 1 && <span className="shrink-0 text-xs text-muted">×{copies}</span>}
        </div>
        <span className="text-xs text-muted">{instantText(e.updated_at)}</span>
        <span className="text-xs">
          <span className={mark("status")}>{e.status}</span> · <span className={mark("check_in")}>{dayText(e.check_in)}</span> →{" "}
          <span className={mark("check_out")}>{dayText(e.check_out)}</span>
          {card.differing.has("property_id") && <span className={mark("property_id")}> · {e.property_id}</span>}
        </span>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <AmountLine label="Accommodation" field="accommodation_gross_idr" e={e} card={card} mark={mark} />
          <AmountLine label="PBJT" field="pbjt_idr" e={e} card={card} mark={mark} />
          <AmountLine label="OTA fee" field="ota_fee_idr" e={e} card={card} mark={mark} />
        </dl>
        {e.currency !== "IDR" && <span className="text-xs text-muted">In {e.currency}, not converted to IDR</span>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
          <FateChip e={e} />
          {copies > 1 && <span className="text-xs text-muted">×{copies} identical, counted once</span>}
        </div>
        {card.changes !== null && <Changes changes={card.changes} currency={e.currency} />}
      </div>
    </div>
  );
}

type AmountField = "accommodation_gross_idr" | "pbjt_idr" | "ota_fee_idr";

function AmountLine({ label, field, e, card, mark }: { label: string; field: AmountField; e: EventRow; card: VersionCard; mark: (f: Field) => string }) {
  const change = card.changes?.find((c) => c.field === field);
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-end tabular-nums">
        <span className={mark(field)}>{amountText(e[field], e.currency)}</span>
        {change !== undefined && <Direction change={change} />}
      </dd>
    </>
  );
}

function Direction({ change }: { change: Change }) {
  if (change.direction === null) return null;
  return (
    <span className="ms-1" aria-label={change.direction === "up" ? "raised" : "lowered"}>
      {change.direction === "up" ? "▲" : "▼"}
    </span>
  );
}

function valueText(c: Change, v: string | number, currency: string): string {
  if (isAmount(c.field)) return typeof v === "number" ? amountText(v, currency) : String(v);
  if (c.field === "check_in" || c.field === "check_out") return dayText(String(v));
  return typeof v === "number" ? idrFull(v) : v;
}

function Changes({ changes, currency }: { changes: Change[]; currency: string }) {
  if (changes.length === 0) return <span className="text-xs text-muted">Same content as the version before</span>;
  return (
    <div className="flex flex-col gap-0.5 border-t border-separator pt-1.5 text-xs">
      <span className="text-muted">Changed against the version before</span>
      {changes.map((c) => (
        <span key={c.field}>
          <span className="text-muted">{c.label}</span> {valueText(c, c.was, currency)} → {valueText(c, c.now, currency)}
          <Direction change={c} />
        </span>
      ))}
    </div>
  );
}

/** The fate of a row as a chip, what it means on hover. */
export function FateChip({ e }: { e: EventRow }) {
  const meta = eventFateMeta(e.fate);
  return (
    <Tooltip delay={200}>
      <Tooltip.Trigger className="cursor-help">
        <Chip size="sm" variant="soft" color={meta.color}>
          {meta.label}
        </Chip>
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-72">{meta.description}</Tooltip.Content>
    </Tooltip>
  );
}
