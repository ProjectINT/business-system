import { expect, it } from "vitest";
import { compareText } from "./order";

it("compareText does not depend on locale", () => {
  expect(["b", "a", "B", "a"].sort(compareText)).toEqual(["B", "a", "a", "b"]);
  expect(compareText("a", "a")).toBe(0);
});
