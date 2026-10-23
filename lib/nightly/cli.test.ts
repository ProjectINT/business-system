// The CLI (scripts/nightly.ts) and E of the ТЗ: final-test/results_public.json is what the CLI writes
// for case_public.json, byte for byte, and another JSON of the same format — a changed rate, a newer
// version of a reservation (ТЗ 6) — is recomputed without touching the output by hand.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import publicCase from "../../final-test/case_public.json";
import { formatReport, runCase, type ReportView } from "./index";
import { figures, rawEvent } from "./testing/fixtures";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RESULTS = join(ROOT, "final-test/results_public.json");

const dir = mkdtempSync(join(tmpdir(), "nightly-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Runs scripts/nightly.ts from the repository root the way `npm run nightly -- …` does (tsx). */
function nightly(...args: string[]) {
  const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/nightly.ts", ...args], { cwd: ROOT, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Writes a case (any JSON) into the temp directory and returns its path. */
function caseFile(name: string, content: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(content, null, 2));
  return path;
}

describe("the CLI (plan, phase 4)", () => {
  it("writes for case_public.json exactly the committed results_public.json, and says what it wrote", () => {
    const out = join(dir, "public", "results.json"); // the directory does not exist yet
    const r = nightly("final-test/case_public.json", out);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(readFileSync(RESULTS, "utf8"));
    expect(r.stdout).toBe(`${out}: FINAL_VILLA_2026_PUBLIC_A, exceptions 3, dedup 1/1/1 (events/versions/payments)\n`);
    expect(r.stderr).toBe("");
  });

  it("the committed file is formatReport(runCase(case_public.json)): regenerate it after a change of the module", () => {
    expect(readFileSync(RESULTS, "utf8")).toBe(formatReport(runCase(publicCase)));
  });

  it("exits with 1 on a format error, names every bad field with its path, and writes nothing", () => {
    const broken = {
      ...publicCase,
      reservation_events: publicCase.reservation_events.map((e, i) => (i === 2 ? { ...e, accommodation_gross_idr: 4_400_000.5 } : e)),
      payments: publicCase.payments.map((p, i) => (i === 2 ? { ...p, payment_date: "2026-02-30" } : p)),
    };
    const out = join(dir, "broken-out.json");
    const r = nightly(caseFile("broken.json", broken), out);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not a case of the expected format");
    expect(r.stderr).toContain("reservation_events[2].accommodation_gross_idr");
    expect(r.stderr).toContain("payments[2].payment_date");
    expect(r.stdout).toBe("");
    expect(existsSync(out)).toBe(false);
  });

  it("exits with 1 when the input is missing or is not JSON, naming the input", () => {
    const missing = join(dir, "missing.json");
    expect(nightly(missing, join(dir, "x.json"))).toMatchObject({ status: 1, stderr: expect.stringContaining(missing) });
    const notJson = join(dir, "not-json.json");
    writeFileSync(notJson, "{");
    expect(nightly(notJson, join(dir, "x.json"))).toMatchObject({ status: 1, stderr: expect.stringContaining(notJson) });
    expect(existsSync(join(dir, "x.json"))).toBe(false);
  });

  it("exits with 2 and prints the usage without both paths or with an option", () => {
    expect(nightly("final-test/case_public.json")).toMatchObject({ status: 2, stderr: expect.stringContaining("usage:") });
    expect(nightly("--bogus", "a.json", "b.json")).toMatchObject({ status: 2, stderr: expect.stringContaining("usage:") });
  });
});

describe("E: another JSON of the same format is recomputed (ТЗ 4 E, 6)", () => {
  /** The public case with the December rate of V01 at 22% instead of 20%. */
  const decemberAt22 = {
    ...publicCase,
    commission_rules: publicCase.commission_rules.map((r) => (r.rate_bps === 2000 ? { ...r, rate_bps: 2200 } : r)),
  };
  /** A third version of R101: later updated_at, the same stay, 4 800 000 / 480 000 / 720 000 (1 200 000 a night). */
  const E_R101_V3 = rawEvent({
    source_event_id: "E_R101_V3",
    updated_at: "2026-11-21T10:00:00Z",
    accommodation_gross_idr: 4_800_000,
    pbjt_idr: 480_000,
    ota_fee_idr: 720_000,
  });
  const withV3 = { ...publicCase, reservation_events: [...publicCase.reservation_events, E_R101_V3] };

  const PUBLIC_NOVEMBER = figures(2_200_000, 220_000, 330_000, 374_000, 1_496_000, 2_200_000);

  it("December at 22%: the fee of R101 is 374 000 + 484 000; November and the cash do not move", () => {
    const r = runCase(decemberAt22);
    expect(r.trace.R101?.monthly).toEqual({
      "2026-11": { nights: 2, rate_bps: [1700], accommodation_gross_idr: 2_200_000, management_fee_idr: 374_000 },
      "2026-12": { nights: 2, rate_bps: [2200], accommodation_gross_idr: 2_200_000, management_fee_idr: 484_000 },
    });
    expect(r.monthly).toEqual({
      "2026-11": PUBLIC_NOVEMBER,
      "2026-12": figures(4_200_000, 420_000, 330_000, 684_000, 3_186_000, 4_180_000),
    });
    expect(r.total).toEqual(figures(6_400_000, 640_000, 660_000, 1_058_000, 4_682_000, 6_380_000));
    expect(r.by_property.V01?.["2026-12"]?.management_fee_idr).toBe(484_000);
    expect(r.by_property.V02?.["2026-12"]?.management_fee_idr).toBe(200_000);
  });

  it("a newer version E_R101_V3: it is used, V1 and V2 are superseded (2), nothing is summed twice", () => {
    const r = runCase(withV3);
    expect(r.trace.R101).toEqual({
      selected_source_event_id: "E_R101_V3",
      superseded_source_event_ids: ["E_R101_V1", "E_R101_V2"],
      hold: false,
      nights: 4,
      monthly: {
        "2026-11": { nights: 2, rate_bps: [1700], accommodation_gross_idr: 2_400_000, management_fee_idr: 408_000 },
        "2026-12": { nights: 2, rate_bps: [2000], accommodation_gross_idr: 2_400_000, management_fee_idr: 480_000 },
      },
    });
    expect(r.dedup).toEqual({ reservation_event_duplicates: 1, superseded_reservation_versions: 2, payment_duplicates: 1 });
    expect(r.monthly).toEqual({
      "2026-11": figures(2_400_000, 240_000, 360_000, 408_000, 1_632_000, 2_200_000),
      "2026-12": figures(4_400_000, 440_000, 360_000, 680_000, 3_360_000, 4_180_000),
    });
    expect(r.exceptions).toEqual(runCase(publicCase).exceptions); // the same three records are held
  });

  it("the position of the newer version in the file does not matter", () => {
    const first = { ...publicCase, reservation_events: [E_R101_V3, ...publicCase.reservation_events] };
    expect(formatReport(runCase(first))).toBe(formatReport(runCase(withV3)));
  });

  it("the CLI recomputes a case with both changes: the same bytes as runCase in process, 22% on the nights of V3", () => {
    const changed = { ...withV3, case_id: "FINAL_VILLA_2026_CHANGED", commission_rules: decemberAt22.commission_rules };
    const out = join(dir, "changed-out.json");
    const r = nightly(caseFile("changed.json", changed), out);
    expect(r.status, r.stderr).toBe(0);
    const text = readFileSync(out, "utf8");
    expect(text).toBe(formatReport(runCase(changed)));
    const written = JSON.parse(text) as ReportView;
    expect(written.case_id).toBe("FINAL_VILLA_2026_CHANGED");
    expect(written.trace.R101?.monthly["2026-12"]).toEqual({
      nights: 2,
      rate_bps: [2200],
      accommodation_gross_idr: 2_400_000,
      management_fee_idr: 528_000,
    });
    expect(written.total.management_fee_idr).toBe(408_000 + 528_000 + 200_000);
    expect(written.dedup.superseded_reservation_versions).toBe(2);
  });
});
