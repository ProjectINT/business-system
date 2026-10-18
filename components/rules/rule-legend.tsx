"use client";

// The legend of the rule badges: every mark with the problem it stands for, by area, and what the
// colours mean. Opens from a button next to any table that shows badges.
import { Button, Chip, Popover } from "@heroui/react";
import { CircleInfo } from "@gravity-ui/icons";
import type { Action } from "@/lib/dq";
import { ACTION_COLOR } from "@/components/status-meta";
import { RuleMark } from "./rule-badge";
import { RULE_GROUP_LABEL, RULE_META, type RuleGroup } from "./rule-meta";

type ActionOf = ReadonlyMap<string, { action: Action }>;

const COLOURS: { action: Action; text: string }[] = [
  { action: "exclude", text: "excluded" },
  { action: "decide", text: "awaits a decision" },
  { action: "review", text: "flagged for review" },
  { action: "info", text: "information, or a dropped copy" },
];

export function RuleLegend({ ruleOf }: { ruleOf?: ActionOf }) {
  const groups = Object.keys(RULE_GROUP_LABEL) as RuleGroup[];
  const ids = Object.keys(RULE_META);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted">{RULE_GROUP_LABEL[g]}</h4>
          <dl className="grid grid-cols-[3rem_1fr] items-start gap-x-2 gap-y-2">
            {ids
              .filter((id) => RULE_META[id]!.group === g)
              .map((id) => (
                <div key={id} className="contents">
                  <dt className="pt-px">
                    <RuleMark id={id} action={ruleOf?.get(id)?.action} />
                  </dt>
                  <dd className="flex flex-col text-sm leading-tight">
                    <span className="font-medium">{RULE_META[id]!.label}</span>
                    <span className="text-xs text-muted">{RULE_META[id]!.description}</span>
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-separator pt-3 text-xs text-muted">
        <span>Colour: what happens to the row</span>
        {COLOURS.map((c) => (
          <Chip key={c.action} size="sm" variant="soft" color={ACTION_COLOR[c.action]}>
            {c.text}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function RuleLegendButton({ ruleOf }: { ruleOf?: ActionOf }) {
  return (
    <Popover>
      <Button size="sm" variant="ghost" className="gap-1.5">
        <CircleInfo className="size-4" />
        Legend
      </Button>
      <Popover.Content placement="bottom end" className="max-h-[min(36rem,80vh)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto">
        <Popover.Dialog className="flex flex-col gap-3 p-4 outline-none">
          <Popover.Heading className="text-sm font-semibold">What the badges mean</Popover.Heading>
          <RuleLegend ruleOf={ruleOf} />
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
