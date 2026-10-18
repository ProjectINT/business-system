// Journal in memory: the CSV mode and the tests. Keeps what `dq_run`, `dq_check_result` and
// `dq_record_verdict` keep (VALIDATION_PLAN.md 4), without timestamps: the module has no clock.
import type {
  Action,
  Check,
  JournalResult,
  RuleId,
  RunClose,
  RunMeta,
  RunStatus,
  RunSummary,
  Sink,
  Verdict,
} from "../types";

export interface StoredResult extends JournalResult {
  readonly ruleId: RuleId;
  readonly ruleVersion: number;
  /** The result's own action when it has one, otherwise the rule's (`dq_check_result.action`). */
  readonly action: Action;
}

export interface MemoryRun {
  readonly runId: string;
  readonly meta: RunMeta;
  status: RunStatus;
  error: string | null;
  summary: RunSummary | null;
  readonly results: StoredResult[];
  readonly verdicts: Verdict[];
}

export class MemorySink implements Sink {
  readonly runs: MemoryRun[] = [];

  async startRun(meta: RunMeta): Promise<string> {
    const runId = `run-${this.runs.length + 1}`;
    this.runs.push({ runId, meta, status: "running", error: null, summary: null, results: [], verdicts: [] });
    return runId;
  }

  async writeResults(runId: string, check: Check, results: readonly JournalResult[]): Promise<void> {
    const run = this.run(runId);
    for (const r of results) {
      run.results.push({
        ...r,
        ruleId: check.id,
        ruleVersion: check.version,
        action: r.action ?? check.action,
      });
    }
  }

  async writeVerdicts(runId: string, verdicts: readonly Verdict[]): Promise<void> {
    this.run(runId).verdicts.push(...verdicts);
  }

  async finishRun(runId: string, close: RunClose): Promise<void> {
    const run = this.run(runId);
    run.status = close.status;
    run.error = close.error;
    run.summary = close.summary;
  }

  run(runId: string): MemoryRun {
    const run = this.runs.find((r) => r.runId === runId);
    if (run === undefined) throw new Error(`Unknown run: ${runId}`);
    return run;
  }
}

/**
 * The run as text, without its id: two runs on the same data must give the same journal
 * (VALIDATION_PLAN.md 1, requirement 6). Amounts are written as decimal strings.
 */
export function journalOf(run: MemoryRun): string {
  const rest: Omit<MemoryRun, "runId"> = {
    meta: run.meta,
    status: run.status,
    error: run.error,
    summary: run.summary,
    results: run.results,
    verdicts: run.verdicts,
  };
  return JSON.stringify(rest, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v), 1);
}
