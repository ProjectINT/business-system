// The list of rules and their execution order. The order follows `dependsOn` (VALIDATION_PLAN.md 5);
// among rules that are ready at the same time, registration order holds, so the order is stable.
import { DqError } from "./errors";
import type { Check, RuleId } from "./types";

const RULE_ID = /^DQ-\d{2}$/;

export interface Registry {
  /** Rules in execution order. */
  readonly checks: readonly Check[];
  get(id: RuleId): Check | undefined;
}

/** Checks the ids and dependencies, then orders the rules. Throws `DqError` on a bad registry. */
export function createRegistry(checks: readonly Check[]): Registry {
  const byId = new Map<RuleId, Check>();
  for (const c of checks) {
    if (!RULE_ID.test(c.id)) throw new DqError("BAD_RULE_ID", `Rule id must be DQ-NN: ${c.id}`, { id: c.id });
    if (byId.has(c.id)) throw new DqError("DUPLICATE_RULE", `Rule registered twice: ${c.id}`, { id: c.id });
    byId.set(c.id, c);
  }
  for (const c of checks) {
    for (const dep of c.dependsOn) {
      if (!byId.has(dep)) {
        throw new DqError("UNKNOWN_DEPENDENCY", `${c.id} depends on ${dep}, which is not registered`, {
          id: c.id,
          dependsOn: dep,
        });
      }
    }
  }
  const ordered = orderChecks(checks);
  return { checks: ordered, get: (id) => byId.get(id) };
}

/** Kahn's algorithm with a queue kept in registration order. Throws on a cycle. */
export function orderChecks(checks: readonly Check[]): Check[] {
  const remaining = new Map<RuleId, Set<RuleId>>(checks.map((c) => [c.id, new Set(c.dependsOn)]));
  const ordered: Check[] = [];
  const done = new Set<RuleId>();

  while (ordered.length < checks.length) {
    const ready = checks.filter((c) => !done.has(c.id) && [...remaining.get(c.id)!].every((d) => done.has(d)));
    if (ready.length === 0) {
      const stuck = checks.filter((c) => !done.has(c.id)).map((c) => c.id);
      throw new DqError("DEPENDENCY_CYCLE", `Rules depend on each other: ${stuck.join(", ")}`, {
        rules: stuck.join(","),
      });
    }
    for (const c of ready) {
      ordered.push(c);
      done.add(c.id);
    }
  }
  return ordered;
}
