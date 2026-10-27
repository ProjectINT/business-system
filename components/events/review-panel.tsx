"use client";

// The review of disputed values (docs/EVENTS_VISUALIZATION_PLAN.md, 3.6): the records that arrived side
// by side with the fields that differ, what each choice would change in the figures (the server computed
// it with the model), a required comment, the choice. A decision picks which record to believe; it never
// types a value. Below, the journal: who, when, what, why, with Undo.
import { Button, Card, Chip } from "@heroui/react";
import { useState } from "react";
import type { Decision } from "@/lib/nightly/decisions";
import { idrFull, signedFull } from "@/lib/format";
import { CodeBadge } from "./code-badge";
import { useEvents } from "./selection";
import { CASE_LABEL, instantText, METRICS, monthText, type DisputeView, type EventRow, type Model, type PaymentRow } from "./view-of";

export interface ReviewPanelProps {
  decisions: Decision[];
  /** The case opened from elsewhere on the page. */
  focus: string | null;
  onDecide: (d: Decision) => void;
  onUndo: (index: number) => void;
  otherCase: { id: string; label: string } | null;
  onOtherCase: (id: string) => void;
}

/** Who decides: the role shown in the menu. */
const DECIDED_BY = "Finance team";

export function ReviewPanel({ decisions, focus, onDecide, onUndo, otherCase, onOtherCase }: ReviewPanelProps) {
  const { model } = useEvents();
  return (
    <Card id="review" className="scroll-mt-16 gap-4">
      <Card.Header>
        <Card.Title>Review of disputed values</Card.Title>
        <Card.Description>
          Different records arrived where one is expected. Pick the one to believe: the others leave the input and the figures are computed again. Values are
          never typed in.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-5">
        {model.disputes.length === 0 ? (
          <p className="text-sm text-muted">
            {model.applied.length > 0 ? "Every dispute of this case is decided." : "Nothing to decide in this case."}
            {model.applied.length === 0 && otherCase !== null && (
              <>
                {" "}
                <button type="button" className="cursor-pointer text-accent hover:underline" onClick={() => onOtherCase(otherCase.id)}>
                  Open “{otherCase.label}”
                </button>{" "}
                to see the review at work.
              </>
            )}
          </p>
        ) : (
          model.disputes.map((d) => <DisputeCard key={d.case_key} d={d} focused={focus === d.case_key} onDecide={onDecide} />)
        )}
        <Journal decisions={decisions} onUndo={onUndo} model={model} />
      </Card.Content>
    </Card>
  );
}

type Field = { name: string; value: (r: EventRow | PaymentRow) => string };

const EVENT_FIELDS: Field[] = [
  { name: "source_event_id", value: (r) => (r as EventRow).source_event_id },
  { name: "updated_at", value: (r) => instantText((r as EventRow).updated_at) },
  { name: "status", value: (r) => r.status },
  { name: "property_id", value: (r) => (r as EventRow).property_id },
  { name: "check_in", value: (r) => (r as EventRow).check_in },
  { name: "check_out", value: (r) => (r as EventRow).check_out },
  { name: "accommodation", value: (r) => idrFull((r as EventRow).accommodation_gross_idr) },
  { name: "PBJT", value: (r) => idrFull((r as EventRow).pbjt_idr) },
  { name: "OTA fee", value: (r) => idrFull((r as EventRow).ota_fee_idr) },
  { name: "currency", value: (r) => (r as EventRow).currency },
];

const PAYMENT_FIELDS: Field[] = [
  { name: "reservation_id", value: (r) => r.reservation_id },
  { name: "payment_date", value: (r) => (r as PaymentRow).payment_date },
  { name: "amount", value: (r) => idrFull((r as PaymentRow).amount_idr) },
  { name: "status", value: (r) => r.status },
];

function recordOf(model: Model, d: DisputeView, row: number): EventRow | PaymentRow {
  return d.kind === "payment" ? model.payments.find((p) => p.row === row)! : model.events.find((e) => e.row === row)!;
}

function candidateLabel(d: DisputeView, i: number): string {
  return d.kind === "version" ? d.candidates[i]!.key : `Copy ${i + 1}`;
}

function DisputeCard({ d, focused, onDecide }: { d: DisputeView; focused: boolean; onDecide: (d: Decision) => void }) {
  const { model, select } = useEvents();
  const [comment, setComment] = useState("");
  const records = d.candidates.map((c) => recordOf(model, d, c.rows[0]!));
  const fields = d.kind === "payment" ? PAYMENT_FIELDS : EVENT_FIELDS;
  const first = records[0]!;
  const villa = d.kind === "payment" ? model.reservations.find((r) => r.reservation_id === first.reservation_id)?.property_id : (first as EventRow).property_id;
  const subject = d.kind === "payment" ? `for ${first.reservation_id}` : d.kind === "event" ? `booking ${first.reservation_id}` : `${d.candidates.length} versions at ${instantText((first as EventRow).updated_at)}`;
  const reservation = d.kind === "payment" ? null : first.reservation_id;

  const decide = (pick: string) =>
    onDecide({
      case_key: d.case_key,
      record_key: d.record_key,
      decision: "pick",
      pick,
      candidates_hash: d.candidates_hash,
      comment: comment.trim(),
      decided_by: DECIDED_BY,
      decided_at: new Date().toISOString(),
    });

  return (
    <section id={`review-${d.case_key}`} className={`flex flex-col gap-3 rounded-xl border p-4 ${focused ? "border-accent" : "border-separator"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <CodeBadge code={d.code} record_type={d.kind === "payment" ? "payment" : "reservation"} />
        <span className="font-medium">{CASE_LABEL[d.kind]}</span>
        <button
          type="button"
          className="cursor-pointer font-mono text-[13px] hover:underline"
          onClick={() => select(d.kind === "payment" ? { kind: "payment", id: d.record_key } : { kind: "reservation", id: reservation! })}
        >
          {d.record_key}
        </button>
        <span className="text-sm text-muted">
          {villa !== undefined && `${villa} · `}
          {subject}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-separator text-muted">
              <th className="py-1.5 pe-3 text-start font-normal" />
              {d.candidates.map((c, i) => (
                <th key={c.key} className="px-2 py-1.5 text-start font-mono text-[13px] font-normal">
                  {candidateLabel(d, i)}
                  {c.rows.length > 1 && <span className="font-sans text-xs text-muted"> ×{c.rows.length}</span>}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const values = records.map(f.value);
              const differs = new Set(values).size > 1;
              return (
                <tr key={f.name} className={`border-b border-separator/60 ${differs ? "bg-warning/10" : ""}`}>
                  <th scope="row" className="py-1 pe-3 text-start font-normal text-muted">
                    {f.name}
                  </th>
                  {values.map((v, i) => (
                    <td key={i} className={`px-2 py-1 tabular-nums ${differs ? "font-medium" : "text-muted"}`}>
                      {v}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-xs text-warning">{differs ? "← differs" : ""}</td>
                </tr>
              );
            })}
            <tr>
              <th scope="row" className="py-2 pe-3 text-start align-top font-normal text-muted">
                If chosen
              </th>
              {d.options.map((o) => (
                <td key={o.pick} className="px-2 py-2 align-top">
                  <Impact option={o} />
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Comment (required): why this record is the right one</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="rounded-lg border border-separator bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="e.g. confirmed by the channel manager on 27 Oct"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {d.candidates.map((c, i) => (
            <Button key={c.key} size="sm" variant="primary" isDisabled={comment.trim() === ""} onPress={() => decide(c.key)}>
              Use {candidateLabel(d, i)}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Impact({ option }: { option: DisputeView["options"][number] }) {
  const lines = option.changes.map((c) => ({
    key: `${c.property_id}|${c.month}|${c.metric}`,
    text: `${c.property_id} · ${monthText(c.month)} · ${METRICS.find((m) => m.key === c.metric)!.label}`,
    value: signedFull(c.delta),
  }));
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {lines.length === 0 && option.moved.length === 0 && <span className="text-muted">No figure changes</span>}
      {lines.map((l) => (
        <span key={l.key} className="flex justify-between gap-3">
          <span className="text-muted">{l.text}</span>
          <span className="tabular-nums">{l.value}</span>
        </span>
      ))}
      {option.held !== 0 && (
        <span className="flex justify-between gap-3">
          <span className="text-muted">Held</span>
          <span className="tabular-nums">{signedFull(option.held)}</span>
        </span>
      )}
      {option.unmatched !== 0 && (
        <span className="flex justify-between gap-3">
          <span className="text-muted">Unmatched</span>
          <span className="tabular-nums">{signedFull(option.unmatched)}</span>
        </span>
      )}
      {option.moved.map((m) => (
        <span key={m.payment_id} className="text-accent">
          {m.payment_id}: {m.from === "none" ? "in no sum" : m.from} → {m.to === "none" ? "in no sum" : m.to}
        </span>
      ))}
      {option.opens.map((k) => (
        <span key={k} className="text-warning">
          Opens a new dispute: {k}
        </span>
      ))}
    </div>
  );
}

function Journal({ decisions, onUndo, model }: { decisions: Decision[]; onUndo: (i: number) => void; model: Model }) {
  if (decisions.length === 0) return null;
  const applied = new Map(model.applied.map((a) => [`${a.decision.case_key}|${a.decision.decided_at}`, a]));
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Decisions</h3>
      <ol className="flex flex-col divide-y divide-separator rounded-xl border border-separator">
        {decisions.map((d, i) => {
          const a = applied.get(`${d.case_key}|${d.decided_at}`);
          return (
            <li key={`${d.case_key}|${d.decided_at}`} className="flex flex-wrap items-start gap-3 px-3 py-2.5 text-sm">
              <Chip size="sm" variant="soft" color={a !== undefined ? "success" : "warning"}>
                {a !== undefined ? "Applied" : "Stale"}
              </Chip>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span>
                  <span className="font-mono text-[13px]">{d.record_key}</span>: picked <span className="font-mono text-[13px]">{d.pick}</span>
                  {a !== undefined && <span className="text-muted"> · {a.removed.length} row{a.removed.length === 1 ? "" : "s"} set aside</span>}
                </span>
                <span className="text-muted">
                  {d.decided_by}, {instantText(d.decided_at)} · “{d.comment}”
                </span>
                {a === undefined && <span className="text-xs text-warning">The records it chose between have changed since: not applied.</span>}
              </div>
              <Button size="sm" variant="tertiary" onPress={() => onUndo(i)}>
                Undo
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
