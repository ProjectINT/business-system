import { describe, expect, it } from "vitest";
import { flaggedRowsHref } from "./query";

describe("flaggedRowsHref", () => {
  it("opens the villa's questions on /import/raw-data: rows under review or awaiting a decision", () => {
    expect(flaggedRowsHref("V003")).toBe("/import/raw-data?property=V003&status=flagged");
  });
});
