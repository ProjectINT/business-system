#!/usr/bin/env tsx
// Nightly commission report for the final test (docs/FINAL_TEST_PLAN.md): case JSON in, report JSON out.
//
//   npm run nightly -- final-test/case_public.json final-test/results_public.json
//
// One input gives one output, byte for byte: lib/nightly formats the report with sorted keys and
// looks at nothing but the input (no current date). Exit code 0 — the report is written and one line
// on stdout says what it holds; 1 — the input cannot be read, is not JSON or is not a case of the
// expected format, and stderr names the field (z.prettifyError); 2 — wrong usage. On an error nothing
// is written. The directory of the output is created when it does not exist.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { formatReport, runCase, type ReportView } from "../lib/nightly";

const USAGE = "usage: npm run nightly -- <case.json> <results.json>";

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function summary(output: string, report: ReportView): string {
  const d = report.dedup;
  const dedup = `${d.reservation_event_duplicates}/${d.superseded_reservation_versions}/${d.payment_duplicates}`;
  return `${output}: ${report.case_id}, exceptions ${report.exceptions.length}, dedup ${dedup} (events/versions/payments)`;
}

function main(argv: readonly string[]): number {
  let positionals: string[];
  try {
    ({ positionals } = parseArgs({ args: [...argv], allowPositionals: true }));
  } catch {
    console.error(USAGE);
    return 2;
  }
  const [input, output] = positionals;
  if (input === undefined || output === undefined || positionals.length > 2) {
    console.error(USAGE);
    return 2;
  }

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(input, "utf8"));
  } catch (e) {
    console.error(`${input}: ${message(e)}`);
    return 1;
  }

  let report: ReportView;
  try {
    report = runCase(json);
  } catch (e) {
    if (!(e instanceof z.ZodError)) throw e; // a bug, not a bad input: let it crash with the stack
    console.error(`${input}: not a case of the expected format`);
    console.error(z.prettifyError(e));
    return 1;
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, formatReport(report));
  console.log(summary(output, report));
  return 0;
}

process.exitCode = main(process.argv.slice(2));
