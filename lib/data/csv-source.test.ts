import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDate } from "../calc";
import { DEFAULT_DATA_DIR, IngestError } from "../ingest";
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

  it("a failure that arrives after a newer day has started does not drop the newer snapshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "csv-source-"));
    const source = csvSource(dir);
    const stale = source.snapshot(TODAY);
    cpSync(DEFAULT_DATA_DIR, dir, { recursive: true });
    const fresh = source.snapshot(parseDate("2026-10-16"));
    await expect(stale).rejects.toBeInstanceOf(IngestError);
    expect(source.snapshot(parseDate("2026-10-16"))).toBe(fresh);
    expect((await fresh).today).toBe("2026-10-16");
  });

  it("level 1 serves the CSV files", async () => {
    expect(dataSource().kind).toBe("csv");
    expect(await dataSource().snapshot(TODAY)).toBe(await csvSource().snapshot(TODAY));
  });
});
