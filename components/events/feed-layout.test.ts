import { describe, expect, it } from "vitest";
import publicCase from "@/final-test/case_public.json";
import demoCase from "@/final-test/variants/all-exceptions.json";
import { toView } from "@/lib/calc";
import { explainCase } from "@/lib/nightly/explain";
import type { Decision } from "@/lib/nightly/decisions";
import { bookingStateOf, changesOf, differingFields, disputesOfReservation, feedOf, type BookingFeed } from "./feed-layout";
import type { Model } from "./view-of";

const modelOf = (raw: unknown, decisions: Decision[] = []): Model => toView(explainCase(raw, decisions));
const bookingOf = (feed: BookingFeed[], id: string) => feed.find((b) => b.reservation.reservation_id === id)!;

describe("feedOf on the public case", () => {
  const model = modelOf(publicCase);
  const feed = feedOf(model);

  it("lists every booking once, by reservation id", () => {
    expect(feed.map((b) => b.reservation.reservation_id)).toEqual(["R101", "R202", "R303"]);
  });

  it("puts every row of the input in exactly one card", () => {
    const rows = feed.flatMap((b) => b.columns.flatMap((c) => c.stacks.flatMap((s) => s.cards.flatMap((card) => card.rows.map((r) => r.row)))));
    expect(rows.sort((a, b) => a - b)).toEqual(model.events.map((e) => e.row));
  });

  it("R101: two identical copies stacked, then the modified version with raised amounts", () => {
    const { columns } = bookingOf(feed, "R101");
    expect(columns).toHaveLength(2);
    const [first, second] = columns as [BookingFeed["columns"][number], BookingFeed["columns"][number]];
    expect(first.stacks).toHaveLength(1);
    const stack = first.stacks[0]!;
    expect(stack.conflicting).toBe(false);
    expect(stack.cards).toHaveLength(1);
    expect(stack.cards[0]!.rows).toHaveLength(2);
    expect(stack.cards[0]!.primary.fate.kind).toBe("superseded");
    expect(stack.cards[0]!.changes).toBeNull();

    const card = second.stacks[0]!.cards[0]!;
    expect(card.primary.source_event_id).toBe("E_R101_V2");
    expect(card.primary.fate).toEqual({ kind: "selected", in_figures: true });
    expect(card.changes!.map((c) => [c.field, c.was, c.now, c.direction])).toEqual([
      ["status", "confirmed", "modified", null],
      ["accommodation_gross_idr", 4_000_000, 4_400_000, "up"],
      ["pbjt_idr", 400_000, 440_000, "up"],
      ["ota_fee_idr", 600_000, 660_000, "up"],
    ]);
  });

  it("R303: one card, excluded", () => {
    const b = bookingOf(feed, "R303");
    expect(b.columns).toHaveLength(1);
    expect(b.columns[0]!.stacks[0]!.cards[0]!.primary.currency).toBe("USD");
    expect(bookingStateOf(model, b.reservation)).toBe("excluded");
    expect(bookingStateOf(model, bookingOf(feed, "R101").reservation)).toBe("in_figures");
  });
});

describe("feedOf on the demo case", () => {
  const model = modelOf(demoCase);
  const feed = feedOf(model);

  it("R404: two different versions in one column, both disputed", () => {
    const b = bookingOf(feed, "R404");
    expect(b.columns).toHaveLength(1);
    const col = b.columns[0]!;
    expect(col.tie).toBe(true);
    expect(col.tieDiffers).toBe(true);
    expect(col.stacks.map((s) => s.source_event_id)).toEqual(["E_R404_A", "E_R404_B"]);
    for (const s of col.stacks) {
      expect(s.cards[0]!.primary.fate.kind).toBe("candidate");
      expect([...s.cards[0]!.differing].sort()).toEqual(["accommodation_gross_idr", "check_out", "ota_fee_idr", "pbjt_idr"]);
    }
    expect(bookingStateOf(model, b.reservation)).toBe("decide");
    expect(disputesOfReservation(model, b.reservation).map((d) => d.case_key)).toEqual(["version:R404"]);
  });

  it("R505: one stack opened, two cards with the differing amounts", () => {
    const b = bookingOf(feed, "R505");
    const stack = b.columns[0]!.stacks[0]!;
    expect(b.columns[0]!.tie).toBe(false);
    expect(stack.conflicting).toBe(true);
    expect(stack.cards).toHaveLength(2);
    expect([...stack.cards[0]!.differing].sort()).toEqual(["accommodation_gross_idr", "pbjt_idr"]);
    expect(disputesOfReservation(model, b.reservation).map((d) => d.case_key)).toEqual(["event:E_R505"]);
  });

  it("after the decisions the rejected cards stay in their columns", () => {
    const decisions: Decision[] = model.disputes
      .filter((d) => d.kind !== "payment")
      .map((d) => ({
        case_key: d.case_key,
        record_key: d.record_key,
        decision: "pick",
        pick: d.candidates[0]!.key,
        candidates_hash: d.candidates_hash,
        comment: "checked with the channel",
        decided_by: "Finance team",
        decided_at: "2026-10-27T10:00:00Z",
      }));
    const decided = modelOf(demoCase, decisions);
    const after = feedOf(decided);
    const fates = (id: string) => bookingOf(after, id).columns[0]!.stacks.flatMap((s) => s.cards.map((c) => c.primary.fate.kind));
    expect(fates("R404")).toEqual(["selected", "rejected"]);
    expect(fates("R505").sort()).toEqual(["rejected", "selected"]);
    expect(bookingStateOf(decided, bookingOf(after, "R404").reservation)).toBe("in_figures");
  });
});

describe("field helpers", () => {
  const [a, b] = modelOf(demoCase).events.filter((e) => e.reservation_id === "R404") as [Model["events"][number], Model["events"][number]];

  it("changesOf: was → now, amounts with a direction", () => {
    expect(changesOf(b, a).find((c) => c.field === "accommodation_gross_idr")).toMatchObject({ was: 4_500_000, now: 3_000_000, direction: "down" });
    expect(changesOf(a, a)).toEqual([]);
  });

  it("differingFields: nothing for one row", () => {
    expect(differingFields([a])).toEqual(new Set());
  });
});
