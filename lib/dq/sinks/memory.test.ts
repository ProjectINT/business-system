import { describe, expect, it } from "vitest";
import { failAlways } from "../testing/stubs";
import type { RunMeta } from "../types";
import { journalOf, MemorySink } from "./memory";

const meta: RunMeta = { batchId: "csv", asOf: "2026-10-15", asOfDefaulted: true, codeVersion: "dev", rules: [] };

describe("MemorySink", () => {
  it("numbers runs and keeps results, verdicts and the close", async () => {
    const sink = new MemorySink();
    const run1 = await sink.startRun(meta);
    const run2 = await sink.startRun({ ...meta, batchId: null });
    expect([run1, run2]).toEqual(["run-1", "run-2"]);
    expect(sink.run(run1).status).toBe("running");

    const check = failAlways({ id: "DQ-08", action: "review", entity: "reservation" });
    await sink.writeResults(run1, check, [{ unitId: "r:2", recordKey: "R0001", entity: "reservation", outcome: "fail", amountIdr: 5n }]);
    await sink.writeVerdicts(run1, [
      { unitId: "r:2", entity: "reservation", recordKey: "R0001", status: "review", ruleIds: ["DQ-08"], decisionId: null },
    ]);
    const summary = {
      counts: { clean: 0, review: 1, pending: 0, excluded: 0, duplicate: 0, superseded: 0 },
      failures: [],
    };
    await sink.finishRun(run1, { status: "succeeded", error: null, summary });

    expect(sink.run(run1)).toEqual({
      runId: "run-1",
      meta,
      status: "succeeded",
      error: null,
      summary,
      results: [
        {
          unitId: "r:2",
          recordKey: "R0001",
          outcome: "fail",
          amountIdr: 5n,
          ruleId: "DQ-08",
          ruleVersion: 1,
          entity: "reservation",
          action: "review",
        },
      ],
      verdicts: [
        { unitId: "r:2", entity: "reservation", recordKey: "R0001", status: "review", ruleIds: ["DQ-08"], decisionId: null },
      ],
    });
    expect(sink.run(run2).meta.batchId).toBeNull();
  });

  it("refuses an unknown run", async () => {
    const sink = new MemorySink();
    expect(() => sink.run("run-9")).toThrow("Unknown run: run-9");
    await expect(sink.writeVerdicts("run-9", [])).rejects.toThrow("Unknown run");
  });
});

describe("journalOf", () => {
  it("leaves the run id out and writes amounts as decimal strings", async () => {
    const sink = new MemorySink();
    const a = await sink.startRun(meta);
    const b = await sink.startRun(meta);
    const check = failAlways({ id: "DQ-08" });
    for (const id of [a, b]) {
      await sink.writeResults(id, check, [{ unitId: "r:2", recordKey: "R0001", entity: "reservation", outcome: "fail", amountIdr: 12345678901234n }]);
    }
    const text = journalOf(sink.run(a));
    expect(text).toBe(journalOf(sink.run(b)));
    expect(text).not.toContain("run-1");
    expect(text).toContain('"amountIdr": "12345678901234"');
  });
});
