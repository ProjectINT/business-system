import { describe, expect, it } from "vitest";
import { IngestError } from "../ingest";
import { csvSource } from "./csv-source";
import { dataSource } from "./index";

describe("csvSource", () => {
  it("loads and checks once per process: every call returns the same snapshot", async () => {
    const a = csvSource().snapshot();
    const b = csvSource("Technical_Challenge_Data").snapshot();
    expect(a).toBe(b);
    const s = await a;
    expect(s.source).toEqual({ kind: "csv", label: "Technical_Challenge_Data" });
    expect(s.report.meta.batchId).toBe("csv");
  });

  it("a failed load is not kept: the next call reads again", async () => {
    const source = csvSource("no/such/dir");
    const first = source.snapshot();
    await expect(first).rejects.toBeInstanceOf(IngestError);
    const second = source.snapshot();
    expect(second).not.toBe(first);
    await expect(second).rejects.toThrow(IngestError);
  });

  it("level 1 serves the CSV files", async () => {
    expect(dataSource().kind).toBe("csv");
    expect(await dataSource().snapshot()).toBe(await csvSource().snapshot());
  });
});
