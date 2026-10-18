// The contract test every rule's test file runs (VALIDATION_PLAN.md 9.1): exactly one result per
// unit of the area, a reason on each skip, the same results on a second call.
import { describe, expect, it } from "vitest";
import { areaOf, contractViolations, sortResults } from "../contract";
import type { Check, CheckContext } from "../types";

export function describeContract(check: Check, makeContext: () => CheckContext | Promise<CheckContext>): void {
  describe(`${check.id} keeps the contract`, () => {
    it("gives exactly one result per unit of its area, every skip with a reason", async () => {
      const ctx = await makeContext();
      const run = check.engine === "sql" && ctx.db === undefined ? check.runTs! : check.run;
      const results = await run.call(check, ctx);
      expect(contractViolations(areaOf(check, ctx.units), results)).toEqual([]);
    });

    it("gives the same results when called again", async () => {
      const ctx = await makeContext();
      const run = check.engine === "sql" && ctx.db === undefined ? check.runTs! : check.run;
      const first = sortResults(await run.call(check, ctx));
      const second = sortResults(await run.call(check, ctx));
      expect(second).toEqual(first);
    });
  });
}
