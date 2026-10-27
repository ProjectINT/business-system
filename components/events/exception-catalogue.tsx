"use client";

// The exceptions (docs/EVENTS_VISUALIZATION_PLAN.md, 3.5): the catalogue of all 13 codes in three kinds,
// those absent from the case muted, with how many records and how much money is out of the totals; then
// the list of records with their money, where it is now, and the state — open, decided, or a stale decision.
// Thirteen classes make a table, not colours on a chart. Clicking a code filters the list and lights up its records.
import { Button, Card, Chip } from "@heroui/react";
import { useMemo, useState } from "react";
import type { ExceptionCode } from "@/lib/nightly";
import { count, idrFull } from "@/lib/format";
import { CodeBadge, CodeMark } from "./code-badge";
import { CODE_META, CODE_ORDER, KIND_META, KIND_ORDER } from "./exception-meta";
import { useEvents, useLit } from "./selection";
import { exceptionRowsOf, instantText, type ExceptionRow } from "./view-of";

const DOT: Record<(typeof KIND_ORDER)[number], string> = { decide: "bg-accent", exclude: "bg-danger", wait: "bg-muted" };

const WHERE_LABEL: Record<NonNullable<ExceptionRow["money"]>["where"], string> = {
  held: "held",
  unmatched: "unmatched",
  nowhere: "in no figure",
  outside: "outside the report months",
};

function moneyText(m: ExceptionRow["money"]): string {
  if (m === null) return "—";
  return m.currency === "IDR" ? idrFull(m.amount) : `${m.currency} ${idrFull(m.amount)}, not converted`;
}

export function ExceptionCatalogue() {
  const { model, selection, select } = useEvents();
  const rows = useMemo(() => exceptionRowsOf(model), [model]);
  const [filter, setFilter] = useState<ExceptionCode | null>(null);
  const shown = filter === null ? rows : rows.filter((r) => r.code === filter);

  const pick = (code: ExceptionCode) => {
    setFilter((f) => (f === code ? null : code));
    select({ kind: "code", code });
  };

  return (
    <Card className="gap-4">
      <Card.Header>
        <Card.Title>Exceptions</Card.Title>
        <Card.Description>
          {count(rows.length)} on {count(new Set(rows.map((r) => `${r.record_type}|${r.record_id}`)).size)} records. Every code of the report, by what the
          system does with it; codes this case does not have are muted.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {KIND_ORDER.map((kind) => (
            <section key={kind} className="flex flex-col gap-2">
              <div className="flex flex-col">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <span className={`size-2 rounded-full ${DOT[kind]}`} />
                  {KIND_META[kind].label}
                </h3>
                <p className="text-xs text-muted">{KIND_META[kind].description}</p>
              </div>
              <ul className="flex flex-col divide-y divide-separator rounded-xl border border-separator">
                {CODE_ORDER.filter((c) => CODE_META[c].kind === kind).map((code) => {
                  const of = rows.filter((r) => r.code === code);
                  const idr = of.reduce((n, r) => n + (r.money !== null && r.money.currency === "IDR" && r.money.where !== "outside" ? r.money.amount : 0), 0);
                  const active = selection?.kind === "code" && selection.code === code;
                  return (
                    <li key={code}>
                      <button
                        type="button"
                        disabled={of.length === 0}
                        onClick={() => pick(code)}
                        className={`flex w-full items-start gap-3 px-3 py-2 text-start transition-colors ${of.length === 0 ? "opacity-45" : "cursor-pointer hover:bg-surface-secondary"} ${active ? "bg-accent-soft" : ""}`}
                      >
                        <CodeMark code={code} />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-sm">{CODE_META[code].label}</span>
                          <span className="text-xs text-muted">Fix: {CODE_META[code].fix}</span>
                        </span>
                        <span className="flex flex-col items-end text-xs tabular-nums">
                          <span>{of.length === 0 ? "—" : `${count(of.length)} record${of.length === 1 ? "" : "s"}`}</span>
                          {idr > 0 && <span className="text-muted">IDR {idrFull(idr)}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Records</h3>
            {filter !== null && (
              <Chip size="sm" variant="soft">
                {CODE_META[filter].label}
                <button type="button" className="ms-1 cursor-pointer text-muted" onClick={() => setFilter(null)} aria-label="Clear the filter">
                  ×
                </button>
              </Chip>
            )}
          </div>
          <RecordList rows={shown} />
          <Decided />
        </div>
      </Card.Content>
    </Card>
  );
}

function RecordList({ rows }: { rows: ExceptionRow[] }) {
  const { open, review, model } = useEvents();
  const lit = useLit();
  const openCases = new Set(model.disputes.map((d) => d.case_key));
  if (rows.length === 0) return <p className="text-sm text-muted">No exceptions: every record is in the figures.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <thead>
          <tr className="border-b border-separator text-start text-muted">
            <th className="py-1.5 pe-3 text-start font-normal">Record</th>
            <th className="px-2 py-1.5 text-start font-normal">Exception</th>
            <th className="px-2 py-1.5 text-end font-normal">Out of the totals</th>
            <th className="px-2 py-1.5 text-start font-normal">Where it is</th>
            <th className="px-2 py-1.5 text-start font-normal">State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isLit = r.record_type === "reservation" ? lit.reservation(r.record_id) : lit.payment(r.record_id);
            return (
              <tr key={r.key} className={`border-b border-separator/60 transition-opacity ${isLit ? "" : "opacity-35"}`}>
                <td className="py-1.5 pe-3 whitespace-nowrap">
                  <button type="button" className="cursor-pointer font-mono text-[13px] hover:underline" onClick={() => open({ type: r.record_type, id: r.record_id })}>
                    {r.record_id}
                  </button>
                  <span className="text-muted">
                    {" "}
                    · {r.record_type === "reservation" ? "booking" : "payment"}
                    {r.property_id !== null && ` · ${r.property_id}`}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <CodeBadge code={r.code} record_type={r.record_type} action={r.action} />
                    {CODE_META[r.code].label}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-end tabular-nums whitespace-nowrap">{moneyText(r.money)}</td>
                <td className="px-2 py-1.5 text-muted">{r.money === null ? "—" : WHERE_LABEL[r.money.where]}</td>
                <td className="px-2 py-1.5">
                  {r.case_key !== null && openCases.has(r.case_key) ? (
                    <Button size="sm" variant="secondary" className="h-7" onPress={() => review(r.case_key!)}>
                      Open · review
                    </Button>
                  ) : (
                    <span className="text-muted">{CODE_META[r.code].kind === "decide" ? "Open" : CODE_META[r.code].kind === "exclude" ? "Fix in the source" : "Shown, not counted"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Decided and stale cases: the exception is gone from the report, the decision stays in view. */
function Decided() {
  const { model } = useEvents();
  if (model.applied.length === 0 && model.stale.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 pt-2 text-sm">
      {model.applied.map((a) => (
        <li key={a.decision.case_key} className="flex flex-wrap items-center gap-2">
          <Chip size="sm" variant="soft" color="success">
            Decided
          </Chip>
          <span className="font-mono text-[13px]">{a.decision.record_key}</span>
          <span className="text-muted">
            by {a.decision.decided_by}, {instantText(a.decision.decided_at)} · “{a.decision.comment}”
          </span>
        </li>
      ))}
      {model.stale.map((d) => (
        <li key={`${d.case_key}|${d.decided_at}`} className="flex flex-wrap items-center gap-2">
          <Chip size="sm" variant="soft" color="warning">
            Decision stale
          </Chip>
          <span className="font-mono text-[13px]">{d.record_key}</span>
          <span className="text-muted">the records it chose between have changed: not applied</span>
        </li>
      ))}
    </ul>
  );
}
