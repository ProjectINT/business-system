"use client";

import { Card, Chip, Link, Table, Tabs, Tooltip } from "@heroui/react";
import { FileText } from "@gravity-ui/icons";
import { DQ_RULES, type RawEntity } from "@/lib/mock/raw-data";
import { DATA_QUALITY, STATUS_META } from "@/lib/mock/dashboard";
import { count } from "@/lib/format";

export function RawDataPanel({ entities }: { entities: RawEntity[] }) {
  return (
    <Card className="gap-5">
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Card.Title>Source records</Card.Title>
          <Card.Description>
            Rows exactly as received, with the status assigned by import checks. Nothing is
            corrected silently.
          </Card.Description>
        </div>
        <div className="flex items-center gap-3">
          <Chip size="sm" variant="soft">
            Batch {DATA_QUALITY.lastBatch.id} · {DATA_QUALITY.lastBatch.at}
          </Chip>
          <Link href="/imports" className="text-sm font-medium">
            Import data logs
            <Link.Icon />
          </Link>
        </div>
      </Card.Header>

      <Card.Content>
        <Tabs variant="secondary" defaultSelectedKey={entities[0]?.id}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Source files" className="w-fit min-w-0">
              {entities.map((e) => (
                <Tabs.Tab key={e.id} id={e.id} className="gap-2 whitespace-nowrap">
                  {e.label}
                  <span className="text-xs text-muted tabular-nums">{count(e.totalRows)}</span>
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>

          {entities.map((e) => (
            <Tabs.Panel key={e.id} id={e.id} className="flex flex-col gap-3 pt-4">
              <EntityTable entity={e} />
            </Tabs.Panel>
          ))}
        </Tabs>
      </Card.Content>
    </Card>
  );
}

function EntityTable({ entity }: { entity: RawEntity }) {
  return (
    <>
      <Table variant="secondary">
        <Table.ScrollContainer>
          <Table.Content aria-label={`${entity.label} source rows`} className="min-w-[960px]">
            <Table.Header>
              <Table.Column className="w-14">Line</Table.Column>
              {entity.columns.map((c, i) => (
                <Table.Column
                  key={c.key}
                  id={c.key}
                  isRowHeader={i === 0}
                  className={c.numeric ? "text-end" : undefined}
                >
                  {c.label}
                </Table.Column>
              ))}
              <Table.Column>Import status</Table.Column>
              <Table.Column>Rules</Table.Column>
            </Table.Header>
            <Table.Body>
              {entity.rows.map((row) => (
                <Table.Row
                  key={row.line}
                  id={row.line}
                  className={row.status === "duplicate" ? "opacity-60" : undefined}
                >
                  <Table.Cell className="text-muted tabular-nums">{row.line}</Table.Cell>
                  {entity.columns.map((c) => (
                    <Table.Cell
                      key={c.key}
                      className={`font-mono text-[13px] ${c.numeric ? "text-end tabular-nums" : ""}`}
                    >
                      {row.values[c.key]}
                    </Table.Cell>
                  ))}
                  <Table.Cell>
                    <Chip size="sm" variant="soft" color={STATUS_META[row.status].color}>
                      {STATUS_META[row.status].label}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap gap-1">
                      {row.issues.length === 0 && <span className="text-muted">—</span>}
                      {row.issues.map((code) => (
                        <Tooltip key={code} delay={200}>
                          <Tooltip.Trigger>
                            <Chip size="sm" variant="secondary" className="cursor-help font-mono">
                              {code}
                            </Chip>
                          </Tooltip.Trigger>
                          <Tooltip.Content>{DQ_RULES[code] ?? code}</Tooltip.Content>
                        </Tooltip>
                      ))}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <div className="flex items-center gap-2 text-xs text-muted">
        <FileText className="size-3.5" />
        <span>
          {entity.file} · showing {entity.rows.length} of {count(entity.totalRows)} rows (sample incl.
          known anomalies)
        </span>
      </div>
    </>
  );
}
