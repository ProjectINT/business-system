// Server side: what deserves a banner above the figures (CALCULATION_MODULE.md 5 — a record the
// calculator refused is shown with its amount, never dropped silently).
import type { CalcFailure } from "@/lib/calc";
import type { DataFailure, Snapshot } from "@/lib/data";
import { idrFull } from "@/lib/format";
import type { Notice } from "./notices";

export function noticesOf(
  snapshot: Snapshot,
  warnings: readonly string[],
  failures: { readonly calc: readonly CalcFailure[]; readonly data: readonly DataFailure[] },
): Notice[] {
  const out: Notice[] = [];
  if (warnings.length > 0) {
    out.push({ status: "warning", title: "Some filters in the link were ignored", description: warnings.join(" · ") });
  }
  if (snapshot.report.status === "failed") {
    out.push({
      status: "danger",
      title: "Data checks failed: statuses below may be wrong",
      description: snapshot.report.summary.failures.map((f) => `${f.ruleId}: ${f.message}`).join(" · "),
    });
  }
  const refused = failures.calc.length + failures.data.length;
  if (refused > 0) {
    const amount = failures.calc.reduce((s, f) => (f.amount.currency === "IDR" ? s + f.amount.amount : s), 0n);
    out.push({
      status: "danger",
      title: `${refused} record${refused === 1 ? "" : "s"} not calculated (IDR ${idrFull(amount)})`,
      description: [
        ...failures.calc.map((f) => `${f.recordId}: ${f.code}`),
        ...failures.data.map((f) => `${f.recordId}: ${f.code}`),
      ].join(" · "),
    });
  }
  return out;
}
