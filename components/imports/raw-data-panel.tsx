"use client";

import { Card, Chip, Label, ListBox, SearchField, Select, Table, Tabs, Tooltip, type Key } from "@heroui/react";
import { FileText } from "@gravity-ui/icons";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { Status } from "@/lib/dq";
import type { RawRow, RawTable, RuleInfo } from "@/lib/data";
import { FLAGGED, RAW_PARAM } from "@/lib/data/query";
import { count } from "@/lib/format";
import { RuleBadges } from "@/components/rules/rule-badge";
import { RuleLegendButton } from "@/components/rules/rule-legend";
import { ruleSearchText } from "@/components/rules/rule-meta";
import { STATUS_META, STATUS_ORDER } from "@/components/status-meta";

const ENTITY_LABEL: Record<RawTable["entity"], string> = {
  property: "Properties",
  commission_rule: "Commission rules",
  reservation: "Reservations",
  payment: "Payments",
  expense: "Expenses",
};

const NUMERIC = new Set(["gross_booking_value", "ota_fee", "refund_amount", "amount", "management_fee_rate"]);

const ALL = "all";

type StatusFilter = Status | typeof FLAGGED | typeof ALL;

/** What the dashboard counts as DQ flags: rows under review or awaiting a decision. */
const isFlagged = (s: Status) => s === "review" || s === "pending";

/** Money files first: that is where the checks find most. */
const TAB_ORDER: readonly RawTable["entity"][] = ["reservation", "payment", "expense", "property", "commission_rule"];

export function RawDataPanel({ tables, rules, sourceLabel }: { tables: RawTable[]; rules: RuleInfo[]; sourceLabel: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const ruleOf = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);
  const present = useMemo(() => STATUS_ORDER.filter((s) => tables.some((t) => t.rows.some((r) => r.status === s))), [tables]);
  const ordered = TAB_ORDER.map((e) => tables.find((t) => t.entity === e)).filter((t) => t !== undefined);
  const villas = useMemo(
    () => [...new Set(tables.flatMap((t) => t.rows.flatMap((r) => (r.propertyId === null ? [] : [r.propertyId]))))].sort(),
    [tables],
  );

  // Villa and status live in the URL: the dashboard's DQ flags link here with them. Unknown values show everything.
  const statusParam = params.get(RAW_PARAM.status);
  const status: StatusFilter =
    statusParam === FLAGGED || present.includes(statusParam as Status) ? (statusParam as StatusFilter) : ALL;
  const villaParam = params.get(RAW_PARAM.property);
  const villa = villaParam !== null && villas.includes(villaParam) ? villaParam : ALL;
  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === ALL) next.delete(name);
    else next.set(name, value);
    const s = next.toString();
    window.history.replaceState(null, "", s === "" ? pathname : `${pathname}?${s}`);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const keep = (r: RawRow) =>
      (villa === ALL || r.propertyId === villa) &&
      (status === ALL || (status === FLAGGED ? isFlagged(r.status) : r.status === status)) &&
      (q === "" || `${r.cells.join(" ")} ${r.failed.map((f) => ruleSearchText(f.ruleId)).join(" ")}`.toLowerCase().includes(q));
    return new Map(tables.map((t) => [t.entity, t.rows.filter(keep)]));
  }, [tables, villa, status, query]);
  const rowsOf = (t: RawTable) => filtered.get(t.entity) ?? [];
  // Opened from a link with filters: the first file that has rows.
  const firstTab = (ordered.find((t) => rowsOf(t).length > 0) ?? ordered[0])?.entity;

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
          <Select className="w-40" value={villa} onChange={(k: Key | null) => setParam(RAW_PARAM.property, String(k ?? ALL))}>
            <Label className="text-xs text-muted">Villa</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id={ALL} textValue="All villas">
                  All villas
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {villas.map((v) => (
                  <ListBox.Item key={v} id={v} textValue={v}>
                    {v}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Select className="w-48" value={status} onChange={(k: Key | null) => setParam(RAW_PARAM.status, String(k ?? ALL))}>
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
                {present.some(isFlagged) && (
                  <ListBox.Item id={FLAGGED} textValue="Review + pending">
                    Review + pending
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                )}
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
              <SearchField.Input placeholder="Search id, villa, issue…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <div className="ms-auto">
            <RuleLegendButton ruleOf={ruleOf} />
          </div>
        </div>

        <Tabs variant="secondary" defaultSelectedKey={firstTab}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Source files" className="w-fit min-w-0">
              {ordered.map((t) => (
                <Tabs.Tab key={t.entity} id={t.entity} className="gap-2 whitespace-nowrap">
                  {ENTITY_LABEL[t.entity]}
                  <span className="text-xs text-muted tabular-nums">{count(rowsOf(t).length)}</span>
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>

          {ordered.map((t) => (
            <Tabs.Panel key={t.entity} id={t.entity} className="flex flex-col gap-3 pt-4">
              <EntityTable table={t} rows={rowsOf(t)} />
            </Tabs.Panel>
          ))}
        </Tabs>
      </Card.Content>
    </Card>
  );
}

function EntityTable({ table, rows }: { table: RawTable; rows: RawRow[] }) {
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
              <Table.Column>Issues</Table.Column>
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
                    <RuleBadges rules={row.failed.map((f) => ({ id: f.ruleId, action: f.action }))} />
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
