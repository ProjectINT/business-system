"use client";

// The badge of a failed rule: an icon or a short tag in the colour of the action, the problem in words
// on hover. The same mark sits in the legend, so a person learns it once.
import { Chip, Tooltip } from "@heroui/react";
import type { Action } from "@/lib/dq";
import { ACTION_COLOR, ACTION_LABEL } from "@/components/status-meta";
import { ruleMeta } from "./rule-meta";

export interface RuleRef {
  id: string;
  /** The result's action, else the rule's; without one the badge stays neutral. */
  action?: Action;
}

/** The mark alone, no tooltip: for the legend and next to the rule's name. */
export function RuleMark({ id, action }: RuleRef) {
  const meta = ruleMeta(id);
  const Icon = meta.icon;
  return (
    <Chip
      size="sm"
      variant="soft"
      color={action === undefined ? "default" : ACTION_COLOR[action]}
      className="h-6 min-w-8 shrink-0 justify-center px-1.5"
      aria-label={meta.label}
    >
      {Icon !== undefined ? (
        <Icon className="size-3.5" aria-hidden />
      ) : (
        <span className="text-[10.5px] font-semibold tracking-wider">{meta.tag}</span>
      )}
    </Chip>
  );
}

export function RuleBadge({ id, action }: RuleRef) {
  const meta = ruleMeta(id);
  return (
    <Tooltip delay={200}>
      <Tooltip.Trigger className="cursor-help">
        <RuleMark id={id} action={action} />
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-72">
        <div className="flex flex-col gap-0.5 py-0.5">
          <span className="font-medium">{meta.label}</span>
          {meta.description !== "" && <span className="opacity-80">{meta.description}</span>}
          {action !== undefined && <span className="opacity-80">Row: {ACTION_LABEL[action]}</span>}
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function RuleBadges({ rules }: { rules: readonly RuleRef[] }) {
  if (rules.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {rules.map((r) => (
        <RuleBadge key={r.id} id={r.id} action={r.action} />
      ))}
    </div>
  );
}
