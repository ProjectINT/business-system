// The cases built into /events (docs/EVENTS_VISUALIZATION_PLAN.md, 2.2): imported statically, so the
// files are part of the build and nothing is read from disk on Vercel. A new case is a file in
// final-test/variants/ and a line here. Server-only: the page passes the client labels, not the files.
import publicCase from "@/final-test/case_public.json";
import publicResults from "@/final-test/results_public.json";
import demoCase from "@/final-test/variants/all-exceptions.json";

export interface BuiltInCase {
  id: string;
  label: string;
  file: string;
  input: unknown;
  /** The CLI's output on the file, when it is part of the repository: the page checks its figures against it. */
  expected: { file: string; report: unknown } | null;
}

export const CASES: readonly BuiltInCase[] = [
  {
    id: "public",
    label: "Public case",
    file: "final-test/case_public.json",
    input: publicCase,
    expected: { file: "final-test/results_public.json", report: publicResults },
  },
  {
    id: "all-exceptions",
    label: "All exception types",
    file: "final-test/variants/all-exceptions.json",
    input: demoCase,
    expected: null,
  },
];

/** `?case=`: an unknown value is the public case. */
export function caseOf(id: string | string[] | undefined): BuiltInCase {
  return CASES.find((c) => c.id === id) ?? CASES[0]!;
}
