"use client";

// The card of a booking or a payment of /events (docs/EVENTS_VISUALIZATION_PLAN.md, 3.4). A booking:
// its versions with their fates, the snapshot that stands, its nights — the report's trace laid out
// night by night with the rule and the fee as a formula — its payments and where their money went, its
// exceptions and the decision applied to it. A payment: its copies, its kind of money and why, the
// booking it names and its exceptions.
import { Button, Chip, Drawer } from "@heroui/react";
import type { ExceptionCode } from "@/lib/nightly";
import { idrFull } from "@/lib/format";
import { CodeBadge } from "./code-badge";
import { FateChip } from "./event-feed";
import { actionOf, CODE_META } from "./exception-meta";
import { amountText, BOOKING_STATE_META, bookingStateOf, caseKeysOfReservation, disputesOfReservation } from "./feed-layout";
import { useEvents } from "./selection";
import {
  dayText,
  instantText,
  MONEY_KIND_META,
  moneyKindOf,
  monthText,
  percentOfBps,
  type Model,
  type PaymentRow,
  type Reservation,
} from "./view-of";

export function EventRecordDrawer() {
  const { opened, open } = useEvents();
  return (
    // Opened from the feed, the calendar and the lists, so the overlay is controlled and has no trigger of its own.
    <Drawer.Backdrop isOpen={opened !== null} onOpenChange={(isOpen) => !isOpen && open(null)}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="w-full sm:w-[44rem]">
          {opened?.type === "reservation" && <BookingCard id={opened.id} />}
          {opened?.type === "payment" && <PaymentCard id={opened.id} />}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

const DECIDE: ReadonlySet<ExceptionCode> = new Set(["AMBIGUOUS_VERSION", "CONFLICTING_EVENT", "CONFLICTING_PAYMENT"]);

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {title}
        {hint !== undefined && <span className="font-normal text-muted"> · {hint}</span>}
      </h3>
      {children}
    </section>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <>
      <Drawer.CloseTrigger />
      <Drawer.Header>
        <Drawer.Heading className="font-mono text-lg">{what}</Drawer.Heading>
      </Drawer.Header>
      <Drawer.Body>
        <p className="text-sm text-muted">Not in this case.</p>
      </Drawer.Body>
    </>
  );
}

// ── booking ────────────────────────────────────────────────────────────────

function BookingCard({ id }: { id: string }) {
  const { model } = useEvents();
  const r = model.reservations.find((x) => x.reservation_id === id);
  if (r === undefined) return <Missing what={id} />;
  const state = BOOKING_STATE_META[bookingStateOf(model, r)];
  const nights = r.nights.length;

  return (
    <>
      <Drawer.CloseTrigger />
      <Drawer.Header className="gap-2">
        <Drawer.Heading className="font-mono text-lg">{r.reservation_id}</Drawer.Heading>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Chip size="sm" variant="soft" color={state.color}>
            {state.label}
          </Chip>
          <span>
            Villa {r.property_id} · {r.rows.length} row{r.rows.length === 1 ? "" : "s"} in the feed
            {nights > 0 && ` · ${nights} night${nights === 1 ? "" : "s"}`}
          </span>
        </div>
        <p className="text-sm text-muted">{state.description}.</p>
      </Drawer.Header>

      <Drawer.Body className="flex flex-col gap-6">
        <Versions model={model} r={r} />
        <Snapshot model={model} r={r} />
        <Nights model={model} r={r} />
        <BookingPayments model={model} r={r} />
        <Exceptions
          items={r.codes.map((code) => ({ code, record_type: "reservation" as const }))}
          cases={disputesOfReservation(model, r).map((d) => d.case_key)}
          empty="None: the booking passed every check."
        />
        <Decisions model={model} keys={caseKeysOfReservation(model, r)} />
      </Drawer.Body>
    </>
  );
}

function Versions({ model, r }: { model: Model; r: Reservation }) {
  const rows = model.events
    .filter((e) => r.rows.includes(e.row))
    .sort((a, b) => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : a.row - b.row));
  return (
    <Section title="Versions" hint="oldest first: the latest updated_at stands">
      <ol className="flex flex-col divide-y divide-separator rounded-xl border border-separator">
        {rows.map((e) => (
          <li key={e.row} className="flex items-start gap-3 px-3 py-2.5">
            <div className="w-24 shrink-0">
              <FateChip e={e} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm">
                <span className="font-mono text-[13px] font-medium">{e.source_event_id}</span>
                <span className="text-xs text-muted"> · row {e.row} · {instantText(e.updated_at)}</span>
              </span>
              <span className="text-xs text-muted">
                {e.status} · {dayText(e.check_in)} → {dayText(e.check_out)} · {amountText(e.accommodation_gross_idr, e.currency)} /{" "}
                {amountText(e.pbjt_idr, e.currency)} / {amountText(e.ota_fee_idr, e.currency)}
              </span>
              <span className="text-xs text-muted">{fateDetail(e.fate)}</span>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function fateDetail(f: Model["events"][number]["fate"]): string {
  switch (f.kind) {
    case "selected":
      return f.in_figures ? "Stands: its nights are in the figures" : "Stands, but the booking is held by a check";
    case "duplicate":
      return `An exact copy of row ${f.of}, counted once`;
    case "superseded":
      return f.by === null ? "Replaced by later versions, which are in dispute" : `Replaced by ${f.by}`;
    case "candidate":
      return `${CODE_META[f.code].label}: awaits a person's choice`;
    case "blocked":
      return "Another event of this booking is disputed: the booking waits for it";
    case "rejected":
      return "Not picked by a person's decision";
  }
}

function Snapshot({ model, r }: { model: Model; r: Reservation }) {
  const e = r.selected === null ? undefined : model.events.find((x) => x.source_event_id === r.selected && x.fate.kind === "selected");
  if (e === undefined) {
    const reason = r.codes.find((c) => DECIDE.has(c));
    return (
      <Section title="Selected snapshot">
        <p className="text-sm text-muted">{reason !== undefined ? `No version stands: ${CODE_META[reason].description}` : "No version stands."}</p>
      </Section>
    );
  }
  const fields: [string, string][] = [
    ["source_event_id", e.source_event_id],
    ["updated_at", instantText(e.updated_at)],
    ["status", e.status],
    ["property_id", e.property_id],
    ["check_in", dayText(e.check_in)],
    ["check_out", dayText(e.check_out)],
    ["accommodation", amountText(e.accommodation_gross_idr, e.currency)],
    ["PBJT", amountText(e.pbjt_idr, e.currency)],
    ["OTA fee", amountText(e.ota_fee_idr, e.currency)],
    ["currency", e.currency],
  ];
  return (
    <Section title="Selected snapshot" hint={r.hold ? "stands, but held" : "the version in the figures"}>
      <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-separator px-3 py-2.5 text-sm">
        {fields.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-muted">{name}</dt>
            <dd className="break-all font-mono text-[13px]">{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

const EXACT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

/** "1,100,000 × 20% = 220,000"; when HALF_UP rounded, the exact fraction first. */
function feeFormula(n: Reservation["nights"][number]): string {
  const base = `${idrFull(n.accommodation_gross_idr)} × ${percentOfBps(n.rate_bps)} = `;
  const scaled = n.accommodation_gross_idr * n.rate_bps;
  if (scaled % 10000 === 0) return `${base}${idrFull(n.management_fee_idr)}`;
  return `${base}${EXACT.format(scaled / 10000)} → ${idrFull(n.management_fee_idr)}`;
}

function ruleText(model: Model, index: number): string {
  const rule = model.rules[index];
  if (rule === undefined) return "no rule";
  const to = rule.effective_to === null ? "open-ended" : dayText(rule.effective_to);
  return `${rule.property_id} · ${dayText(rule.effective_from)} – ${to}`;
}

function Nights({ model, r }: { model: Model; r: Reservation }) {
  if (r.nights.length === 0) {
    return (
      <Section title="Nights">
        <p className="text-sm text-muted">No nights accrued: the booking is out of the figures.</p>
      </Section>
    );
  }
  const months = [...new Set(r.nights.map((n) => n.month))];
  const outside = r.nights.filter((n) => !n.in_window);
  const sum = (list: Reservation["nights"], key: "accommodation_gross_idr" | "pbjt_idr" | "ota_fee_idr" | "management_fee_idr") =>
    list.reduce((a, n) => a + n[key], 0);

  return (
    <Section title="Nights" hint="amounts in IDR, the fee rounded HALF_UP per night">
      <div className="overflow-x-auto rounded-xl border border-separator">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-separator text-xs text-muted">
              <th className="px-3 py-2 text-start font-normal">Night</th>
              <th className="px-3 py-2 text-end font-normal">Accommodation</th>
              <th className="px-3 py-2 text-end font-normal">PBJT</th>
              <th className="px-3 py-2 text-end font-normal">OTA fee</th>
              <th className="px-3 py-2 text-start font-normal">Rate · rule</th>
              <th className="px-3 py-2 text-end font-normal">Mgmt fee</th>
            </tr>
          </thead>
          {months.map((m) => {
            const list = r.nights.filter((n) => n.month === m);
            const inWindow = list[0]!.in_window;
            return (
              <tbody key={m} className={`border-b border-separator last:border-b-0 ${inWindow ? "" : "text-muted"}`}>
                <tr>
                  <td colSpan={6} className="px-3 pt-2 pb-1 text-xs font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {monthText(m)}
                      {!inWindow && (
                        <>
                          <span className="font-normal text-muted">· outside the report months</span>
                          <CodeBadge code="OUTSIDE_REPORT_MONTHS" />
                        </>
                      )}
                    </span>
                  </td>
                </tr>
                {list.map((n) => (
                  <tr key={n.night}>
                    <td className="px-3 py-1 whitespace-nowrap">{dayText(n.night)}</td>
                    <td className="px-3 py-1 text-end tabular-nums">{idrFull(n.accommodation_gross_idr)}</td>
                    <td className="px-3 py-1 text-end tabular-nums">{idrFull(n.pbjt_idr)}</td>
                    <td className="px-3 py-1 text-end tabular-nums">{idrFull(n.ota_fee_idr)}</td>
                    <td className="px-3 py-1 whitespace-nowrap">
                      {percentOfBps(n.rate_bps)} <span className="text-xs text-muted">· {ruleText(model, n.rule)}</span>
                    </td>
                    <td className="px-3 py-1 text-end whitespace-nowrap tabular-nums">{feeFormula(n)}</td>
                  </tr>
                ))}
                <tr className="text-xs">
                  <td className="px-3 pt-1 pb-2 text-muted">
                    {list.length} night{list.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-3 pt-1 pb-2 text-end font-medium tabular-nums">{idrFull(sum(list, "accommodation_gross_idr"))}</td>
                  <td className="px-3 pt-1 pb-2 text-end font-medium tabular-nums">{idrFull(sum(list, "pbjt_idr"))}</td>
                  <td className="px-3 pt-1 pb-2 text-end font-medium tabular-nums">{idrFull(sum(list, "ota_fee_idr"))}</td>
                  <td />
                  <td className="px-3 pt-1 pb-2 text-end font-medium tabular-nums">{idrFull(sum(list, "management_fee_idr"))}</td>
                </tr>
              </tbody>
            );
          })}
        </table>
      </div>
      {outside.length > 0 && (
        <p className="text-xs text-muted">
          {outside.length} night{outside.length === 1 ? "" : "s"} outside the report months: accrued to {outside.length === 1 ? "its" : "their"}{" "}
          own month, not in the figures of this period.
        </p>
      )}
    </Section>
  );
}

/** Where a payment's money went, in words. */
function paymentWhy(p: PaymentRow): string {
  const f = p.fate;
  switch (f.kind) {
    case "received":
      return f.counted ? `In ${f.property_id}'s cash for ${monthText(f.month)}` : `Dated ${monthText(f.month)}, outside the report months`;
    case "held":
      return `${CODE_META[f.code].label}. ${CODE_META[f.code].description}`;
    case "unmatched":
      return `No booking ${p.reservation_id} in the feed: kept as unmatched, given to no villa`;
    case "duplicate":
      return `An exact copy of row ${f.of}, counted once`;
    case "conflicting":
      return "Copies of this payment differ: no single amount, in no sum";
    case "rejected":
      return "Not picked by a person's decision";
  }
}

function KindChip({ p }: { p: PaymentRow }) {
  const meta = MONEY_KIND_META[moneyKindOf(p)];
  return (
    <Chip size="sm" variant="soft" color={meta.color}>
      {meta.label}
    </Chip>
  );
}

function BookingPayments({ model, r }: { model: Model; r: Reservation }) {
  const { open } = useEvents();
  const rows = model.payments.filter((p) => r.payments.includes(p.row));
  return (
    <Section title="Payments" hint="by payment date, not by the nights they pay for">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No payment names this booking.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-separator rounded-xl border border-separator">
          {rows.map((p) => (
            <li key={p.row} className="flex items-start gap-3 px-3 py-2.5">
              <div className="w-24 shrink-0">
                <KindChip p={p} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <Button size="sm" variant="tertiary" className="h-6 px-2 font-mono text-xs" onPress={() => open({ type: "payment", id: p.payment_id })}>
                    {p.payment_id}
                  </Button>
                  <span className="text-xs text-muted">
                    row {p.row} · {dayText(p.payment_date)} · {p.status}
                  </span>
                  <span className="ms-auto tabular-nums">{idrFull(p.amount_idr)}</span>
                </span>
                <span className="text-xs text-muted">{paymentWhy(p)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

// ── exceptions and decisions ───────────────────────────────────────────────

function Exceptions({
  items,
  cases,
  empty,
}: {
  items: { code: ExceptionCode; record_type: "reservation" | "payment"; action?: ReturnType<typeof actionOf> }[];
  /** Open disputes of the record: a decide code gets a Review button. */
  cases: string[];
  empty: string;
}) {
  const { open, review } = useEvents();
  const go = (key: string) => {
    open(null);
    review(key);
  };
  return (
    <Section title="Exceptions">
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-separator rounded-xl border border-separator">
          {items.map(({ code, record_type, action }) => {
            const m = CODE_META[code];
            return (
              <li key={code} className="flex items-start gap-3 px-3 py-2.5">
                <CodeBadge code={code} record_type={record_type} action={action} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm">{m.label}</span>
                  <span className="text-xs text-muted">{m.description}</span>
                  <span className="text-xs">
                    <span className="text-muted">Fix:</span> {m.fix}
                  </span>
                </div>
                {DECIDE.has(code) &&
                  cases.map((key) => (
                    <Button key={key} size="sm" variant="secondary" className="shrink-0" onPress={() => go(key)}>
                      Review
                    </Button>
                  ))}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

function Decisions({ model, keys }: { model: Model; keys: ReadonlySet<string> }) {
  const applied = model.applied.filter((a) => keys.has(a.decision.case_key));
  const stale = model.stale.filter((d) => keys.has(d.case_key));
  if (applied.length === 0 && stale.length === 0) return null;
  return (
    <Section title="Decision">
      <ol className="flex flex-col divide-y divide-separator rounded-xl border border-separator">
        {applied.map(({ decision: d, removed }) => (
          <li key={d.case_key} className="flex flex-col gap-0.5 px-3 py-2.5 text-sm">
            <span>
              Picked <span className="font-mono text-[13px]">{d.pick}</span>
              <span className="text-xs text-muted">
                {" "}
                · {d.decided_by}, {instantText(d.decided_at)} · row{removed.length === 1 ? "" : "s"} {removed.join(", ")} set aside
              </span>
            </span>
            <span className="text-xs text-muted">“{d.comment}”</span>
          </li>
        ))}
        {stale.map((d) => (
          <li key={`stale|${d.case_key}|${d.decided_at}`} className="flex flex-col gap-0.5 px-3 py-2.5 text-sm">
            <span>
              <Chip size="sm" variant="soft" color="warning" className="me-2">
                Stale
              </Chip>
              Picked <span className="font-mono text-[13px]">{d.pick}</span>
              <span className="text-xs text-muted">
                {" "}
                · {d.decided_by}, {instantText(d.decided_at)}
              </span>
            </span>
            <span className="text-xs text-muted">The records it was made on changed: it is not applied.</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ── payment ────────────────────────────────────────────────────────────────

const PAYMENT_FIELDS = ["reservation_id", "payment_date", "amount_idr", "status"] as const;

function PaymentCard({ id }: { id: string }) {
  const { model, open } = useEvents();
  const rows = model.payments.filter((p) => p.payment_id === id);
  if (rows.length === 0) return <Missing what={id} />;
  const p = rows.find((x) => x.fate.kind !== "duplicate") ?? rows[0]!;
  const kind = MONEY_KIND_META[moneyKindOf(p)];
  const booking = model.reservations.find((r) => r.reservation_id === p.reservation_id);
  const bookingInDispute = booking !== undefined && bookingStateOf(model, booking) === "decide";
  const differing = new Set(PAYMENT_FIELDS.filter((f) => new Set(rows.map((x) => x[f])).size > 1));
  const mark = (f: (typeof PAYMENT_FIELDS)[number]) => (differing.has(f) ? "rounded-sm bg-accent/15 px-1 text-accent" : "");
  const codes = model.report.exceptions.filter((e) => e.record_type === "payment" && e.record_id === id).map((e) => e.code);
  const key = `payment:${id}`;
  const disputed = model.disputes.some((d) => d.case_key === key);

  return (
    <>
      <Drawer.CloseTrigger />
      <Drawer.Header className="gap-2">
        <Drawer.Heading className="font-mono text-lg">{id}</Drawer.Heading>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Chip size="sm" variant="soft" color={kind.color}>
            {kind.label}
          </Chip>
          <span>
            for {p.reservation_id} · {dayText(p.payment_date)} · IDR {idrFull(p.amount_idr)} · {p.status}
          </span>
        </div>
        <p className="text-sm text-muted">{kind.description}.</p>
      </Drawer.Header>

      <Drawer.Body className="flex flex-col gap-6">
        <Section
          title="Copies"
          hint={rows.length === 1 ? "one row in the file" : differing.size > 0 ? `${rows.length} rows, different content` : `${rows.length} identical rows, counted once`}
        >
          <ol className="flex flex-col divide-y divide-separator rounded-xl border border-separator">
            {rows.map((x) => (
              <li key={x.row} className="flex items-start gap-3 px-3 py-2.5">
                <div className="w-24 shrink-0">
                  <KindChip p={x} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="text-xs text-muted">row {x.row}</span>
                    <span className={mark("payment_date")}>{dayText(x.payment_date)}</span>
                    <span className={`text-xs ${mark("status")}`}>{x.status}</span>
                    <span className={`font-mono text-xs ${mark("reservation_id")}`}>{x.reservation_id}</span>
                    <span className={`ms-auto tabular-nums ${mark("amount_idr")}`}>{idrFull(x.amount_idr)}</span>
                  </span>
                  <span className="text-xs text-muted">{paymentWhy(x)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Booking">
          {booking === undefined ? (
            <p className="text-sm text-muted">No booking {p.reservation_id} arrived in the feed: the money stays unmatched.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button size="sm" variant="tertiary" className="h-7 px-2 font-mono text-xs" onPress={() => open({ type: "reservation", id: booking.reservation_id })}>
                {booking.reservation_id}
              </Button>
              <span className="text-muted">· {booking.property_id}</span>
              <Chip size="sm" variant="soft" color={BOOKING_STATE_META[bookingStateOf(model, booking)].color}>
                {BOOKING_STATE_META[bookingStateOf(model, booking)].label}
              </Chip>
            </div>
          )}
        </Section>

        <Exceptions
          items={codes.map((code) => ({ code, record_type: "payment" as const, action: actionOf(code, bookingInDispute) }))}
          cases={disputed ? [key] : []}
          empty="None: the payment is counted as received."
        />
        <Decisions model={model} keys={new Set([key])} />
      </Drawer.Body>
    </>
  );
}
