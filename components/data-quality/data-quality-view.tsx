"use client";

// The data-quality page (PLAN.md 8, page 3): rows by status, control totals per file, gross by villa
// clean and under review, a summary per rule, the list of problems with filters, the cases a human
// will decide, the report «excluded automatically», and the card of any row with every rule's result on it.
import { Alert, Card, Chip, Label, ListBox, SearchField, Select, Table, Tabs, Tooltip, type Key } from "@heroui/react";
import { CircleCheck, CircleXmark } from "@gravity-ui/icons";
import { useMemo, useState } from "react";
import type { RuleInfo } from "@/lib/data";
import type { RowEntity, Status } from "@/lib/dq";
import { count, idrFull } from "@/lib/format";
import { ACTION_LABEL, STATUS_META, STATUS_ORDER } from "@/components/status-meta";
import { CaseList } from "./case-list";
import { GbvChart, type GbvPoint } from "./gbv-chart";
import { areaLabel, FILE_LABEL, FILE_ORDER } from "./labels";
import { RecordDrawer } from "./record-drawer";
import type { DataQualityModel, FileView, IssueView, RuleView } from "./view-of";

type Tab = "rules" | "problems" | "cases" | "excluded";

const ALL = "all";

export function DataQualityView({ model, gbv }: { model: DataQualityModel; gbv: GbvPoint[] }) {
  const [tab, setTab] = useState<Tab>("rules");
  const [rule, setRule] = useState<string>(ALL);
  const [open, setOpen] = useState<string | null>(null);

  const ruleOf = useMemo(
    () => new Map<string, RuleInfo>(model.rules.map((r) => [r.id, { id: r.id, title: r.title, action: r.action, entities: r.entities, engine: r.engine }])),
    [model.rules],
  );
  const recordOf = useMemo(() => new Map(model.records.map((r) => [r.unitId, r])), [model.records]);
  /** Natural key → the row it names; an exact copy (DQ-01) never wins over the first row. */
  const unitOfKey = useMemo(() => {
    const out = new Map<string, string>();
    for (const r of model.records) if (r.status !== "duplicate" && !out.has(r.key)) out.set(r.key, r.unitId);
    return out;
  }, [model.records]);

  const showRule = (id: string) => {
    setRule(id);
    setTab("problems");
  };

  return (
    <div className="flex flex-col gap-6">
      {model.runStatus === "failed" && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Data checks failed: statuses below may be wrong</Alert.Title>
            <Alert.Description>{model.runFailures.join(" · ")}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <StatusTiles model={model} onExcluded={() => setTab("excluded")} onCases={() => setTab("cases")} />
      <ControlTotals files={model.files} />
      <GbvChart data={gbv} />

      <Tabs variant="secondary" selectedKey={tab} onSelectionChange={(k) => setTab(k as Tab)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Data quality views" className="w-fit min-w-0">
            <TabTitle id="rules" label="Rules" n={model.rules.length} />
            <TabTitle id="problems" label="Problems" n={model.issues.length} />
            <TabTitle id="cases" label="Cases to decide" n={model.caseCount} />
            <TabTitle id="excluded" label="Excluded automatically" n={model.excluded.length} />
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="rules" className="pt-4">
          <RulesTable rules={model.rules} onShow={showRule} />
        </Tabs.Panel>
        <Tabs.Panel id="problems" className="pt-4">
          <Problems issues={model.issues} rules={model.rules} rule={rule} onRule={setRule} ruleOf={ruleOf} onOpen={setOpen} />
        </Tabs.Panel>
        <Tabs.Panel id="cases" className="flex flex-col gap-4 pt-4">
          <p className="max-w-3xl text-sm text-muted">
            The system cannot pick the right bookings of an overlap or link a modified booking to its original: that takes
            facts outside the data — who stayed, who was moved, which booking the channel cancelled. These {model.caseCount}{" "}
            cases ({count(model.caseReservations)} bookings, and {count(model.heldPayments)} payments of IDR {model.heldAmount}{" "}
            that wait with them) count as under review here; level 2 holds them out of the figures until a person decides.
          </p>
          <CaseList villas={model.villas} ruleOf={ruleOf} onOpen={setOpen} />
        </Tabs.Panel>
        <Tabs.Panel id="excluded" className="flex flex-col gap-4 pt-4">
          <Excluded model={model} ruleOf={ruleOf} onOpen={setOpen} />
        </Tabs.Panel>
      </Tabs>

      <RecordDrawer
        record={open === null ? null : (recordOf.get(open) ?? null)}
        ruleOf={ruleOf}
        canOpen={(key) => unitOfKey.has(key)}
        onOpenKey={(key) => {
          const unitId = unitOfKey.get(key);
          if (unitId !== undefined) setOpen(unitId);
          return unitId !== undefined;
        }}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

function TabTitle({ id, label, n }: { id: Tab; label: string; n: number }) {
  return (
    <Tabs.Tab id={id} className="gap-2 whitespace-nowrap">
      {label}
      <span className="text-xs text-muted tabular-nums">{count(n)}</span>
      <Tabs.Indicator />
    </Tabs.Tab>
  );
}

// ── rows by status ──────────────────────────────────────────────────────────

function StatusTiles({ model, onExcluded, onCases }: { model: DataQualityModel; onExcluded: () => void; onCases: () => void }) {
  const total = STATUS_ORDER.reduce((n, s) => n + model.counts[s], 0);
  const inFigures = model.counts.clean + model.counts.review + model.counts.pending;
  const extra: Partial<Record<Status, { text: string; onPress?: () => void }>> = {
    pending: {
      text: `${model.caseCount} cases: ${model.caseReservations} bookings + ${model.heldPayments} payments`,
      onPress: onCases,
    },
    excluded: { text: "Report: excluded automatically", onPress: onExcluded },
    duplicate: { text: "Report: excluded automatically", onPress: onExcluded },
  };
  const shown = STATUS_ORDER.filter((s) => s !== "superseded" || model.counts[s] > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {shown.map((s) => {
          const e = extra[s];
          return (
            <Card key={s} className="gap-1">
              <Card.Content className="gap-1">
                <div className="flex items-center justify-between gap-2">
                  <Chip size="sm" variant="soft" color={STATUS_META[s].color}>
                    {STATUS_META[s].label}
                  </Chip>
                  <span className="text-xs text-muted tabular-nums">{((model.counts[s] / total) * 100).toFixed(0)} %</span>
                </div>
                <span className="text-2xl font-semibold tracking-tight tabular-nums">{count(model.counts[s])}</span>
                <span className="text-xs text-muted">{STATUS_META[s].description}</span>
                {e !== undefined &&
                  (e.onPress === undefined ? (
                    <span className="text-xs">{e.text}</span>
                  ) : (
                    <button type="button" onClick={e.onPress} className="w-fit text-start text-xs text-accent hover:underline">
                      {e.text}
                    </button>
                  ))}
              </Card.Content>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        {count(total)} source rows in {model.files.length} files · in the figures {count(inFigures)} (clean, review and, at level 1,
        pending) · outside {count(total - inFigures)}
      </p>
    </div>
  );
}

// ── control totals ──────────────────────────────────────────────────────────

const AMOUNT_LABEL: Record<string, string> = { gross_booking_value: "GBV", amount: "Amount" };

function ControlTotals({ files }: { files: FileView[] }) {
  const ordered = FILE_ORDER.flatMap((e) => files.filter((f) => f.entity === e));
  const allBalanced = files.every((f) => f.balanced);
  type Line = { id: string; label: string; sub: boolean; cells: [string, string, string, string]; file?: FileView };
  const lines: Line[] = ordered.flatMap((f): Line[] => [
    {
      id: f.fileName,
      label: f.fileName,
      sub: false,
      cells: [count(f.rowCount), count(f.rowsInFigures), count(f.rows.excluded), count(f.rows.duplicate)],
      file: f,
    },
    ...f.amounts.map(
      (a): Line => ({
        id: `${f.fileName}:${a.currency}`,
        label: `${AMOUNT_LABEL[f.amountColumn!] ?? f.amountColumn}, ${a.currency}`,
        sub: true,
        cells: [a.source, a.inFigures, a.excluded, a.duplicate],
      }),
    ),
  ]);

  return (
    <Card className="gap-4">
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Card.Title>Control totals</Card.Title>
          <Card.Description>
            Per file: what the file holds = what reaches the figures + excluded + dropped duplicates, by rows and by amount.
            No rupiah leaves the figures silently.
          </Card.Description>
        </div>
        <Chip size="sm" variant="soft" color={allBalanced ? "success" : "danger"}>
          {allBalanced ? "All files add up" : "Totals differ"}
        </Chip>
      </Card.Header>
      <Card.Content>
        <Table variant="secondary">
          <Table.ScrollContainer>
            <Table.Content aria-label="Control totals per file" className="min-w-[760px]">
              <Table.Header>
                <Table.Column isRowHeader>File</Table.Column>
                <Table.Column className="text-end">In the file</Table.Column>
                <Table.Column className="text-end">= In the figures</Table.Column>
                <Table.Column className="text-end">+ Excluded</Table.Column>
                <Table.Column className="text-end">+ Duplicates</Table.Column>
                <Table.Column>DQ-90</Table.Column>
              </Table.Header>
              <Table.Body>
                {lines.map((l) => (
                  <Table.Row key={l.id} id={l.id}>
                    <Table.Cell className={l.sub ? "ps-8 text-muted" : "font-medium"}>
                      {l.sub ? l.label : `${l.label} · rows`}
                    </Table.Cell>
                    {l.cells.map((c, i) => (
                      <Table.Cell key={i} className={`text-end tabular-nums ${l.sub ? "text-muted" : ""}`}>
                        {c}
                      </Table.Cell>
                    ))}
                    <Table.Cell>{l.file !== undefined && <Control file={l.file} />}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
          <Table.Footer className="text-sm text-muted">
            In the figures: clean, review and pending rows (level 1 has no decisions, pending counts as under review). R0061 is in
            USD and stays apart: its amount is never added to IDR.
          </Table.Footer>
        </Table>
      </Card.Content>
    </Card>
  );
}

function Control({ file }: { file: FileView }) {
  const ok = file.balanced;
  return (
    <Tooltip delay={200}>
      <Tooltip.Trigger className="flex w-fit cursor-help items-center gap-1.5 text-sm">
        {ok ? <CircleCheck className="size-4 text-success" /> : <CircleXmark className="size-4 text-danger" />}
        {ok ? "adds up" : file.control === null ? "not run" : "differs"}
      </Tooltip.Trigger>
      <Tooltip.Content>
        The loader read {count(file.rowCount)} rows; every row has exactly one status.
        {file.unsummed > 0 && ` ${file.unsummed} rows have no amount that parsed: counted, not summed.`}
      </Tooltip.Content>
    </Tooltip>
  );
}

// ── rules ───────────────────────────────────────────────────────────────────

function RulesTable({ rules, onShow }: { rules: RuleView[]; onShow: (id: string) => void }) {
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content
          aria-label="Rules and their results"
          className="min-w-[1000px]"
          onRowAction={(key) => {
            const r = rules.find((x) => x.id === key);
            if (r !== undefined && r.outcomes.fail > 0) onShow(r.id);
          }}
        >
          <Table.Header>
            <Table.Column isRowHeader className="w-20">
              Rule
            </Table.Column>
            <Table.Column>Check</Table.Column>
            <Table.Column>Area</Table.Column>
            <Table.Column>When it fails</Table.Column>
            <Table.Column className="text-end">Pass</Table.Column>
            <Table.Column className="text-end">Fail</Table.Column>
            <Table.Column className="text-end">Skip</Table.Column>
            <Table.Column className="text-end">In question, IDR</Table.Column>
          </Table.Header>
          <Table.Body>
            {rules.map((r) => {
              const split = Object.entries(r.failsByAction);
              return (
                <Table.Row key={r.id} id={r.id} className={r.outcomes.fail > 0 ? "cursor-pointer" : undefined}>
                  <Table.Cell className="font-mono text-[13px]">{r.id}</Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-col leading-tight">
                      <span>{r.title}</span>
                      {r.engine === "sql" && <span className="text-xs text-muted">SQL at level 2, its TS twin here</span>}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-muted">{areaLabel(r.entities)}</Table.Cell>
                  <Table.Cell>
                    {split.length > 1 ? (
                      <span className="text-sm">{split.map(([a, n]) => `${n} ${ACTION_LABEL[a as keyof typeof ACTION_LABEL]}`).join(", ")}</span>
                    ) : (
                      <span className="text-sm">{ACTION_LABEL[r.action]}</span>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-end tabular-nums text-muted">{count(r.outcomes.pass)}</Table.Cell>
                  <Table.Cell className={`text-end tabular-nums ${r.outcomes.fail > 0 ? "font-medium text-accent" : "text-muted"}`}>
                    {count(r.outcomes.fail)}
                  </Table.Cell>
                  <Table.Cell className="text-end tabular-nums text-muted">{count(r.outcomes.skip)}</Table.Cell>
                  <Table.Cell className="text-end tabular-nums">{r.amount === 0 ? <span className="text-muted">—</span> : idrFull(r.amount)}</Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
      <Table.Footer className="text-sm text-muted">
        Every rule gives every row of its area a verdict: pass, fail, or skip with a reason. A row that an earlier rule
        excluded is skipped by the later ones, so no amount is in question twice for one rule. “In question” is the rule’s own
        amount: GBV of a booking, the payment, the shortfall at check-in (DQ-16).
        Click a rule to see its problems.
      </Table.Footer>
    </Table>
  );
}

// ── problems ────────────────────────────────────────────────────────────────

function Problems({
  issues,
  rules,
  rule,
  onRule,
  ruleOf,
  onOpen,
}: {
  issues: IssueView[];
  rules: RuleView[];
  rule: string;
  onRule: (id: string) => void;
  ruleOf: ReadonlyMap<string, RuleInfo>;
  onOpen: (unitId: string) => void;
}) {
  const [entity, setEntity] = useState<RowEntity | typeof ALL>(ALL);
  const [status, setStatus] = useState<Status | typeof ALL>(ALL);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return issues.filter(
      (i) =>
        (rule === ALL || i.ruleId === rule) &&
        (entity === ALL || i.entity === entity) &&
        (status === ALL || i.status === status) &&
        (q === "" || `${i.key} ${i.propertyId ?? ""} ${i.ruleId} ${i.text}`.toLowerCase().includes(q)),
    );
  }, [issues, rule, entity, status, query]);

  const withFails = rules.filter((r) => r.outcomes.fail > 0);
  const entities = FILE_ORDER.filter((e) => issues.some((i) => i.entity === e));
  const statuses = STATUS_ORDER.filter((s) => issues.some((i) => i.status === s));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Filter
          label="Rule"
          className="w-72"
          value={rule}
          onChange={onRule}
          options={withFails.map((r) => ({ id: r.id, label: `${r.id} ${r.title} (${r.outcomes.fail})` }))}
          all="All rules"
        />
        <Filter
          label="File"
          className="w-48"
          value={entity}
          onChange={(v) => setEntity(v as RowEntity | typeof ALL)}
          options={entities.map((e) => ({ id: e, label: FILE_LABEL[e] }))}
          all="All files"
        />
        <Filter
          label="Row status"
          className="w-44"
          value={status}
          onChange={(v) => setStatus(v as Status | typeof ALL)}
          options={statuses.map((s) => ({ id: s, label: STATUS_META[s].label }))}
          all="All statuses"
        />
        <SearchField aria-label="Search problems" className="w-64" value={query} onChange={setQuery}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search id, villa, text…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>

      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Problems found by the checks" className="min-w-[1100px]" onRowAction={(key) => onOpen(String(key).split("|")[1]!)}>
            <Table.Header>
              <Table.Column isRowHeader className="w-28">
                Record
              </Table.Column>
              <Table.Column className="w-20">Villa</Table.Column>
              <Table.Column className="w-24">Rule</Table.Column>
              <Table.Column>Finding</Table.Column>
              <Table.Column className="text-end">In question, IDR</Table.Column>
              <Table.Column>Row status</Table.Column>
            </Table.Header>
            <Table.Body renderEmptyState={() => <div className="py-8 text-center text-sm text-muted">No problems match the filters</div>}>
              {visible.map((i) => (
                <Table.Row key={`${i.ruleId}|${i.unitId}`} id={`${i.ruleId}|${i.unitId}`} className="cursor-pointer">
                  <Table.Cell>
                    <div className="flex flex-col leading-tight">
                      <span className="font-mono text-[13px] font-medium">{i.key}</span>
                      <span className="text-xs text-muted">{FILE_LABEL[i.entity]}</span>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-muted">{i.propertyId ?? "—"}</Table.Cell>
                  <Table.Cell>
                    <Tooltip delay={200}>
                      <Tooltip.Trigger>
                        <Chip size="sm" variant="secondary" className="cursor-help font-mono">
                          {i.ruleId}
                        </Chip>
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {ruleOf.get(i.ruleId)?.title}: {ACTION_LABEL[i.action]}
                      </Tooltip.Content>
                    </Tooltip>
                  </Table.Cell>
                  <Table.Cell className="text-sm">{i.text}</Table.Cell>
                  <Table.Cell className="text-end tabular-nums">{i.amount ?? <span className="text-muted">—</span>}</Table.Cell>
                  <Table.Cell>
                    <Chip size="sm" variant="soft" color={STATUS_META[i.status].color}>
                      {STATUS_META[i.status].label}
                    </Chip>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        <Table.Footer className="text-sm text-muted">
          Showing {count(visible.length)} of {count(issues.length)} failed checks. One row can fail several rules; its status is
          the strongest action among them. Click a row for its card.
        </Table.Footer>
      </Table>
    </div>
  );
}

function Filter({
  label,
  className,
  value,
  onChange,
  options,
  all,
}: {
  label: string;
  className: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  all: string;
}) {
  return (
    <Select className={className} value={value} onChange={(k: Key | null) => onChange(String(k ?? ALL))}>
      <Label className="text-xs text-muted">{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id={ALL} textValue={all}>
            {all}
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

// ── excluded automatically ──────────────────────────────────────────────────

function Excluded({ model, ruleOf, onOpen }: { model: DataQualityModel; ruleOf: ReadonlyMap<string, RuleInfo>; onOpen: (unitId: string) => void }) {
  return (
    <>
      <p className="max-w-3xl text-sm text-muted">
        The system decides these rows itself and for good: exact copies are dropped, rows that contradict themselves or point
        nowhere are excluded. Nobody is asked to decide them. If the source was wrong, it is fixed there and the next import
        takes the row; a payment whose reservation arrives later is taken by the run that brings it.
      </p>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="Rows excluded automatically" className="min-w-[1000px]" onRowAction={(key) => onOpen(String(key))}>
            <Table.Header>
              <Table.Column isRowHeader className="w-28">
                Record
              </Table.Column>
              <Table.Column>File, line</Table.Column>
              <Table.Column className="w-20">Villa</Table.Column>
              <Table.Column>Status</Table.Column>
              <Table.Column>Rule</Table.Column>
              <Table.Column>Why</Table.Column>
              <Table.Column className="text-end">Amount</Table.Column>
            </Table.Header>
            <Table.Body renderEmptyState={() => <div className="py-8 text-center text-sm text-muted">Nothing excluded</div>}>
              {model.excluded.map((e) => (
                <Table.Row key={e.unitId} id={e.unitId} className="cursor-pointer">
                  <Table.Cell className="font-mono text-[13px] font-medium">{e.key}</Table.Cell>
                  <Table.Cell className="text-muted">
                    {e.fileName} · {e.lineNo}
                  </Table.Cell>
                  <Table.Cell className="text-muted">{e.propertyId ?? "—"}</Table.Cell>
                  <Table.Cell>
                    <Chip size="sm" variant="soft" color={STATUS_META[e.status].color}>
                      {STATUS_META[e.status].label}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap gap-1">
                      {e.rules.map((id) => (
                        <Tooltip key={id} delay={200}>
                          <Tooltip.Trigger>
                            <Chip size="sm" variant="secondary" className="cursor-help font-mono">
                              {id}
                            </Chip>
                          </Tooltip.Trigger>
                          <Tooltip.Content>{ruleOf.get(id)?.title ?? id}</Tooltip.Content>
                        </Tooltip>
                      ))}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-sm">{e.reason}</Table.Cell>
                  <Table.Cell className="text-end tabular-nums">{e.amount ?? "—"}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        <Table.Footer className="text-sm text-muted">Amounts in IDR unless the currency is named. Click a row for its card.</Table.Footer>
      </Table>
    </>
  );
}
