import { describe, expect, it } from "vitest";
import { loadDataset } from "../ingest";
import { createRegistry } from "./registry";
import { NO_DECISIONS, runChecks } from "./runner";
import { journalOf, MemorySink } from "./sinks/memory";
import { datasetSource } from "./sources/dataset";
import { datasetFrom, PAYMENT, RESERVATION } from "./testing/fixture";
import { failAlways, failKeys, passAlways, returning, throwing } from "./testing/stubs";
import type { Check, CheckResult, Decisions, RowUnit, Source, Status } from "./types";

const sample = loadDataset();

const small = datasetFrom({
  reservation: [RESERVATION, { ...RESERVATION, reservation_id: "R0002" }, { ...RESERVATION, reservation_id: "R0003" }],
  payment: [PAYMENT, { ...PAYMENT, payment_id: "P0002", reservation_id: "R0002" }],
});

async function execute(checks: readonly Check[], source: Source = datasetSource(small), extra: Partial<Parameters<typeof runChecks>[0]> = {}) {
  const sink = new MemorySink();
  const report = await runChecks({ source, registry: createRegistry(checks), sink, asOf: "2026-10-15", ...extra });
  return { sink, report, run: sink.run(report.runId) };
}

const statusOf = (report: { verdicts: readonly { recordKey: string | null; status: Status }[] }, key: string) =>
  report.verdicts.find((v) => v.recordKey === key)?.status;

describe("runChecks on the sample data", () => {
  it("writes one result per rule and row, a verdict per row, and succeeds", async () => {
    const { report, run } = await execute([passAlways({ id: "DQ-01", entity: "payment" }), failAlways({ id: "DQ-08", action: "review" })], datasetSource(sample));
    expect(report.status).toBe("succeeded");
    expect(run.status).toBe("succeeded");
    expect(run.error).toBeNull();
    expect(report.results.get("DQ-01")).toHaveLength(76);
    expect(report.results.get("DQ-08")).toHaveLength(151);
    expect(run.results).toHaveLength(76 + 151);
    expect(report.verdicts).toHaveLength(357);
    expect(report.summary.counts).toEqual({ clean: 206, review: 151, pending: 0, excluded: 0, duplicate: 0, superseded: 0 });
    expect(report.meta).toEqual({
      batchId: "csv",
      asOf: "2026-10-15",
      asOfDefaulted: false,
      codeVersion: "dev",
      rules: [
        { id: "DQ-01", version: 1 },
        { id: "DQ-08", version: 1 },
      ],
    });
  });

  it("two runs on the same data give the same journal", async () => {
    const checks = [passAlways({ id: "DQ-01", entity: "payment" }), failKeys(["R0015", "R0034"], { id: "DQ-04", action: "exclude" })];
    const sink = new MemorySink();
    const options = { source: datasetSource(sample), registry: createRegistry(checks), sink, asOf: "2026-10-15" };
    const a = await runChecks(options);
    const b = await runChecks(options);
    expect(a.runId).not.toBe(b.runId);
    expect(journalOf(sink.run(a.runId))).toBe(journalOf(sink.run(b.runId)));
    expect(a.summary.counts.excluded).toBe(3); // R0015 twice, R0034 once
  });

  it("sorts results and verdicts by unit id", async () => {
    const reversed = returning((ctx) =>
      [...ctx.units("reservation")].reverse().map((u) => ({ unitId: u.unitId, recordKey: u.recordKey, outcome: "pass" as const })),
    );
    const { report } = await execute([reversed], datasetSource(sample));
    const ids = report.results.get("DQ-96")!.map((r) => r.unitId);
    expect(ids).toEqual([...ids].sort());
    const vids = report.verdicts.map((v) => v.unitId);
    expect(vids).toEqual([...vids].sort());
    expect(vids[0]).toBe("commission_rules.csv:10");
  });
});

describe("as-of date", () => {
  it("takes the largest updated_at when none is given, and says so", async () => {
    const sink = new MemorySink();
    const report = await runChecks({ source: datasetSource(sample), registry: createRegistry([]), sink });
    expect(report.meta.asOf).toBe("2026-10-15");
    expect(report.meta.asOfDefaulted).toBe(true);
    expect(report.status).toBe("succeeded");
    expect(report.verdicts.every((v) => v.status === "clean")).toBe(true);
  });

  it("refuses to run without any date", async () => {
    const sink = new MemorySink();
    await expect(runChecks({ source: datasetSource(datasetFrom({})), registry: createRegistry([]), sink })).rejects.toThrow(
      expect.objectContaining({ code: "NO_AS_OF" }),
    );
    expect(sink.runs).toEqual([]);
  });

  it("refuses a date that is not a calendar date", async () => {
    const sink = new MemorySink();
    await expect(
      runChecks({ source: datasetSource(small), registry: createRegistry([]), sink, asOf: "2026-02-30" }),
    ).rejects.toThrow(expect.objectContaining({ code: "INVALID_DATE" }));
  });
});

describe("a rule that cannot be trusted", () => {
  it("that throws: error on every unit of its area, run failed, other rules still run", async () => {
    const { report, run } = await execute([throwing("boom", { id: "DQ-04" }), passAlways({ id: "DQ-01" })]);
    expect(report.status).toBe("failed");
    expect(run.status).toBe("failed");
    expect(run.error).toBe("DQ-04: threw: boom");
    expect(report.summary.failures).toEqual([{ ruleId: "DQ-04", message: "threw: boom" }]);
    const errors = report.results.get("DQ-04")!;
    expect(errors).toHaveLength(3);
    expect(errors.every((r) => r.outcome === "error" && r.reason === "threw: boom")).toBe(true);
    expect(errors.map((r) => r.recordKey)).toEqual(["R0001", "R0002", "R0003"]);
    expect(report.results.get("DQ-01")!.every((r) => r.outcome === "pass")).toBe(true);
    expect(report.summary.counts.clean).toBe(5); // an error is not a fail
  });

  it("that throws something other than an Error", async () => {
    const weird = returning(() => {
      throw "string";
    });
    const { run } = await execute([weird]);
    expect(run.error).toBe("DQ-96: threw: string");
  });

  it("that leaves a row without a verdict breaks the contract", async () => {
    const partial = returning((ctx) =>
      ctx.units("reservation").slice(1).map((u) => ({ unitId: u.unitId, recordKey: u.recordKey, outcome: "pass" as const })),
    );
    const { report } = await execute([partial]);
    expect(report.status).toBe("failed");
    expect(report.summary.failures[0]!.message).toBe("broke the contract: no result for reservations.csv:2");
    expect(report.results.get("DQ-96")!.every((r) => r.outcome === "error")).toBe(true);
  });

  it("that skips without a reason breaks the contract", async () => {
    const silent = returning((ctx) =>
      ctx.units("reservation").map((u) => ({ unitId: u.unitId, recordKey: u.recordKey, outcome: "skip" as const })),
    );
    const { report } = await execute([silent]);
    expect(report.status).toBe("failed");
    expect(report.summary.failures[0]!.message).toMatch(/^broke the contract: skip without a reason: reservations.csv:2; /);
  });
});

describe("file-level rules", () => {
  const files = (outcome: CheckResult["outcome"]) =>
    returning((ctx) => ctx.units("file").map((f) => ({ unitId: f.unitId, recordKey: null, outcome })), {
      id: "DQ-90",
      entity: "file",
      action: "info",
    });

  it("a pass is recorded per file and does not touch row verdicts", async () => {
    const { report, run } = await execute([files("pass")]);
    expect(report.status).toBe("succeeded");
    expect(report.results.get("DQ-90")!.map((r) => r.unitId)).toEqual([
      "commission_rules.csv",
      "expenses.csv",
      "payments.csv",
      "properties.csv",
      "reservations.csv",
    ]);
    expect(run.results.every((r) => r.entity === "file")).toBe(true);
    expect(report.verdicts).toHaveLength(5);
    expect(report.summary.counts.clean).toBe(5);
  });

  it("a fail means the control totals differ: the run fails", async () => {
    const { report } = await execute([files("fail")]);
    expect(report.status).toBe("failed");
    expect(report.summary.failures).toEqual([
      {
        ruleId: "DQ-90",
        message: "control totals differ: commission_rules.csv, expenses.csv, payments.csv, properties.csv, reservations.csv",
      },
    ]);
  });
});

describe("SQL rules without a database", () => {
  it("run through their TS twin", async () => {
    const twin: Check = { ...passAlways({ id: "DQ-12", engine: "sql", action: "decide" }), runTs: failAlways({ id: "DQ-12" }).run };
    const { report } = await execute([twin]);
    expect(report.status).toBe("succeeded");
    expect(report.summary.counts.pending).toBe(3);
  });

  it("fail the run when there is no twin", async () => {
    const { report } = await execute([passAlways({ id: "DQ-12", engine: "sql" })]);
    expect(report.status).toBe("failed");
    expect(report.summary.failures[0]!.message).toBe("an SQL rule without a TS twin cannot run without a database");
  });

  it("run `run` itself when a database handle is given", async () => {
    const twin: Check = { ...passAlways({ id: "DQ-12", engine: "sql" }), runTs: failAlways({ id: "DQ-12" }).run };
    const seen: unknown[] = [];
    const spy = returning((ctx) => {
      seen.push(ctx.db);
      return ctx.units("reservation").map((u) => ({ unitId: u.unitId, recordKey: u.recordKey, outcome: "pass" as const }));
    });
    const db = { tag: "db" };
    const { report } = await execute([twin, spy], datasetSource(small), { db });
    expect(report.status).toBe("succeeded");
    expect(report.summary.counts.review).toBe(0);
    expect(seen).toEqual([db]);
  });
});

describe("statusSoFar", () => {
  it("shows a dependent rule the status set by earlier rules", async () => {
    const seen: Record<string, Status> = {};
    const dependent = returning(
      (ctx) =>
        ctx.units("payment").map((u) => {
          const reservation = ctx.units("reservation").find((r) => r.recordKey === u.values.reservation_id)!;
          seen[u.recordKey!] = ctx.statusSoFar(reservation.unitId);
          return { unitId: u.unitId, recordKey: u.recordKey, outcome: "pass" as const };
        }),
      { id: "DQ-05", entity: "payment", dependsOn: ["DQ-04"] },
    );
    const { report } = await execute([dependent, failKeys(["R0002"], { id: "DQ-04", action: "exclude" })]);
    expect(report.meta.rules.map((r) => r.id)).toEqual(["DQ-04", "DQ-05"]);
    expect(seen).toEqual({ P0001: "clean", P0002: "excluded" });
  });

  it("is clean for a row no rule has judged yet", async () => {
    const seen: Status[] = [];
    const first = returning((ctx) =>
      ctx.units("reservation").map((u) => {
        seen.push(ctx.statusSoFar(u.unitId));
        return { unitId: u.unitId, recordKey: u.recordKey, outcome: "pass" as const };
      }),
    );
    await execute([first]);
    expect(seen).toEqual(["clean", "clean", "clean"]);
  });

  it("is an error for an unknown unit, which the runner records against the rule", async () => {
    const curious = returning((ctx) => {
      ctx.statusSoFar("nowhere.csv:1");
      return [];
    });
    const { report } = await execute([curious]);
    expect(report.summary.failures[0]!.message).toBe("threw: No row with unit id nowhere.csv:1");
  });

  it("gives the same unit arrays on every call", async () => {
    let same = false;
    const probe = returning((ctx) => {
      same = ctx.units("reservation") === ctx.units("reservation") && ctx.units("file") === ctx.units("file");
      return ctx.units("reservation").map((u) => ({ unitId: u.unitId, recordKey: u.recordKey, outcome: "pass" as const }));
    });
    await execute([probe]);
    expect(same).toBe(true);
  });
});

describe("decisions and superseded rows", () => {
  it("applies a decision in force when reducing the status", async () => {
    const decisions: Decisions = {
      forUnit: (u: RowUnit) =>
        u.recordKey === "R0002"
          ? { decisionId: "d1", kind: "finance_only", caseKey: "C", recordKey: "R0002", rowHash: u.rowHash, payload: {} }
          : null,
    };
    const { report } = await execute([failAlways({ id: "DQ-12", action: "decide" })], datasetSource(small), { decisions });
    expect(statusOf(report, "R0001")).toBe("pending");
    expect(statusOf(report, "R0002")).toBe("review");
    expect(report.verdicts.find((v) => v.recordKey === "R0002")!.decisionId).toBe("d1");
    expect(report.summary.counts).toEqual({ clean: 2, review: 1, pending: 2, excluded: 0, duplicate: 0, superseded: 0 });
  });

  it("writes superseded verdicts for rows the source reports as displaced", async () => {
    const base = datasetSource(small);
    const displaced = datasetSource(datasetFrom({ reservation: [{ ...RESERVATION, reservation_id: "R0009" }] }), "old").units("reservation");
    const source: Source = { ...base, units: (e) => base.units(e), superseded: () => displaced };
    const { report, run } = await execute([], source);
    expect(report.summary.counts.superseded).toBe(1);
    expect(run.verdicts.find((v) => v.recordKey === "R0009")).toEqual({
      unitId: "reservations.csv:2",
      entity: "reservation",
      recordKey: "R0009",
      status: "superseded",
      ruleIds: [],
      decisionId: null,
    });
    expect(NO_DECISIONS.forUnit(displaced[0]!)).toBeNull();
  });

  it("records the code version it is given", async () => {
    const { run } = await execute([], datasetSource(small), { codeVersion: "abc123" });
    expect(run.meta.codeVersion).toBe("abc123");
  });
});
