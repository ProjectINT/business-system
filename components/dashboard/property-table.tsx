"use client";

// Figures by villa from clean records only, whatever the filter bar says: records under review are
// never mixed into a cell. The switch shows, under each figure, the part they would bring.
import { Chip, SearchField, Switch, Table, Tooltip, type SortDescriptor } from "@heroui/react";
import { useMemo, useState } from "react";
import type { View } from "@/lib/calc";
import type { Dashboard, PropertyRow } from "@/lib/data";
import { count, idrFull, signedFull } from "@/lib/format";

type Row = View<PropertyRow>;
type NumericKey = "nights" | "gross" | "otaFee" | "managementFee" | "operatingExpenses" | "ownerBalance" | "received" | "difference";

const COLUMNS: { id: NumericKey; label: string; hint: string }[] = [
  { id: "nights", label: "Nights", hint: "Nights of stay in the period; overlapping stays under review count twice" },
  { id: "gross", label: "Gross bookings", hint: "By nights of stay in the period" },
  { id: "otaFee", label: "OTA fees", hint: "By nights of stay" },
  { id: "managementFee", label: "Mgmt fees", hint: "Rate on check-in date × gross, by nights" },
  { id: "operatingExpenses", label: "Expenses", hint: "Paid + pending, by expense date" },
  { id: "ownerBalance", label: "Owner balance*", hint: "Net rental − management fees − expenses; an estimate" },
  { id: "received", label: "Cash received", hint: "By payment date" },
  { id: "difference", label: "Recon. difference", hint: "Received − expected, reservations checking out in the period" },
];

/** The part of a figure that records under review bring; not in the figure itself. */
function UnderReview({ value, inline = false }: { value: number; inline?: boolean }) {
  if (value === 0) return null;
  return (
    <span
      className={inline ? "ms-1 text-warning" : "block text-xs text-warning"}
      title="Records under review: not in the figure"
    >
      {signedFull(value)}
    </span>
  );
}

export function PropertyTable({ rows, totals }: { rows: Row[]; totals: View<Dashboard["totals"]> }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortDescriptor>({ column: "gross", direction: "descending" });
  const [shown, setShown] = useState(false);
  const hasReview = rows.some((r) => COLUMNS.some((c) => r.underReview[c.id] !== 0));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => `${r.propertyId} ${r.name ?? ""} ${r.cluster ?? ""}`.toLowerCase().includes(q))
      : rows;
    const key = sort.column as keyof Row;
    const dir = sort.direction === "descending" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""))) * dir;
    });
  }, [rows, query, sort]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">By villa</h2>
          <Chip size="sm" variant="soft">
            {visible.length}
          </Chip>
          <span className="text-sm text-muted">
            Clean records{shown && hasReview ? " · under each figure, the part records under review bring" : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {hasReview && (
            <Switch size="sm" isSelected={shown} onChange={setShown}>
              <Switch.Content className="text-sm text-muted">
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                Under review
              </Switch.Content>
            </Switch>
          )}
          <SearchField aria-label="Search villas" className="w-64" value={query} onChange={setQuery}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search villa or cluster…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </div>
      </div>

      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Figures by villa"
            className="min-w-[1180px]"
            sortDescriptor={sort}
            onSortChange={setSort}
          >
            <Table.Header>
              <Table.Column allowsSorting isRowHeader id="propertyId">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>Villa</Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="cluster">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>Cluster</Table.SortableColumnHeader>
                )}
              </Table.Column>
              {COLUMNS.map((c) => (
                <Table.Column key={c.id} allowsSorting id={c.id} className="text-end">
                  {({ sortDirection }) => (
                    <Table.SortableColumnHeader sortDirection={sortDirection} className="justify-end" title={c.hint}>
                      {c.label}
                    </Table.SortableColumnHeader>
                  )}
                </Table.Column>
              ))}
              <Table.Column allowsSorting id="flags" className="text-end">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader
                    sortDirection={sortDirection}
                    className="justify-end"
                    title="Source rows of the villa under review or awaiting a decision, whole data set"
                  >
                    DQ flags
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <div className="py-8 text-center text-sm text-muted">
                  {rows.length === 0 ? "No villas in this selection" : `No villas match “${query}”`}
                </div>
              )}
            >
              {visible.map((r) => (
                <Table.Row key={r.propertyId} id={r.propertyId}>
                  <Table.Cell>
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium">{r.name ?? r.propertyId}</span>
                      <span className="text-xs text-muted">{r.propertyId}</span>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-muted">{r.cluster ?? "—"}</Table.Cell>
                  {COLUMNS.map((c) => (
                    <Table.Cell key={c.id} className="text-end tabular-nums">
                      {c.id === "nights" ? count(r[c.id]) : idrFull(r[c.id])}
                      <UnderReview value={shown ? r.underReview[c.id] : 0} />
                    </Table.Cell>
                  ))}
                  <Table.Cell className="text-end">
                    {r.flags > 0 ? (
                      <Tooltip delay={200}>
                        <Tooltip.Trigger>
                          <Chip size="sm" variant="soft" color="warning" className="cursor-help">
                            {r.flags}
                          </Chip>
                        </Tooltip.Trigger>
                        <Tooltip.Content>Rows under review or awaiting a decision</Tooltip.Content>
                      </Tooltip>
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
            * Estimate: no owner payouts, opening balances or taxes in the source data. Totals are for the whole
            selection, computed from the clean rows.
          </span>
          <span className="tabular-nums">
            Gross <span className="font-medium">{idrFull(totals.gross)}</span>
            <UnderReview value={shown ? totals.underReview.gross : 0} inline /> · owner balance{" "}
            <span className="font-medium">{idrFull(totals.ownerBalance)}</span>
            <UnderReview value={shown ? totals.underReview.ownerBalance : 0} inline /> · received{" "}
            <span className="font-medium">{idrFull(totals.received)}</span>
            <UnderReview value={shown ? totals.underReview.received : 0} inline />
          </span>
        </Table.Footer>
      </Table>
    </section>
  );
}
