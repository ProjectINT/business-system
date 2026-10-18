"use client";

import { Card, Chip, Link } from "@heroui/react";
import type { Status } from "@/lib/dq";
import { count } from "@/lib/format";
import { STATUS_META, STATUS_ORDER } from "@/components/status-meta";

const BAR_COLOR: Record<Status, string> = {
  clean: "bg-success",
  review: "bg-warning",
  pending: "bg-accent",
  excluded: "bg-danger",
  duplicate: "bg-muted",
  superseded: "bg-muted",
};

interface Props {
  counts: Record<Status, number>;
  files: number;
  runStatus: "succeeded" | "failed";
  sourceLabel: string;
  /** Cases a human will decide, rows the checks excluded or dropped, and whether every file adds up. */
  cases: number;
  excluded: number;
  balanced: boolean;
}

export function DataQualityCard({ counts, files, runStatus, sourceLabel, cases, excluded, balanced }: Props) {
  const total = STATUS_ORDER.reduce((n, s) => n + counts[s], 0);
  const shown = STATUS_ORDER.filter((s) => counts[s] > 0 || s !== "superseded");

  return (
    <Card className="gap-5">
      <Card.Header className="gap-1">
        <Card.Title>Data quality</Card.Title>
        <Card.Description>Status of every source row after the checks, whole data set</Card.Description>
      </Card.Header>

      <Card.Content className="gap-5">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tight">{count(total)}</span>
          <span className="text-sm text-muted">rows in {files} source files</span>
          {runStatus === "failed" && (
            <Chip size="sm" variant="soft" color="danger">
              Checks failed
            </Chip>
          )}
        </div>

        <div className="flex h-2.5 w-full gap-0.5" role="img" aria-label="Rows by status">
          {shown
            .filter((s) => counts[s] > 0)
            .map((s) => (
              <div
                key={s}
                className={`${BAR_COLOR[s]} h-full first:rounded-s-full last:rounded-e-full`}
                style={{ width: `${(counts[s] / total) * 100}%`, minWidth: 4 }}
              />
            ))}
        </div>

        <ul className="flex flex-col gap-3">
          {shown.map((s) => (
            <li key={s} className="flex items-center gap-3">
              <span className={`${BAR_COLOR[s]} size-2.5 shrink-0 rounded-full`} />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-sm font-medium">{STATUS_META[s].label}</span>
                <span className="text-xs text-muted">{STATUS_META[s].description}</span>
              </div>
              <span className="text-sm tabular-nums">{count(counts[s])}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted">
          {count(cases)} cases await a decision · {count(excluded)} rows excluded automatically ·{" "}
          {balanced ? "control totals add up" : "control totals differ"}
        </p>
      </Card.Content>

      <Card.Footer className="mt-auto flex items-center justify-between gap-2 text-sm">
        <Chip size="sm" variant="soft">
          CSV · {sourceLabel}
        </Chip>
        <div className="flex gap-4">
          <Link href="/raw-data" className="text-sm">
            Source rows
          </Link>
          <Link href="/data-quality" className="text-sm">
            Data quality
            <Link.Icon />
          </Link>
        </div>
      </Card.Footer>
    </Card>
  );
}
