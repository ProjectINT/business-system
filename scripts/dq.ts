#!/usr/bin/env tsx
// Runs the data-quality rules on the CSV files and prints a summary per rule (VALIDATION_PLAN.md 8).
//
//   npm run dq                       files in Technical_Challenge_Data/, checked as of today in Bali
//   npm run dq -- --dir <dir>        another directory with the five files
//   npm run dq -- --cases            also list the cases a human has to decide
import { parseArgs } from "node:util";
import { dateIn } from "../lib/calc";
import { TIME_ZONE } from "../lib/data";
import { loadDataset } from "../lib/ingest";
import { buildCases, defaultRegistry, MemorySink, datasetSource, runChecks, type RunReport, type Status } from "../lib/dq";

const { values: opt } = parseArgs({
  options: {
    dir: { type: "string" },
    cases: { type: "boolean", default: false },
  },
});

const STATUSES: readonly Status[] = ["clean", "review", "pending", "excluded", "duplicate", "superseded"];

function mln(n: bigint): string {
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  const whole = abs / 1_000_000n;
  const tenth = ((abs % 1_000_000n) * 10n) / 1_000_000n;
  return `${sign}${whole}.${tenth}M`;
}

function pad(s: string, n: number, right = false): string {
  return right ? s.padStart(n) : s.padEnd(n);
}

function printSummary(report: RunReport): void {
  const { meta, summary } = report;
  console.log(`DQ run · today ${meta.today} (Bali) · ${report.status}`);
  console.log(`rows: ${STATUSES.map((s) => `${s} ${summary.counts[s]}`).join(" · ")}`);
  if (summary.failures.length > 0) for (const f of summary.failures) console.log(`  ! ${f.ruleId}: ${f.message}`);
  console.log("");
  const head = ["rule", "title", "action", "pass", "fail", "skip", "amount in question", "failed keys"];
  const rows: string[][] = [];
  for (const check of defaultRegistry().checks) {
    const results = report.results.get(check.id) ?? [];
    const count = (o: string) => results.filter((r) => r.outcome === o).length;
    const failed = results.filter((r) => r.outcome === "fail");
    const amount = failed.reduce((sum, r) => sum + (r.amountIdr ?? 0n), 0n);
    const keys = failed.map((r) => r.recordKey ?? r.unitId);
    const shown = keys.length > 6 ? `${keys.slice(0, 6).join(", ")} … (${keys.length})` : keys.join(", ");
    rows.push([check.id, check.title, check.action, String(count("pass")), String(count("fail")), String(count("skip")), mln(amount), shown]);
  }
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((c, i) => pad(c, widths[i]!, i >= 3 && i <= 6)).join("  ");
  console.log(line(head));
  console.log(widths.map((w) => "─".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

function printCases(report: RunReport): void {
  const cases = buildCases(report);
  console.log("");
  console.log(`cases to decide: ${cases.length}`);
  for (const c of cases) {
    console.log(`  ${pad(c.type, 12)} ${pad(c.propertyId ?? "-", 5)} ${c.caseKey}${c.kinds.length > 0 ? `  [${c.kinds.join(", ")}]` : ""}`);
  }
}

async function main(): Promise<void> {
  const dataset = loadDataset(opt.dir);
  const sink = new MemorySink();
  const report = await runChecks({
    source: datasetSource(dataset),
    registry: defaultRegistry(),
    sink,
    today: dateIn(new Date(), TIME_ZONE),
  });
  printSummary(report);
  if (opt.cases) printCases(report);
  process.exitCode = report.status === "succeeded" ? 0 : 1;
}

void main();
