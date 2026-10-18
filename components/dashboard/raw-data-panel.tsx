"use client";

import { Card, Chip, Label, ListBox, SearchField, Select, Table, Tabs, Tooltip, type Key } from "@heroui/react";
import { FileText } from "@gravity-ui/icons";
import { useMemo, useState } from "react";
import type { Status } from "@/lib/dq";
import type { RawTable, RuleInfo } from "@/lib/data";
import { count } from "@/lib/format";
import { ACTION_LABEL, STATUS_META, STATUS_ORDER } from "@/components/status-meta";

const ENTITY_LABEL: Record<RawTable["entity"], string> = {
  property: "Properties",
  commission_rule: "Commission rules",
  reservation: "Reservations",
  payment: "Payments",
  expense: "Expenses",
};

const NUMERIC = new Set(["gross_booking_value", "ota_fee", "refund_amount", "amount", "management_fee_rate"]);

const ALL = "all";

/** Money files first: that is where the checks find most. */
const TAB_ORDER: readonly RawTable["entity"][] = ["reservation", "payment", "expense", "property", "commission_rule"];

export function RawDataPanel({ tables, rules, sourceLabel }: { tables: RawTable[]; rules: RuleInfo[]; sourceLabel: string }) {
  const [status, setStatus] = useState<Status | typeof ALL>(ALL);
  const [query, setQuery] = useState("");
  const ruleOf = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);
  const present = STATUS_ORDER.filter((s) => tables.some((t) => t.rows.some((r) => r.status === s)));
  const ordered = TAB_ORDER.map((e) => tables.find((t) => t.entity === e)).filter((t) => t !== undefined);

  return (
    <Card className="gap-5">
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Card.Title>Source records</Card.Title>
          <Card.Description>
            Rows exactly as received, with the status the checks assigned and the rules that failed. Nothing is
            corrected.
          </Card.Description>
        </div>
        <Chip size="sm" variant="soft">
          CSV · {sourceLabel}
        </Chip>
      </Card.Header>

      <Card.Content className="gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select className="w-48" value={status} onChange={(k: Key | null) => setStatus((k ?? ALL) as Status | typeof ALL)}>
            <Label className="text-xs text-muted">Status</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id={ALL} textValue="All statuses">
                  All statuses
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {present.map((s) => (
                  <ListBox.Item key={s} id={s} textValue={STATUS_META[s].label}>
                    {STATUS_META[s].label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <SearchField aria-label="Search rows" className="w-64" value={query} onChange={setQuery}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search id, villa, rule…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </div>

        <Tabs variant="secondary" defaultSelectedKey={ordered[0]?.entity}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Source files" className="w-fit min-w-0">
              {ordered.map((t) => (
                <Tabs.Tab key={t.entity} id={t.entity} className="gap-2 whitespace-nowrap">
                  {ENTITY_LABEL[t.entity]}
                  <span className="text-xs text-muted tabular-nums">{count(t.rows.length)}</span>
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>

          {ordered.map((t) => (
            <Tabs.Panel key={t.entity} id={t.entity} className="flex flex-col gap-3 pt-4">
              <EntityTable table={t} status={status} query={query} ruleOf={ruleOf} />
            </Tabs.Panel>
          ))}
        </Tabs>
      </Card.Content>
    </Card>
  );
}

function EntityTable({
  table,
  status,
  query,
  ruleOf,
}: {
  table: RawTable;
  status: Status | typeof ALL;
  query: string;
  ruleOf: Map<string, RuleInfo>;
}) {
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return table.rows.filter(
      (r) =>
        (status === ALL || r.status === status) &&
        (q === "" || `${r.cells.join(" ")} ${r.failed.map((f) => f.ruleId).join(" ")}`.toLowerCase().includes(q)),
    );
  }, [table, status, query]);

  return (
    <>
      <Table variant="secondary">
        <Table.ScrollContainer>
          <Table.Content aria-label={`${table.fileName} rows`} className="min-w-[960px]">
            <Table.Header>
              <Table.Column className="w-14">Line</Table.Column>
              {table.header.map((c, i) => (
                <Table.Column key={c} id={c} isRowHeader={i === 0} className={NUMERIC.has(c) ? "text-end" : undefined}>
                  {c}
                </Table.Column>
              ))}
              <Table.Column>Status</Table.Column>
              <Table.Column>Rules</Table.Column>
            </Table.Header>
            <Table.Body
              renderEmptyState={() => <div className="py-8 text-center text-sm text-muted">No rows match the filters</div>}
            >
              {rows.map((row) => (
                <Table.Row
                  key={row.unitId}
                  id={row.unitId}
                  className={row.status === "duplicate" || row.status === "excluded" ? "opacity-70" : undefined}
                >
                  <Table.Cell className="text-muted tabular-nums">{row.lineNo}</Table.Cell>
                  {row.cells.map((cell, i) => (
                    <Table.Cell
                      key={table.header[i]}
                      className={`whitespace-nowrap font-mono text-[13px] ${NUMERIC.has(table.header[i]!) ? "text-end tabular-nums" : ""}`}
                    >
                      {cell}
                    </Table.Cell>
                  ))}
                  <Table.Cell>
                    <Tooltip delay={200}>
                      <Tooltip.Trigger>
                        <Chip size="sm" variant="soft" color={STATUS_META[row.status].color} className="cursor-help">
                          {STATUS_META[row.status].label}
                        </Chip>
                      </Tooltip.Trigger>
                      <Tooltip.Content>{STATUS_META[row.status].description}</Tooltip.Content>
                    </Tooltip>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap gap-1">
                      {row.failed.length === 0 && <span className="text-muted">—</span>}
                      {row.failed.map((f) => (
                        <Tooltip key={f.ruleId} delay={200}>
                          <Tooltip.Trigger>
                            <Chip size="sm" variant="secondary" className="cursor-help font-mono">
                              {f.ruleId}
                            </Chip>
                          </Tooltip.Trigger>
                          <Tooltip.Content>
                            {ruleOf.get(f.ruleId)?.title ?? f.ruleId}: {ACTION_LABEL[f.action]}
                          </Tooltip.Content>
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
          {table.fileName} · showing {count(rows.length)} of {count(table.rows.length)} rows
        </span>
      </div>
    </>
  );
}
