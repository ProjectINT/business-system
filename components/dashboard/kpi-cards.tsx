import { Card, Chip } from "@heroui/react";
import type { Kpi } from "@/lib/mock/dashboard";
import { idrCompact } from "@/lib/format";

export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {items.map((kpi) => (
        <Card key={kpi.id} className="gap-3">
          <Card.Header className="flex-row items-center justify-between gap-2">
            <Card.Description className="text-sm">{kpi.label}</Card.Description>
            {kpi.tag && (
              <Chip size="sm" variant="soft" color={kpi.tag.color}>
                {kpi.tag.label}
              </Chip>
            )}
          </Card.Header>
          <Card.Content className="gap-1">
            <span className="text-2xl font-semibold tracking-tight" title={`IDR ${kpi.value.toLocaleString("en-US")}`}>
              {idrCompact(kpi.value)}
            </span>
            <span className="text-xs text-muted">{kpi.hint}</span>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
