import { describe, expect, it } from "vitest";
import { CHECKS } from "@/lib/dq";
import { RULE_META } from "./rule-meta";

describe("rule meta", () => {
  it("names every rule of the catalogue and nothing else", () => {
    expect(Object.keys(RULE_META).sort()).toEqual(CHECKS.map((c) => c.id).sort());
  });

  it("gives each rule a mark of its own: an icon or a tag of 3–4 characters", () => {
    const icons = Object.values(RULE_META).flatMap((m) => (m.icon === undefined ? [] : [m.icon]));
    const tags = Object.values(RULE_META).flatMap((m) => (m.tag === undefined ? [] : [m.tag]));
    expect(icons.length + tags.length).toBe(Object.keys(RULE_META).length);
    expect(new Set(icons).size).toBe(icons.length);
    expect(new Set(tags).size).toBe(tags.length);
    for (const t of tags) expect(t).toMatch(/^[A-Z%]{3,4}$/);
  });

  it("never shows a catalogue id to a person", () => {
    for (const m of Object.values(RULE_META)) expect(`${m.label} ${m.description}`).not.toMatch(/DQ-\d/);
  });
});
