"use client";

import { Card, Chip, SearchField, Table, Tabs, Tooltip } from "@heroui/react";
import { useMemo, useState } from "react";
import type { ReconciliationStatus, View } from "@/lib/calc";
import type { ReconciliationRow, ReconciliationView as Model, RuleInfo } from "@/lib/data";
import { count, idrFull, idrSignedCompact } from "@/lib/format";
import { RuleBadges } from "@/components/rules/rule-badge";
import { RuleLegendButton } from "@/components/rules/rule-legend";
import { ruleSearchText } from "@/components/rules/rule-meta";
import { RECONCILIATION_META, RECONCILIATION_ORDER, STATUS_META } from "@/components/status-meta";

type Row = View<ReconciliationRow>;
type Summary = View<Pick<Model, "expected" | "received" | "difference" | "byStatus" | "underReview" | "unallocatedAmount">>;

/** An unallocated payment with its amount already written out: it may be in another currency. */
export interface UnallocatedRow {
  paymentId: string | null;
  reservationId: string | null;
  propertyId: string | null;
  paymentDate: string | null;
  amount: string | null;
  ruleIds: string[];
}

const ALL = "all";

function Tile({ label, value, underReview, includeReview, hint }: {
  label: string;
  value: number;
  underReview: number;
  includeReview: boolean;
  hint: string;
}) {
  return (
    <Card className="gap-1">
      <Card.Content className="gap-1">
        <span className="text-sm text-muted">{label}</span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          <span className="me-1.5 text-sm font-normal text-muted">IDR</span>
          {idrFull(value)}
        </span>
        {underReview !== 0 && (
          <span className="text-xs text-warning">
            {includeReview
              ? `under review ${idrSignedCompact(underReview)}`
              : `${idrSignedCompact(underReview)} under review, not counted`}
          </span>
        )}
        <span className="text-xs text-muted">{hint}</span>
      </Card.Content>
    </Card>
  );
}

function RuleChips({ ids, ruleOf }: { ids: string[]; ruleOf: Map<string, RuleInfo> }) {
  return <RuleBadges rules={ids.map((id) => ({ id, action: ruleOf.get(id)?.action }))} />;
}

export function ReconciliationView({
  summary,
  rows,
  unallocated,
  includeReview,
  rules,
}: {
  summary: Summary;
  rows: Row[];
  unallocated: UnallocatedRow[];
  includeReview: boolean;
  rules: RuleInfo[];
}) {
  const [status, setStatus] = useState<ReconciliationStatus | typeof ALL>(ALL);
  const [query, setQuery] = useState("");
  const ruleOf = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === ALL || r.status === status) &&
        (q === "" || `${r.reservationId} ${r.propertyId} ${r.paymentIds.join(" ")} ${r.ruleIds.map(ruleSearchText).join(" ")}`.toLowerCase().includes(q)),
    );
  }, [rows, status, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Tile
          label="Expected payout"
          value={summary.expected}
          underReview={summary.underReview.expected}
          includeReview={includeReview}
          hint="Gross − OTA fee − refund"
        />
        <Tile
          label="Received"
          value={summary.received}
          underReview={summary.underReview.received}
          includeReview={includeReview}
          hint="Payments of these reservations, any date"
        />
        <Tile
          label="Difference"
          value={summary.difference}
          underReview={summary.underReview.difference}
          includeReview={includeReview}
          hint="Received − expected; negative is owed"
        />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            variant="secondary"
            selectedKey={status}
            onSelectionChange={(k) => setStatus(k as ReconciliationStatus | typeof ALL)}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Reconciliation status" className="w-fit min-w-0">
                <Tabs.Tab id={ALL} className="gap-2 whitespace-nowrap">
                  All
                  <span className="text-xs text-muted tabular-nums">{count(rows.length)}</span>
                  <Tabs.Indicator />
                </Tabs.Tab>
                {RECONCILIATION_ORDER.filter((s) => summary.byStatus[s] > 0).map((s) => (
                  <Tabs.Tab key={s} id={s} className="gap-2 whitespace-nowrap">
                    {RECONCILIATION_META[s].label}
                    <span className="text-xs text-muted tabular-nums">{count(summary.byStatus[s])}</span>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
          <div className="flex items-center gap-2">
            <RuleLegendButton ruleOf={ruleOf} />
            <SearchField aria-label="Search reservations" className="w-64" value={query} onChange={setQuery}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search reservation, villa, payment…" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>
        </div>

        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Reservations reconciled in the period" className="min-w-[1100px]">
              <Table.Header>
                <Table.Column isRowHeader>Reservation</Table.Column>
                <Table.Column>Stay</Table.Column>
                <Table.Column className="text-end">Expected</Table.Column>
                <Table.Column className="text-end">Received</Table.Column>
                <Table.Column className="text-end">Difference</Table.Column>
                <Table.Column>Status</Table.Column>
                <Table.Column>Data quality</Table.Column>
                <Table.Column>Payments</Table.Column>
              </Table.Header>
              <Table.Body
                renderEmptyState={() => <div className="py-8 text-center text-sm text-muted">No reservations match</div>}
              >
                {visible.map((r) => (
                  <Table.Row key={r.reservationId} id={r.reservationId}>
                    <Table.Cell>
                      <div className="flex flex-col leading-tight">
                        <span className="font-medium">{r.reservationId}</span>
                        <span className="text-xs text-muted">
                          {r.propertyId} · {r.reservationStatus}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap tabular-nums text-muted">
                      {r.checkIn} → {r.checkOut}
                    </Table.Cell>
                    <Table.Cell className="text-end tabular-nums">{idrFull(r.expected)}</Table.Cell>
                    <Table.Cell className="text-end tabular-nums">{idrFull(r.received)}</Table.Cell>
                    <Table.Cell
                      className={`text-end tabular-nums ${r.status === "not_received" || r.status === "underpaid" ? "text-danger" : ""}`}
                    >
                      {idrFull(r.difference)}
                    </Table.Cell>
                    <Table.Cell>
                      <Tooltip delay={200}>
                        <Tooltip.Trigger>
                          <Chip size="sm" variant="soft" color={RECONCILIATION_META[r.status].color} className="cursor-help">
                            {RECONCILIATION_META[r.status].label}
                          </Chip>
                        </Tooltip.Trigger>
                        <Tooltip.Content>{RECONCILIATION_META[r.status].description}</Tooltip.Content>
                      </Tooltip>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Chip size="sm" variant="soft" color={STATUS_META[r.dqStatus].color}>
                          {STATUS_META[r.dqStatus].label}
                        </Chip>
                        <RuleChips ids={r.ruleIds} ruleOf={ruleOf} />
                      </div>
                    </Table.Cell>
                    <Table.Cell className="font-mono text-[13px] text-muted">
                      {r.paymentIds.length > 0 ? r.paymentIds.join(", ") : "—"}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
          <Table.Footer className="text-sm text-muted">
            Reservations checking out in the period. Due at check-in: “not due” only when check-in is still ahead.
            Cancellations expect 0.
          </Table.Footer>
        </Table>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-semibold">Unallocated payments</h2>
          <span className="text-sm text-muted">
            Excluded by the checks, so they reach no reservation · IDR {idrFull(summary.unallocatedAmount)}
          </span>
        </div>
        <Table variant="secondary">
          <Table.ScrollContainer>
            <Table.Content aria-label="Unallocated payments" className="min-w-[800px]">
              <Table.Header>
                <Table.Column isRowHeader>Payment</Table.Column>
                <Table.Column>Reservation</Table.Column>
                <Table.Column>Villa</Table.Column>
                <Table.Column>Date</Table.Column>
                <Table.Column className="text-end">Amount</Table.Column>
                <Table.Column>Why</Table.Column>
              </Table.Header>
              <Table.Body
                renderEmptyState={() => (
                  <div className="py-6 text-center text-sm text-muted">No unallocated payments in this selection</div>
                )}
              >
                {unallocated.map((u, i) => (
                  <Table.Row key={u.paymentId ?? i} id={u.paymentId ?? i}>
                    <Table.Cell className="font-medium">{u.paymentId ?? "—"}</Table.Cell>
                    <Table.Cell>{u.reservationId ?? "—"}</Table.Cell>
                    <Table.Cell>{u.propertyId ?? "—"}</Table.Cell>
                    <Table.Cell className="tabular-nums">{u.paymentDate ?? "—"}</Table.Cell>
                    <Table.Cell className="text-end tabular-nums">{u.amount ?? "—"}</Table.Cell>
                    <Table.Cell>
                      <RuleChips ids={u.ruleIds} ruleOf={ruleOf} />
                    </Table.Cell>
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
