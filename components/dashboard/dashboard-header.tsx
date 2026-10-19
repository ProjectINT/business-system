export interface SourceSummary {
  properties: number;
  clusters: number;
  range: { from: string; to: string };
}

/** `summary` is `null` while the data loads: the title shows at once, the line under it after. */
export function DashboardHeader({ summary }: { summary: SourceSummary | null }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Portfolio overview</h1>
      <p className="text-sm text-muted">
        {summary === null
          ? " "
          : `${summary.properties} villas · ${summary.clusters} clusters · data ${summary.range.from} … ${summary.range.to} · amounts in IDR`}
      </p>
    </div>
  );
}
