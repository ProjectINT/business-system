import { describe, expect, it } from "vitest";
import { parseDate } from "../calc";
import { IngestError } from "../ingest";
import { csvSource } from "./csv-source";
import { dataSource } from "./index";

const TODAY = parseDate("2026-10-15");

describe("csvSource", () => {
  it("loads and checks once per process and day: every call of the day returns the same snapshot", async () => {
    const a = csvSource().snapshot(TODAY);
    const b = csvSource("Technical_Challenge_Data").snapshot(TODAY);
    expect(a).toBe(b);
    const s = await a;
    expect(s.source).toEqual({ kind: "csv", label: "Technical_Challenge_Data" });
    expect(s.report.meta.batchId).toBe("csv");
    expect(s.today).toBe("2026-10-15");
  });

  it("a new day runs the checks again for that day", async () => {
    const next = await csvSource().snapshot(parseDate("2026-10-16"));
    expect(next.today).toBe("2026-10-16");
    expect(await csvSource().snapshot(parseDate("2026-10-16"))).toBe(next);
  });

  it("a failed load is not kept: the next call reads again", async () => {
    const source = csvSource("no/such/dir");
    const first = source.snapshot(TODAY);
    await expect(first).rejects.toBeInstanceOf(IngestError);
    const second = source.snapshot(TODAY);
    expect(second).not.toBe(first);
    await expect(second).rejects.toThrow(IngestError);
  });

  it("level 1 serves the CSV files", async () => {
    expect(dataSource().kind).toBe("csv");
    expect(await dataSource().snapshot(TODAY)).toBe(await csvSource().snapshot(TODAY));
  });
});
