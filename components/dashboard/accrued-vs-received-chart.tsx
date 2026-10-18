"use client";

import { Card } from "@heroui/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from "recharts";
import type { WeekPoint } from "@/lib/mock/dashboard";
import { idrCompact, idrFull } from "@/lib/format";

// Validated pair (dataviz validator, dark surface #18181b): CVD ΔE 26.8.
const SERIES = [
  { key: "accrued", label: "Net rental accrued", color: "#3987e5" },
  { key: "received", label: "Cash received", color: "#d95926" },
] as const;

const axisTick = (value: number) => (value === 0 ? "0" : idrCompact(value).replace("IDR ", ""));

function ChartTooltip({ active, payload, label }: TooltipContentProps<TooltipValueType, string | number>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-overlay px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">Week of {label}</div>
      {SERIES.map((s) => {
        const item = payload.find((p) => p.dataKey === s.key);
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="ms-auto ps-4 tabular-nums">{idrFull(Number(item?.value ?? 0))}</span>
          </div>
        );
      })}
    </div>
  );
}

export function AccruedVsReceivedChart({ data }: { data: WeekPoint[] }) {
  return (
    <Card className="gap-4">
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Card.Title>Accrued vs received</Card.Title>
          <Card.Description>
            Net rental (gross − OTA fee) by check-in week vs cash by payment date
          </Card.Description>
        </div>
        <ul className="flex items-center gap-4 text-sm" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-muted">{s.label}</span>
            </li>
          ))}
        </ul>
      </Card.Header>
      <Card.Content>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickFormatter={axisTick}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip content={ChartTooltip} cursor={{ fillOpacity: 0.06 }} />
              {SERIES.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  maxBarSize={18}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card.Content>
    </Card>
  );
}
