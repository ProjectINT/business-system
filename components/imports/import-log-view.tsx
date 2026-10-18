"use client";

import { Button, Card, Chip, Description, Label, ListBox, Table } from "@heroui/react";
import {
  ArrowRotateRight,
  CircleCheck,
  CircleDashed,
  CircleXmark,
  TriangleExclamation,
} from "@gravity-ui/icons";
import { useState } from "react";
import { RuleBadge } from "@/components/rules/rule-badge";
import {
  BATCH_STATUS_META,
  EVENT_ACTION_META,
  type ImportBatch,
  type StepStatus,
} from "@/lib/mock/imports";
import { count } from "@/lib/format";

const STEP_ICON: Record<StepStatus, { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  ok: { icon: CircleCheck, className: "text-success" },
  warning: { icon: TriangleExclamation, className: "text-warning" },
  skipped: { icon: CircleDashed, className: "text-muted" },
  failed: { icon: CircleXmark, className: "text-danger" },
};

function duration(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`;
}

export function ImportLogView({ batches }: { batches: ImportBatch[] }) {
  // Open the latest batch that actually ran; skipped re-imports have nothing to show.
  const [selectedId, setSelectedId] = useState(
    (batches.find((b) => b.status !== "skipped") ?? batches[0])?.id,
  );
  const batch = batches.find((b) => b.id === selectedId) ?? batches[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted">
            Import batches: which modules ran, what they changed and why.
          </p>
          <Chip size="sm" variant="soft" color="warning">
            Demo data
          </Chip>
        </div>
        <Button variant="secondary">
          <ArrowRotateRight />
          Re-import CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-fit gap-3 p-2">
          <Card.Header className="px-2 pt-2">
            <Card.Title className="text-sm">Batches</Card.Title>
          </Card.Header>
          <ListBox
            aria-label="Import batches"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={batch ? [batch.id] : []}
            onSelectionChange={(keys) => {
              const [first] = keys === "all" ? [] : [...keys];
              if (first) setSelectedId(String(first));
            }}
          >
            {batches.map((b) => (
              <ListBox.Item key={b.id} id={b.id} textValue={b.id} className="items-start py-2.5 data-[selected=true]:bg-surface-secondary">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="font-mono">{b.id}</Label>
                    <Chip size="sm" variant="soft" color={BATCH_STATUS_META[b.status].color}>
                      {BATCH_STATUS_META[b.status].label}
                    </Chip>
                  </div>
                  <Description>
                    {b.startedAt} · {b.trigger}
                  </Description>
                </div>
              </ListBox.Item>
            ))}
          </ListBox>
        </Card>

        {batch && <BatchDetail batch={batch} />}
      </div>
    </div>
  );
}

function BatchDetail({ batch }: { batch: ImportBatch }) {
  const stats = [
    { label: "Rows read", value: batch.rowsRead },
    { label: "New", value: batch.inserted },
    { label: "Changed", value: batch.updated },
    { label: "Unchanged", value: batch.unchanged },
    { label: "Duplicates removed", value: batch.duplicates },
    { label: "Corrected", value: batch.corrected },
    { label: "Excluded", value: batch.excluded },
    { label: "Sent to review", value: batch.review },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card className="gap-5">
        <Card.Header className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <Card.Title className="font-mono text-lg">{batch.id}</Card.Title>
              <Chip size="sm" variant="soft" color={BATCH_STATUS_META[batch.status].color}>
                {BATCH_STATUS_META[batch.status].label}
              </Chip>
            </div>
            <Card.Description>
              {batch.startedAt} · {batch.trigger} · {batch.source} · {duration(batch.durationMs)}
            </Card.Description>
          </div>
        </Card.Header>
        <Card.Content>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 2xl:grid-cols-8">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-1">
                <dt className="text-xs text-muted">{s.label}</dt>
                <dd className="text-xl font-semibold">{count(s.value)}</dd>
              </div>
            ))}
          </dl>
        </Card.Content>
      </Card>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <Card className="gap-4">
          <Card.Header className="gap-1">
            <Card.Title>Pipeline</Card.Title>
            <Card.Description>Modules in run order</Card.Description>
          </Card.Header>
          <Card.Content>
            <ol className="flex flex-col">
              {batch.steps.map((step, i) => {
                const { icon: Icon, className } = STEP_ICON[step.status];
                const last = i === batch.steps.length - 1;
                return (
                  <li key={step.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <Icon className={`size-5 shrink-0 ${className}`} />
                      {!last && <div className="my-1 w-px flex-1 bg-separator" />}
                    </div>
                    <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${last ? "" : "pb-4"}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{step.module}</span>
                        <span className="text-xs text-muted tabular-nums">
                          {step.status === "skipped" ? "—" : duration(step.durationMs)}
                        </span>
                      </div>
                      <span className="text-xs text-muted">{step.description}</span>
                      <span className="text-sm">{step.result}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card.Content>
        </Card>

        <Card className="gap-4">
          <Card.Header className="gap-1">
            <Card.Title>Files</Card.Title>
            <Card.Description>Re-import of an identical file is skipped by its sha256</Card.Description>
          </Card.Header>
          <Card.Content>
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Files in batch" className="min-w-[520px]">
                  <Table.Header>
                    <Table.Column isRowHeader>File</Table.Column>
                    <Table.Column className="text-end">Rows</Table.Column>
                    <Table.Column className="text-end">New</Table.Column>
                    <Table.Column className="text-end">Changed</Table.Column>
                    <Table.Column className="text-end">Same</Table.Column>
                    <Table.Column>sha256</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {batch.files.map((f) => (
                      <Table.Row key={f.name} id={f.name}>
                        <Table.Cell className="font-mono text-[13px]">{f.name}</Table.Cell>
                        <Table.Cell className="text-end tabular-nums">{count(f.rows)}</Table.Cell>
                        <Table.Cell className="text-end tabular-nums">{count(f.inserted)}</Table.Cell>
                        <Table.Cell className="text-end tabular-nums">{count(f.updated)}</Table.Cell>
                        <Table.Cell className="text-end tabular-nums">{count(f.unchanged)}</Table.Cell>
                        <Table.Cell className="font-mono text-xs text-muted">{f.sha256}…</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Card.Content>
        </Card>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Event log</h2>
          <Chip size="sm" variant="soft">
            {batch.events.length}
          </Chip>
        </div>
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Import events" className="min-w-[960px]">
              <Table.Header>
                <Table.Column className="w-32">Time</Table.Column>
                <Table.Column>Module</Table.Column>
                <Table.Column isRowHeader>Record</Table.Column>
                <Table.Column>Action</Table.Column>
                <Table.Column>Issue</Table.Column>
                <Table.Column>Details</Table.Column>
              </Table.Header>
              <Table.Body>
                {batch.events.map((e) => (
                  <Table.Row key={e.id} id={e.id}>
                    <Table.Cell className="font-mono text-xs text-muted">{e.at}</Table.Cell>
                    <Table.Cell className="text-sm">{e.module}</Table.Cell>
                    <Table.Cell className="font-mono text-[13px]">{e.record}</Table.Cell>
                    <Table.Cell>
                      <Chip size="sm" variant="soft" color={EVENT_ACTION_META[e.action].color}>
                        {EVENT_ACTION_META[e.action].label}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell>{e.rule === undefined ? <span className="text-muted">—</span> : <RuleBadge id={e.rule} />}</Table.Cell>
                    <Table.Cell className="text-sm text-muted">{e.message}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </section>
    </div>
  );
}
