import { describe, expect, it } from "vitest";
import { DqError } from "./errors";
import { createRegistry, orderChecks } from "./registry";
import { failAlways, passAlways } from "./testing/stubs";

const ids = (r: { checks: readonly { id: string }[] }) => r.checks.map((c) => c.id);

describe("createRegistry", () => {
  it("keeps registration order when nothing depends on anything", () => {
    const r = createRegistry([passAlways({ id: "DQ-02" }), passAlways({ id: "DQ-01" })]);
    expect(ids(r)).toEqual(["DQ-02", "DQ-01"]);
    expect(r.get("DQ-01")?.id).toBe("DQ-01");
    expect(r.get("DQ-50")).toBeUndefined();
  });

  it("puts a rule after the rules it depends on, otherwise in registration order", () => {
    const r = createRegistry([
      passAlways({ id: "DQ-05", dependsOn: ["DQ-12", "DQ-01"] }),
      passAlways({ id: "DQ-12", dependsOn: ["DQ-03"] }),
      passAlways({ id: "DQ-01" }),
      passAlways({ id: "DQ-03" }),
      passAlways({ id: "DQ-16", dependsOn: ["DQ-05"] }),
    ]);
    expect(ids(r)).toEqual(["DQ-01", "DQ-03", "DQ-12", "DQ-05", "DQ-16"]);
  });

  it("rejects a rule id that is not DQ-NN", () => {
    for (const id of ["DQ-1", "DQ-123", "dq-01", "DQ01", "DQ-1a"]) {
      expect(() => createRegistry([passAlways({ id: id as "DQ-01" })])).toThrow(
        expect.objectContaining({ code: "BAD_RULE_ID", details: { id } }),
      );
    }
  });

  it("rejects a rule registered twice", () => {
    expect(() => createRegistry([passAlways({ id: "DQ-01" }), failAlways({ id: "DQ-01" })])).toThrow(
      expect.objectContaining({ code: "DUPLICATE_RULE", details: { id: "DQ-01" } }),
    );
  });

  it("rejects a dependency on a rule that is not registered", () => {
    expect(() => createRegistry([passAlways({ id: "DQ-05", dependsOn: ["DQ-12"] })])).toThrow(
      expect.objectContaining({ code: "UNKNOWN_DEPENDENCY", details: { id: "DQ-05", dependsOn: "DQ-12" } }),
    );
  });

  it("rejects a dependency cycle and names the rules in it", () => {
    const checks = [
      passAlways({ id: "DQ-01" }),
      passAlways({ id: "DQ-02", dependsOn: ["DQ-03"] }),
      passAlways({ id: "DQ-03", dependsOn: ["DQ-02"] }),
    ];
    expect(() => createRegistry(checks)).toThrow(DqError);
    expect(() => orderChecks(checks)).toThrow(
      expect.objectContaining({ code: "DEPENDENCY_CYCLE", details: { rules: "DQ-02,DQ-03" } }),
    );
  });

  it("a rule depending on itself is a cycle", () => {
    expect(() => createRegistry([passAlways({ id: "DQ-01", dependsOn: ["DQ-01"] })])).toThrow(
      expect.objectContaining({ code: "DEPENDENCY_CYCLE" }),
    );
  });
});
