// Rules for testing the core: they keep the contract trivially, or break it on purpose.
import type { Action, Check, CheckContext, CheckResult, Entity, RuleId } from "../types";

export interface StubOptions {
  readonly id?: RuleId;
  readonly entity?: Entity;
  readonly action?: Action;
  readonly dependsOn?: readonly RuleId[];
  readonly engine?: "ts" | "sql";
}

function stub(
  defaults: Required<Pick<StubOptions, "id" | "action">>,
  opts: StubOptions,
  run: (ctx: CheckContext) => Promise<readonly CheckResult[]>,
): Check {
  const entity = opts.entity ?? "reservation";
  return {
    id: opts.id ?? defaults.id,
    version: 1,
    title: `stub ${opts.id ?? defaults.id}`,
    entity,
    action: opts.action ?? defaults.action,
    engine: opts.engine ?? "ts",
    dependsOn: opts.dependsOn ?? [],
    run,
  };
}

/** `pass` on every unit of the area. */
export function passAlways(opts: StubOptions = {}): Check {
  return stub({ id: "DQ-98", action: "info" }, opts, async (ctx) =>
    ctx.units(opts.entity ?? "reservation").map((u) => ({ unitId: u.unitId, recordKey: u.recordKey, outcome: "pass" })),
  );
}

/** `fail` on every unit of the area, with the given action. */
export function failAlways(opts: StubOptions = {}): Check {
  return stub({ id: "DQ-99", action: "review" }, opts, async (ctx) =>
    ctx.units(opts.entity ?? "reservation").map((u) => ({
      unitId: u.unitId,
      recordKey: u.recordKey,
      outcome: "fail",
      details: { stub: true },
      amountIdr: 1n,
    })),
  );
}

/** `fail` only on the units whose record key is listed; `pass` elsewhere. */
export function failKeys(keys: readonly string[], opts: StubOptions = {}): Check {
  return stub({ id: "DQ-97", action: "review" }, opts, async (ctx) =>
    ctx.units(opts.entity ?? "reservation").map((u) => ({
      unitId: u.unitId,
      recordKey: u.recordKey,
      outcome: u.recordKey !== null && keys.includes(u.recordKey) ? "fail" : "pass",
    })),
  );
}

/** Returns whatever the test says, to exercise the contract check. */
export function returning(results: (ctx: CheckContext) => readonly CheckResult[], opts: StubOptions = {}): Check {
  return stub({ id: "DQ-96", action: "review" }, opts, async (ctx) => results(ctx));
}

/** Throws on every run. */
export function throwing(message: string, opts: StubOptions = {}): Check {
  return stub({ id: "DQ-95", action: "review" }, opts, async () => {
    throw new Error(message);
  });
}
