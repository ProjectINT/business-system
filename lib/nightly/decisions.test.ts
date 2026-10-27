// Decisions on disputed values (docs/EVENTS_VISUALIZATION_PLAN.md, 2.6): what counts as a dispute, how
// a pick filters the input, when a decision is stale, and the `d` parameter of the page.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import demoCase from "../../final-test/variants/all-exceptions.json";
import { encodeDecisions } from "./decision-param";
import { applyDecisions, disputesOf, fingerprint, inputOf, parseDecisions, rowsOf, type Decision } from "./decisions";
import { parseCase } from "./schema";
import { rawCase, rawEvent, rawPayment } from "./testing/fixtures";

const demo = parseCase(demoCase);
const rows = rowsOf(demo);

function decision(case_key: string, overrides: Partial<Decision> = {}): Decision {
  const d = disputesOf(rows).find((x) => x.case_key === case_key)!;
  return {
    case_key,
    record_key: d.record_key,
    decision: "pick",
    pick: d.candidates[0]!.key,
    candidates_hash: d.candidates_hash,
    comment: "Confirmed by the channel manager",
    decided_by: "Finance team",
    decided_at: "2026-10-27T10:00:00Z",
    ...overrides,
  };
}

describe("fingerprint", () => {
  it("is 8 hex digits, stable, and tells contents apart", () => {
    expect(fingerprint("")).toBe("811c9dc5");
    expect(fingerprint("a")).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprint("a")).toBe(fingerprint("a"));
    expect(fingerprint("a")).not.toBe(fingerprint("b"));
  });
});

describe("disputesOf", () => {
  it("the demo case: one conflicting event, one conflicting payment, one ambiguous version", () => {
    const ds = disputesOf(rows);
    expect(ds.map((d) => [d.case_key, d.kind, d.record_key, d.code])).toEqual([
      ["event:E_R505", "event", "E_R505", "CONFLICTING_EVENT"],
      ["payment:P909", "payment", "P909", "CONFLICTING_PAYMENT"],
      ["version:R404", "version", "R404", "AMBIGUOUS_VERSION"],
    ]);
    expect(ds[2]!.candidates.map((c) => [c.key, c.rows])).toEqual([
      ["E_R404_A", [5]],
      ["E_R404_B", [6]],
    ]);
    expect(ds[0]!.candidates.flatMap((c) => c.rows).sort()).toEqual([7, 8]);
  });

  it("equal latest versions are one version; exact copies of a candidate stay with it", () => {
    const input = parseCase(
      rawCase({
        reservation_events: [
          rawEvent({ source_event_id: "A" }),
          rawEvent({ source_event_id: "B" }),
          rawEvent({ source_event_id: "C", accommodation_gross_idr: 1 }),
          rawEvent({ source_event_id: "C", accommodation_gross_idr: 1 }),
        ],
      }),
    );
    expect(disputesOf(rowsOf(input)).map((d) => d.candidates.map((c) => [c.key, c.rows]))).toEqual([
      [
        ["A", [0]],
        ["B", [1]],
        ["C", [2, 3]],
      ],
    ]);
    const same = parseCase(rawCase({ reservation_events: [rawEvent({ source_event_id: "A" }), rawEvent({ source_event_id: "B" })] }));
    expect(disputesOf(rowsOf(same))).toEqual([]);
  });

  it("the candidate set hash changes when a candidate's content does", () => {
    const changed = parseCase({
      ...demoCase,
      reservation_events: demoCase.reservation_events.map((e) =>
        e.source_event_id === "E_R404_B" ? { ...e, accommodation_gross_idr: 4_600_000 } : e,
      ),
    });
    const hash = (r: ReturnType<typeof rowsOf>) => disputesOf(r).find((d) => d.case_key === "version:R404")!.candidates_hash;
    expect(hash(rowsOf(changed))).not.toBe(hash(rows));
  });
});

describe("applyDecisions", () => {
  it("a pick removes the rows of the other candidates and nothing else", () => {
    const p909 = disputesOf(rows).find((x) => x.case_key === "payment:P909")!;
    const d = decision("payment:P909", { pick: p909.candidates.find((c) => c.rows.includes(7))!.key });
    const out = applyDecisions(rows, [d]);
    expect(out.applied).toEqual([{ decision: d, removed: [8] }]);
    expect(out.stale).toEqual([]);
    expect(out.rows.events).toBe(rows.events);
    expect(out.rows.payments.map((p) => p.row)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11]);
  });

  it("decisions never change a value: every record left is a record of the input", () => {
    const all = disputesOf(rows).map((d) => decision(d.case_key));
    const out = applyDecisions(rows, all);
    expect(out.applied).toHaveLength(3);
    const left = inputOf(demo, out.rows);
    for (const e of left.reservation_events) expect(demo.reservation_events).toContain(e);
    for (const p of left.payments) expect(demo.payments).toContain(p);
  });

  it("independent decisions give the same rows in any order", () => {
    const all = disputesOf(rows).map((d) => decision(d.case_key, { pick: d.candidates[1]!.key }));
    fc.assert(
      fc.property(fc.shuffledSubarray(all, { minLength: 3, maxLength: 3 }), (order) => {
        expect(applyDecisions(rows, order).rows).toEqual(applyDecisions(rows, all).rows);
      }),
    );
  });

  it("stale: the case is not open, the candidate set changed, or the pick is not a candidate", () => {
    const closed = { ...decision("payment:P909"), case_key: "payment:P101" };
    const changed = decision("version:R404", { candidates_hash: "deadbeef" });
    const unknown = decision("event:E_R505", { pick: "ffffffff" });
    const out = applyDecisions(rows, [closed, changed, unknown]);
    expect(out.stale).toEqual([closed, changed, unknown]);
    expect(out.rows).toBe(rows);
  });

  it("the same decision twice: the second finds its case closed", () => {
    const d = decision("version:R404");
    expect(applyDecisions(rows, [d, d]).stale).toEqual([d]);
  });
});

describe("the d parameter", () => {
  it("round-trips any comment, including non-Latin text", () => {
    const ds = [decision("version:R404", { comment: "Подтверждено менеджером канала ✓" }), decision("payment:P909")];
    const param = encodeDecisions(ds);
    expect(param).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parseDecisions(param)).toEqual({ decisions: ds, warning: null });
  });

  it("round-trips arbitrary comments", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, unit: "grapheme" }).filter((s) => s.trim() !== ""), (comment) => {
        const ds = [decision("event:E_R505", { comment })];
        expect(parseDecisions(encodeDecisions(ds)).decisions).toEqual(ds);
      }),
    );
  });

  it("no parameter — no decisions, no warning", () => {
    expect(parseDecisions(undefined)).toEqual({ decisions: [], warning: null });
    expect(parseDecisions("")).toEqual({ decisions: [], warning: null });
  });

  it("a broken parameter is ignored with a warning: not base64, not JSON, a wrong shape, an empty comment", () => {
    const warning = "The decisions in the address could not be read and were ignored";
    expect(parseDecisions("%%%")).toEqual({ decisions: [], warning });
    expect(parseDecisions(btoa("not json"))).toEqual({ decisions: [], warning });
    expect(parseDecisions(encodeDecisions([{ ...decision("payment:P909"), comment: "  " }]))).toEqual({ decisions: [], warning });
    expect(parseDecisions(btoa(JSON.stringify({ a: 1 })))).toEqual({ decisions: [], warning });
  });
});

describe("disputes of payments and events with other payments around", () => {
  it("a payment with equal copies is not a dispute", () => {
    const input = parseCase(rawCase({ reservation_events: [rawEvent()], payments: [rawPayment(), rawPayment()] }));
    expect(disputesOf(rowsOf(input))).toEqual([]);
  });
});
