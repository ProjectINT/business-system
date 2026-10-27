"use client";

// The mark of an exception code: the matching data-quality rule's icon or tag in the colour of the
// action (RuleMark), or the code's own tag; the problem, the kind and the fix on hover.
import { Chip, Tooltip } from "@heroui/react";
import type { Action } from "@/lib/dq";
import type { ExceptionCode } from "@/lib/nightly";
import { RuleMark } from "@/components/rules/rule-badge";
import { ACTION_COLOR, ACTION_LABEL } from "@/components/status-meta";
import { actionOf, CODE_META, KIND_META, ruleOfCode } from "./exception-meta";

export function CodeMark({ code, record_type = "reservation", action }: { code: ExceptionCode; record_type?: "reservation" | "payment"; action?: Action }) {
  const rule = ruleOfCode(code, record_type);
  const a = action ?? actionOf(code);
  if (rule !== null) return <RuleMark id={rule} action={a} />;
  return (
    <Chip size="sm" variant="soft" color={ACTION_COLOR[a]} className="h-6 min-w-8 shrink-0 justify-center px-1.5" aria-label={CODE_META[code].label}>
      <span className="text-[10.5px] font-semibold tracking-wider">{CODE_META[code].tag}</span>
    </Chip>
  );
}

export function CodeBadge(props: { code: ExceptionCode; record_type?: "reservation" | "payment"; action?: Action }) {
  const m = CODE_META[props.code];
  const a = props.action ?? actionOf(props.code);
  return (
    <Tooltip delay={200}>
      <Tooltip.Trigger className="cursor-help">
        <CodeMark {...props} />
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-72">
        <div className="flex flex-col gap-0.5 py-0.5">
          <span className="font-medium">{m.label}</span>
          <span className="opacity-80">{m.description}</span>
          <span className="opacity-80">
            {KIND_META[m.kind].label} · {ACTION_LABEL[a]}
          </span>
          <span className="opacity-80">Fix: {m.fix}</span>
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}
