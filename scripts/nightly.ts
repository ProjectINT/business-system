#!/usr/bin/env tsx
// Nightly commission report for the final test (docs/FINAL_TEST_PLAN.md): case JSON in, report JSON out.
//
//   npm run nightly -- final-test/case_public.json final-test/results_public.json
//
// Phase 0 skeleton: arguments are checked here; the calculation (lib/nightly) is wired in phase 4.
import { parseArgs } from "node:util";

const { positionals } = parseArgs({ allowPositionals: true });
const [input, output] = positionals;

if (input === undefined || output === undefined) {
  console.error("usage: npm run nightly -- <case.json> <results.json>");
  process.exit(2);
}

console.error(`lib/nightly is not implemented yet (phases 1–4): ${input} → ${output}`);
process.exit(1);
