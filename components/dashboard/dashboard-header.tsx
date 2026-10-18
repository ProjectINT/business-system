export interface SourceSummary {
  properties: number;
  clusters: number;
  asOf: string;
  asOfDefaulted: boolean;
  range: { from: string; to: string };
}

export function DashboardHeader({ summary }: { summary: SourceSummary }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Portfolio overview</h1>
      <p className="text-sm text-muted">
        {summary.properties} villas · {summary.clusters} clusters · data {summary.range.from} … {summary.range.to} · as
        of {summary.asOf}
        {summary.asOfDefaulted ? " (latest updated_at)" : ""} · amounts in IDR
      </p>
    </div>
  );
}
