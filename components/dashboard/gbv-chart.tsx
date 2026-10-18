"use client";

// Gross bookings by villa (PLAN.md 8: one chart), split into clean records and records under review:
// how much of each villa's figure rests on rows in question. With the switch off, the part under
// review is drawn faded — it is not in the figures but still visible.
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
import { idrCompact, idrFull } from "@/lib/format";

export interface GbvPoint {
  id: string;
  name: string | null;
  clean: number;
  underReview: number;
}

// Validated pair (dataviz validator, dark surface): CVD ΔE 26.8, normal-vision ΔE 31.8.
const COLORS = { clean: "#3987e5", underReview: "#d95926" } as const;

const axisTick = (value: number) => (value === 0 ? "0" : idrCompact(value).replace("IDR ", ""));

function ChartTooltip({ active, payload }: TooltipContentProps<TooltipValueType, string | number>) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload as GbvPoint;
  const rows = [
    { label: "Clean", value: point.clean, color: COLORS.clean },
    { label: "Under review", value: point.underReview, color: COLORS.underReview },
  ];
  return (
    <div className="rounded-xl border border-border bg-overlay px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">
        {point.id}
        {point.name ? ` · ${point.name}` : ""}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: r.color }} />
          <span className="text-muted">{r.label}</span>
          <span className="ms-auto ps-4 tabular-nums">{idrFull(r.value)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-separator pt-1">
        <span className="text-muted">Total</span>
        <span className="tabular-nums">{idrFull(point.clean + point.underReview)}</span>
      </div>
    </div>
  );
}

export function GbvChart({ data, includeReview }: { data: GbvPoint[]; includeReview: boolean }) {
  const series = [
    { key: "clean", label: "Clean records", color: COLORS.clean, opacity: 1 },
    {
      key: "underReview",
      label: includeReview ? "Records under review" : "Under review (not counted)",
      color: COLORS.underReview,
      opacity: includeReview ? 1 : 0.35,
    },
  ] as const;

  return (
    <Card className="gap-4">
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Card.Title>Gross bookings by villa</Card.Title>
          <Card.Description>Nights of stay in the period; overlaps and unpaid stays are under review</Card.Description>
        </div>
        <ul className="flex items-center gap-4 text-sm" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: s.color, opacity: s.opacity }} />
              <span className="text-muted">{s.label}</span>
            </li>
          ))}
        </ul>
      </Card.Header>
      <Card.Content>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="id" tickLine={false} axisLine={false} tickMargin={8} interval={0} fontSize={11} />
              <YAxis tickFormatter={axisTick} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={ChartTooltip} cursor={{ fillOpacity: 0.06 }} />
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="gbv"
                  fill={s.color}
                  fillOpacity={s.opacity}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  maxBarSize={22}
                  radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card.Content>
    </Card>
  );
}
