"use client";

// The card of a source row (ROADMAP.md phase 5): the row as received, the status and the rules behind
// it, and every rule's result on it — passed, failed with its facts, skipped with the reason.
import { Button, Chip, Drawer, Tooltip } from "@heroui/react";
import type { RuleInfo } from "@/lib/data";
import { ACTION_LABEL, STATUS_META } from "@/components/status-meta";
import { OUTCOME_META } from "./labels";
import type { RecordView } from "./view-of";

interface Props {
  record: RecordView | null;
  ruleOf: ReadonlyMap<string, RuleInfo>;
  /** Opens the card of another row by its natural key; `false` when no row has it. */
  onOpenKey: (key: string) => boolean;
  canOpen: (key: string) => boolean;
  onClose: () => void;
}

export function RecordDrawer({ record, ruleOf, onOpenKey, canOpen, onClose }: Props) {
  return (
    // Opened from many rows, so the overlay is controlled and has no trigger of its own.
    <Drawer.Backdrop isOpen={record !== null} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="w-full sm:w-[36rem]">
          {record !== null && <Card record={record} ruleOf={ruleOf} onOpenKey={onOpenKey} canOpen={canOpen} />}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

/** What went wrong first, then what was not checked and why, then what passed; run order within each. */
const ORDER = { error: 0, fail: 1, skip: 2, pass: 3 } as const;

function Card({ record, ruleOf, onOpenKey, canOpen }: Omit<Props, "record" | "onClose"> & { record: RecordView }) {
  const meta = STATUS_META[record.status];
  const failed = record.checks.filter((c) => c.outcome === "fail").length;
  const skipped = record.checks.filter((c) => c.outcome === "skip").length;
  const passed = record.checks.filter((c) => c.outcome === "pass").length;
  const checks = [...record.checks].sort((a, b) => ORDER[a.outcome] - ORDER[b.outcome]);

  return (
    <>
      <Drawer.CloseTrigger />
      <Drawer.Header className="gap-2">
        <Drawer.Heading className="font-mono text-lg">{record.key}</Drawer.Heading>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Chip size="sm" variant="soft" color={meta.color}>
            {meta.label}
          </Chip>
          <span>
            {record.fileName} · line {record.lineNo}
            {record.propertyId !== null && ` · ${record.propertyId}`}
            {record.amount !== null && ` · ${record.amount}`}
          </span>
        </div>
        <p className="text-sm text-muted">
          {record.statusRules.length === 0
            ? meta.description
            : `${meta.description}. Set by ${record.statusRules.map((id) => `${id} ${ruleOf.get(id)?.title ?? ""}`.trim()).join(", ")}.`}
        </p>
      </Drawer.Header>

      <Drawer.Body className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            Checks <span className="font-normal text-muted">· {failed} failed, {skipped} skipped, {passed} passed</span>
          </h3>
          <ol className="flex flex-col divide-y divide-separator rounded-xl border border-separator">
            {checks.map((c) => (
              <li key={c.ruleId} className="flex gap-3 px-3 py-2.5">
                <Chip
                  size="sm"
                  variant={c.outcome === "fail" ? "soft" : "secondary"}
                  color={c.action === "info" ? "default" : OUTCOME_META[c.outcome].color}
                  className="w-12 shrink-0 self-start justify-center"
                >
                  {OUTCOME_META[c.outcome].label}
                </Chip>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm">
                    <span className="font-mono text-xs text-muted">{c.ruleId}</span> {ruleOf.get(c.ruleId)?.title ?? c.ruleId}
                    {c.action !== undefined && <span className="text-xs text-muted"> · {ACTION_LABEL[c.action]}</span>}
                  </span>
                  {c.text !== undefined && (
                    <span className={`text-xs ${c.outcome === "fail" ? "text-foreground" : "text-muted"}`}>{c.text}</span>
                  )}
                  {c.related !== undefined && c.related.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {c.related.map((key) =>
                        canOpen(key) ? (
                          <Button key={key} size="sm" variant="tertiary" className="h-6 px-2 font-mono text-xs" onPress={() => onOpenKey(key)}>
                            {key}
                          </Button>
                        ) : (
                          <Tooltip key={key} delay={200}>
                            <Tooltip.Trigger>
                              <span className="cursor-help rounded-md px-2 font-mono text-xs text-muted">{key}</span>
                            </Tooltip.Trigger>
                            <Tooltip.Content>No row with this key in the data</Tooltip.Content>
                          </Tooltip>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            As received <span className="font-normal text-muted">· nothing corrected</span>
          </h3>
          <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-separator px-3 py-2.5 text-sm">
            {record.fields.map(([name, value]) => (
              <div key={name} className="contents">
                <dt className="text-muted">{name}</dt>
                <dd className="break-all font-mono text-[13px]">{value === "" ? <span className="text-muted">empty</span> : value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Drawer.Body>
    </>
  );
}
