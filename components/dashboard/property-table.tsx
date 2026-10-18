"use client";

import { Chip, SearchField, Table, type SortDescriptor } from "@heroui/react";
import { useMemo, useState } from "react";
import type { PropertyAggregate } from "@/lib/mock/dashboard";
import { count, idrFull } from "@/lib/format";

type NumericKey = Exclude<keyof PropertyAggregate, "id" | "name" | "cluster">;

const COLUMNS: { id: NumericKey; label: string }[] = [
  { id: "nights", label: "Nights" },
  { id: "gross", label: "Gross bookings" },
  { id: "ota", label: "OTA fees" },
  { id: "mgmt", label: "Mgmt fees" },
  { id: "expenses", label: "Expenses" },
  { id: "ownerBalance", label: "Owner balance*" },
  { id: "received", label: "Cash received" },
];

export function PropertyTable({ rows }: { rows: PropertyAggregate[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortDescriptor>({ column: "gross", direction: "descending" });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => `${r.id} ${r.name} ${r.cluster}`.toLowerCase().includes(q))
      : rows;
    const key = sort.column as keyof PropertyAggregate;
    const dir = sort.direction === "descending" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, query, sort]);

  const totals = useMemo(
    () =>
      Object.fromEntries(
        COLUMNS.map((c) => [c.id, visible.reduce((sum, r) => sum + r[c.id], 0)]),
      ) as Record<NumericKey, number>,
    [visible],
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">By property</h2>
          <Chip size="sm" variant="soft">
            {visible.length}
          </Chip>
        </div>
        <SearchField
          aria-label="Search properties"
          className="w-64"
          value={query}
          onChange={setQuery}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search villa or cluster…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>

      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Aggregated metrics by property"
            className="min-w-[1080px]"
            sortDescriptor={sort}
            onSortChange={setSort}
          >
            <Table.Header>
              <Table.Column allowsSorting isRowHeader id="id">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    Property
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="cluster">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    Cluster
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              {COLUMNS.map((c) => (
                <Table.Column key={c.id} allowsSorting id={c.id} className="text-end">
                  {({ sortDirection }) => (
                    <Table.SortableColumnHeader sortDirection={sortDirection} className="justify-end">
                      {c.label}
                    </Table.SortableColumnHeader>
                  )}
                </Table.Column>
              ))}
              <Table.Column allowsSorting id="flags" className="text-end">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection} className="justify-end">
                    DQ flags
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <div className="py-8 text-center text-sm text-muted">No properties match “{query}”</div>
              )}
            >
              {visible.map((r) => (
                <Table.Row key={r.id} id={r.id}>
                  <Table.Cell>
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-xs text-muted">{r.id}</span>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-muted">{r.cluster}</Table.Cell>
                  {COLUMNS.map((c) => (
                    <Table.Cell key={c.id} className="text-end tabular-nums">
                      {c.id === "nights" ? count(r[c.id]) : idrFull(r[c.id])}
                    </Table.Cell>
                  ))}
                  <Table.Cell className="text-end">
                    {r.flags > 0 ? (
                      <Chip size="sm" variant="soft" color={r.flags >= 10 ? "danger" : "warning"}>
                        {r.flags}
                      </Chip>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        <Table.Footer className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">
            * Estimate: no owner payouts, opening balances or taxes in the source data.
          </span>
          <span className="tabular-nums">
            Total gross <span className="font-medium">{idrFull(totals.gross)}</span> · owner balance{" "}
            <span className="font-medium">{idrFull(totals.ownerBalance)}</span>
          </span>
        </Table.Footer>
      </Table>
    </section>
  );
}
