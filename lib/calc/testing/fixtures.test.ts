import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPENSE_ROWS, PAYMENT_ROWS, RESERVATION_ROWS, RULE_ROWS } from "./fixtures";

const DATA = join(__dirname, "../../../Technical_Challenge_Data");
const lines = (file: string) => new Set(readFileSync(join(DATA, file), "utf8").replace(/^﻿/, "").split(/\r?\n/));

describe("fixtures are verbatim rows of the source data", () => {
  it.each<[string, Record<string, string>]>([
    ["reservations.csv", RESERVATION_ROWS],
    ["commission_rules.csv", RULE_ROWS],
    ["payments.csv", PAYMENT_ROWS],
    ["expenses.csv", EXPENSE_ROWS],
  ])("%s", (file, rows) => {
    const source = lines(file);
    for (const row of Object.values(rows)) expect(source.has(row), row).toBe(true);
  });
});
