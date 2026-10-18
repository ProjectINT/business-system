import { describe, expect, it } from "vitest";
import { parseDate } from "../calc";
import { COMMISSION_RULE, PROPERTY, RESERVATION } from "../dq/testing/fixture";
import { filterOptionsOf, parseFilters, periodPresets, scopeOf, selectedProperties } from "./filters";
import { searchOf } from "./query";
import { snapshotOf } from "./testing/snapshot";

const d = parseDate;

const snapshot = await snapshotOf({
  property: [
    PROPERTY,
    { ...PROPERTY, property_id: "V002", cluster: "Ubud" },
    { ...PROPERTY, property_id: "V003", cluster: "Ubud" },
  ],
  commission_rule: [COMMISSION_RULE],
  reservation: [RESERVATION, { ...RESERVATION, reservation_id: "R0002", check_in: "2026-10-01", check_out: "2026-10-05" }],
});

describe("parseFilters", () => {
  it("defaults: the whole data range, every property, records under review included", () => {
    expect(snapshot.range).toEqual({ from: "2026-09-10", to: "2026-10-05" });
    expect(parseFilters({}, snapshot)).toEqual({
      filters: {
        period: snapshot.range,
        from: "2026-09-10",
        to: "2026-10-05",
        propertyIds: [],
        cluster: null,
        includeReview: true,
      },
      warnings: [],
    });
  });

  it("reads the period, properties (repeated or comma-separated), cluster and the switch", () => {
    const { filters, warnings } = parseFilters(
      { from: "2026-09-01", to: "2026-09-30", property: ["V003", "V001,V003"], cluster: "Ubud", review: "off" },
      snapshot,
    );
    expect(warnings).toEqual([]);
    expect(filters).toEqual({
      period: { from: "2026-09-01", to: "2026-09-30" },
      from: "2026-09-01",
      to: "2026-09-30",
      propertyIds: ["V001", "V003"],
      cluster: "Ubud",
      includeReview: false,
    });
  });

  it("one bound alone keeps the other from the data range", () => {
    expect(parseFilters({ from: "2026-10-01" }, snapshot).filters.period).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(parseFilters({ to: "2026-09-20" }, snapshot).filters.period).toEqual({ from: "2026-09-10", to: "2026-09-20" });
  });

  it.each([
    [{ from: "2026-02-30" }, "is not a pair of dates"],
    [{ to: "yesterday" }, "is not a pair of dates"],
    [{ from: "2026-10-02", to: "2026-10-01" }, "starts after it ends"],
  ])("a broken period %o falls back to the whole range", (params, warning) => {
    const { filters, warnings } = parseFilters(params, snapshot);
    expect(filters.period).toEqual(snapshot.range);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(warning);
  });

  it("ignores unknown properties and clusters, and a switch that is neither on nor off", () => {
    const { filters, warnings } = parseFilters({ property: "V001,V999", cluster: "Mars", review: "maybe" }, snapshot);
    expect(filters.propertyIds).toEqual(["V001"]);
    expect(filters.cluster).toBeNull();
    expect(filters.includeReview).toBe(true);
    expect(warnings).toEqual([
      "Unknown properties ignored: V999",
      "Unknown cluster ignored: Mars",
      "review=maybe is neither on nor off; records under review are included",
    ]);
  });

  it.each(["on", "1", "true", "YES"])("review=%s keeps records under review", (review) => {
    expect(parseFilters({ review }, snapshot)).toMatchObject({ filters: { includeReview: true }, warnings: [] });
  });

  it.each(["off", "0", "false", "No"])("review=%s leaves them out", (review) => {
    expect(parseFilters({ review }, snapshot).filters.includeReview).toBe(false);
  });

  it("empty values count as absent", () => {
    expect(parseFilters({ from: "", property: [" ", ""], cluster: undefined }, snapshot)).toEqual(parseFilters({}, snapshot));
  });
});

describe("selectedProperties and scopeOf", () => {
  const base = parseFilters({}, snapshot).filters;

  it("all without a cluster and a selection; a cluster; a selection; both intersect", () => {
    expect(selectedProperties(base, snapshot)).toBe("all");
    expect(selectedProperties({ ...base, cluster: "Ubud" }, snapshot)).toEqual(new Set(["V002", "V003"]));
    expect(selectedProperties({ ...base, propertyIds: ["V001", "V002"] }, snapshot)).toEqual(new Set(["V001", "V002"]));
    expect(selectedProperties({ ...base, cluster: "Ubud", propertyIds: ["V001", "V002"] }, snapshot)).toEqual(new Set(["V002"]));
  });

  it("scope of the calculator: period, properties, the switch, base currency, as-of", () => {
    expect(scopeOf(base, snapshot)).toEqual({
      period: snapshot.range,
      propertyIds: "all",
      includeReview: true,
      baseCurrency: "IDR",
      asOf: "2026-10-15",
    });
    expect(scopeOf(base, snapshot, false).includeReview).toBe(false);
  });
});

describe("searchOf", () => {
  const range = { from: "2026-09-01", to: "2026-11-05" };

  it("defaults give an empty query", () => {
    expect(searchOf({ ...range, propertyIds: [], cluster: null, includeReview: true }, range)).toBe("");
  });

  it("only what differs, properties sorted, and parses back", () => {
    const q = searchOf(
      { from: "2026-09-01", to: "2026-09-30", propertyIds: ["V003", "V001"], cluster: "Ubud", includeReview: false },
      range,
    );
    expect(q).toBe("?from=2026-09-01&to=2026-09-30&property=V001&property=V003&cluster=Ubud&review=off");
    const params: Record<string, string[]> = {};
    for (const [k, v] of new URLSearchParams(q)) params[k] = [...(params[k] ?? []), v];
    const back = parseFilters(params, { ...snapshot, range: { from: d(range.from), to: d(range.to) } });
    expect(back.filters).toMatchObject({ from: "2026-09-01", to: "2026-09-30", propertyIds: ["V001", "V003"], cluster: "Ubud", includeReview: false });
  });

  it("a changed bound writes both", () => {
    expect(searchOf({ from: "2026-09-01", to: "2026-10-31", propertyIds: [], cluster: null, includeReview: true }, range)).toBe(
      "?from=2026-09-01&to=2026-10-31",
    );
  });
});

describe("periodPresets", () => {
  it("the whole range, then each month it touches, in full", () => {
    expect(periodPresets({ from: d("2026-09-01"), to: d("2026-11-05") })).toEqual([
      { id: "all", from: "2026-09-01", to: "2026-11-05" },
      { id: "2026-09", from: "2026-09-01", to: "2026-09-30" },
      { id: "2026-10", from: "2026-10-01", to: "2026-10-31" },
      { id: "2026-11", from: "2026-11-01", to: "2026-11-30" },
    ]);
  });

  it("crosses the year and knows February", () => {
    expect(periodPresets({ from: d("2027-12-15"), to: d("2028-02-01") }).map((p) => `${p.id}:${p.from}..${p.to}`)).toEqual([
      "all:2027-12-15..2028-02-01",
      "2027-12:2027-12-01..2027-12-31",
      "2028-01:2028-01-01..2028-01-31",
      "2028-02:2028-02-01..2028-02-29",
    ]);
  });
});

describe("filterOptionsOf", () => {
  it("range, presets, villas and clusters for the filter bar", () => {
    expect(filterOptionsOf(snapshot)).toEqual({
      range: { from: "2026-09-10", to: "2026-10-05" },
      presets: [
        { id: "all", from: "2026-09-10", to: "2026-10-05" },
        { id: "2026-09", from: "2026-09-01", to: "2026-09-30" },
        { id: "2026-10", from: "2026-10-01", to: "2026-10-31" },
      ],
      properties: [
        { id: "V001", name: "Villa 01", cluster: "Seminyak" },
        { id: "V002", name: "Villa 01", cluster: "Ubud" },
        { id: "V003", name: "Villa 01", cluster: "Ubud" },
      ],
      clusters: ["Seminyak", "Ubud"],
    });
  });
});
