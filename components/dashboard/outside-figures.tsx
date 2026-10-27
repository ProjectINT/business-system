"use client";

// What the checks kept out of the figures for this selection (PLAN.md 5.2): excluded and duplicate
// rows by file, with their amounts — no rupiah leaves the figures silently. Held and unallocated
// payments are not here: the cash block shows them next to cash received (PLAN.md 7.4).
import { Card, Chip, Link } from "@heroui/react";
import type { View } from "@/lib/calc";
import type { OutsideGroup } from "@/lib/data";
import { count, idrFull } from "@/lib/format";

const ENTITY_LABEL: Record<OutsideGroup["entity"], [string, string]> = {
  reservation: ["reservation", "reservations"],
  payment: ["payment", "payments"],
  expense: ["expense", "expenses"],
};

function label(g: View<OutsideGroup>): string {
  const noun = ENTITY_LABEL[g.entity][g.count === 1 ? 0 : 1];
  if (g.status === "duplicate") return `${count(g.count)} duplicate ${noun} dropped`;
  return `${count(g.count)} excluded ${noun}`;
}

export function OutsideFigures({ groups, keys }: { groups: View<OutsideGroup>[]; keys: string[] }) {
  if (groups.length === 0) return null;
  return (
    <Card variant="secondary" className="flex-row flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="text-sm font-medium">Not in the figures</span>
      {groups.map((g) => (
        <Chip key={`${g.entity}-${g.status}`} size="sm" variant="soft" color={g.status === "duplicate" ? "default" : "danger"}>
          {label(g)} · IDR {idrFull(g.amount)}
          {g.otherCurrency > 0 && ` + ${g.otherCurrency} in another currency`}
        </Chip>
      ))}
      <span className="text-xs text-muted" title={keys.join(", ")}>
        {keys.slice(0, 8).join(", ")}
        {keys.length > 8 ? ` … ${keys.length - 8} more` : ""}
      </span>
      <Link href="/import/data-quality" className="ms-auto text-sm">
        Why
        <Link.Icon />
      </Link>
    </Card>
  );
}
