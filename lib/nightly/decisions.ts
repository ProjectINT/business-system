// A person's decisions on the disputed values of a case (docs/EVENTS_VISUALIZATION_PLAN.md, 2.6):
// which of the records that arrived to believe. A decision never changes a value: it removes the
// versions or copies not picked from the input, and the same selectSnapshots/buildReport run on the
// rest. Fields follow app.review_decision (supabase/schemas, phase 8): case_key, record_key, the pick,
// a fingerprint of the candidate set (its row_hash), a required comment, who and when.
//
// Three kinds of dispute, the three `decide` codes of VALIDATION_PLAN.md 6.1:
// - version:R404 — AMBIGUOUS_VERSION: versions of a reservation with different content at its latest
//   updated_at; the pick is a source_event_id;
// - event:E_R505 — CONFLICTING_EVENT: copies of one source_event_id with different content; the pick
//   is the fingerprint of one content;
// - payment:P909 — CONFLICTING_PAYMENT: the same for copies of one payment_id.
//
// A decision applies while its candidate set is the one it was made on; otherwise it is stale and
// not applied. Decisions apply in order: picking a copy may open a new dispute (the copy ties with
// another version), found again before the next decision.
import { z } from "zod";
import type { CaseInput, Payment, ReservationEvent } from "./schema";
import { compareStrings, contentKey } from "./snapshots";
import type { ExceptionCode } from "./types";

/** A record of the input with its place in the file: copies share an id, the row tells them apart. */
export interface Row<T> {
  readonly row: number;
  readonly record: T;
}

export interface Rows {
  readonly events: readonly Row<ReservationEvent>[];
  readonly payments: readonly Row<Payment>[];
}

export type DisputeKind = "version" | "event" | "payment";

export interface Candidate {
  /** What a decision names: a source_event_id for a version, the content fingerprint for a copy. */
  readonly key: string;
  /** Fingerprint of the content (contentKey without the id). */
  readonly content: string;
  /** Rows of the input that carry this candidate, ascending. */
  readonly rows: readonly number[];
}

export interface Dispute {
  readonly case_key: string;
  readonly kind: DisputeKind;
  /** reservation_id, source_event_id or payment_id. */
  readonly record_key: string;
  readonly code: Extract<ExceptionCode, "AMBIGUOUS_VERSION" | "CONFLICTING_EVENT" | "CONFLICTING_PAYMENT">;
  /** By key. */
  readonly candidates: readonly Candidate[];
  /** Fingerprint of the candidate set: a decision made on another set is stale. */
  readonly candidates_hash: string;
}

export const DecisionSchema = z.object({
  case_key: z.string().regex(/^(version|event|payment):.+$/),
  record_key: z.string().min(1),
  decision: z.literal("pick"),
  pick: z.string().min(1),
  candidates_hash: z.string().min(1),
  comment: z.string().refine((s) => s.trim() !== "", "empty comment"),
  decided_by: z.string().min(1),
  decided_at: z.iso.datetime({ offset: true }),
});

export type Decision = z.output<typeof DecisionSchema>;

/** A decision and the rows it took out of the input. */
export interface Applied {
  readonly decision: Decision;
  readonly removed: readonly number[];
}

/**
 * FNV-1a, 32 bits, as 8 hex digits: a short stable name of a content. It tells candidates apart
 * within one dispute and notices a changed candidate set; it is not a security hash.
 */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function contentOf(record: ReservationEvent | Payment): string {
  return fingerprint("payment_id" in record ? contentKey(record, "payment_id") : contentKey(record, "source_event_id"));
}

export function groupRows<T>(rows: readonly Row<T>[], key: (r: T) => string): Map<string, Row<T>[]> {
  const groups = new Map<string, Row<T>[]>();
  for (const r of rows) {
    const k = key(r.record);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return groups;
}

/** Candidates of copies: one per distinct content, by fingerprint. */
function contentCandidates<T extends ReservationEvent | Payment>(copies: readonly Row<T>[]): Candidate[] {
  const byContent = groupRows(copies, contentOf);
  return [...byContent]
    .map(([content, rows]) => ({ key: content, content, rows: rows.map((r) => r.row) }))
    .sort((a, b) => compareStrings(a.key, b.key));
}

function dispute(kind: DisputeKind, record_key: string, code: Dispute["code"], candidates: Candidate[]): Dispute {
  const case_key = `${kind}:${record_key}`;
  const set = candidates.map((c) => `${c.key}=${c.content}`).join(",");
  return { case_key, kind, record_key, code, candidates, candidates_hash: fingerprint(`${case_key}|${set}`) };
}

/**
 * The open disputes of the input, by case_key. Found the way selectSnapshots finds them: a version
 * dispute only on a reservation without a conflicting event (the conflict holds it first).
 */
export function disputesOf(rows: Rows): Dispute[] {
  const out: Dispute[] = [];
  const conflicted = new Set<string>();
  const versions: Row<ReservationEvent>[] = [];
  for (const [id, copies] of groupRows(rows.events, (e) => e.source_event_id)) {
    const candidates = contentCandidates(copies);
    if (candidates.length > 1) {
      out.push(dispute("event", id, "CONFLICTING_EVENT", candidates));
      for (const c of copies) conflicted.add(c.record.reservation_id);
    } else {
      versions.push(copies[0]!);
    }
  }
  for (const [reservation_id, list] of groupRows(versions, (e) => e.reservation_id)) {
    if (conflicted.has(reservation_id)) continue;
    const latestAt = list.reduce((max, v) => (v.record.updated_at > max ? v.record.updated_at : max), list[0]!.record.updated_at);
    const latest = list.filter((v) => v.record.updated_at === latestAt);
    if (new Set(latest.map((v) => contentOf(v.record))).size === 1) continue;
    const candidates = latest
      .map((v) => {
        const id = v.record.source_event_id;
        const all = rows.events.filter((e) => e.record.source_event_id === id).map((e) => e.row);
        return { key: id, content: contentOf(v.record), rows: all };
      })
      .sort((a, b) => compareStrings(a.key, b.key));
    out.push(dispute("version", reservation_id, "AMBIGUOUS_VERSION", candidates));
  }
  for (const [id, copies] of groupRows(rows.payments, (p) => p.payment_id)) {
    const candidates = contentCandidates(copies);
    if (candidates.length > 1) out.push(dispute("payment", id, "CONFLICTING_PAYMENT", candidates));
  }
  return out.sort((a, b) => compareStrings(a.case_key, b.case_key));
}

/** The rows of a case file, numbered in the order they arrived. */
export function rowsOf(input: CaseInput): Rows {
  return {
    events: input.reservation_events.map((record, row) => ({ row, record })),
    payments: input.payments.map((record, row) => ({ row, record })),
  };
}

/** The case with only these rows. */
export function inputOf(input: CaseInput, rows: Rows): CaseInput {
  return { ...input, reservation_events: rows.events.map((r) => r.record), payments: rows.payments.map((r) => r.record) };
}

/** The rows without the candidates of `d` other than `pick`; the rows removed. */
export function pickIn(rows: Rows, d: Dispute, pick: string): { rows: Rows; removed: number[] } {
  const removed = d.candidates.filter((c) => c.key !== pick).flatMap((c) => c.rows).sort((a, b) => a - b);
  const gone = new Set(removed);
  if (d.kind === "payment") return { rows: { ...rows, payments: rows.payments.filter((r) => !gone.has(r.row)) }, removed };
  return { rows: { ...rows, events: rows.events.filter((r) => !gone.has(r.row)) }, removed };
}

/**
 * Decisions in order → the rows left. A decision whose case is not open, whose candidate set has
 * changed, or whose pick is not a candidate is stale: it is kept to be shown and changes nothing.
 */
export function applyDecisions(rows: Rows, decisions: readonly Decision[]): { rows: Rows; applied: Applied[]; stale: Decision[] } {
  let current = rows;
  const applied: Applied[] = [];
  const stale: Decision[] = [];
  for (const decision of decisions) {
    const d = disputesOf(current).find((x) => x.case_key === decision.case_key);
    if (d === undefined || d.candidates_hash !== decision.candidates_hash || !d.candidates.some((c) => c.key === decision.pick)) {
      stale.push(decision);
      continue;
    }
    const next = pickIn(current, d, decision.pick);
    current = next.rows;
    applied.push({ decision, removed: next.removed });
  }
  return { rows: current, applied, stale };
}

/**
 * The `d` parameter of the page: base64url of the JSON list of decisions (decision-param.ts writes it).
 * A broken parameter does not break the page: the decisions are dropped with a warning.
 */
export function parseDecisions(param: string | undefined): { decisions: Decision[]; warning: string | null } {
  if (param === undefined || param === "") return { decisions: [], warning: null };
  try {
    const binary = atob(param.replace(/-/g, "+").replace(/_/g, "/"));
    const json: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0))));
    const parsed = z.array(DecisionSchema).safeParse(json);
    if (parsed.success) return { decisions: parsed.data, warning: null };
  } catch {
    // not base64 or not JSON: the same warning as a wrong shape
  }
  return { decisions: [], warning: "The decisions in the address could not be read and were ignored" };
}
