import { Card, Chip, Link } from "@heroui/react";
import { DATA_QUALITY, STATUS_META, type RecordStatus } from "@/lib/mock/dashboard";
import { count } from "@/lib/format";

const ORDER: RecordStatus[] = ["clean", "review", "excluded", "duplicate"];

const BAR_COLOR: Record<RecordStatus, string> = {
  clean: "bg-success",
  review: "bg-warning",
  excluded: "bg-danger",
  duplicate: "bg-muted",
};

export function DataQualityCard() {
  const { totalRows, byStatus, lastBatch } = DATA_QUALITY;

  return (
    <Card className="gap-5">
      <Card.Header className="gap-1">
        <Card.Title>Data quality</Card.Title>
        <Card.Description>
          Status of every source row after import checks
        </Card.Description>
      </Card.Header>

      <Card.Content className="gap-5">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tight">{count(totalRows)}</span>
          <span className="text-sm text-muted">rows in 5 source files</span>
        </div>

        <div className="flex h-2.5 w-full gap-0.5" role="img" aria-label="Rows by status">
          {ORDER.map((s) => (
            <div
              key={s}
              className={`${BAR_COLOR[s]} h-full first:rounded-s-full last:rounded-e-full`}
              style={{ width: `${(byStatus[s] / totalRows) * 100}%`, minWidth: 4 }}
            />
          ))}
        </div>

        <ul className="flex flex-col gap-3">
          {ORDER.map((s) => (
            <li key={s} className="flex items-center gap-3">
              <span className={`${BAR_COLOR[s]} size-2.5 shrink-0 rounded-full`} />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-sm font-medium">{STATUS_META[s].label}</span>
                <span className="truncate text-xs text-muted">{STATUS_META[s].description}</span>
              </div>
              <span className="text-sm tabular-nums">{count(byStatus[s])}</span>
            </li>
          ))}
        </ul>
      </Card.Content>

      <Card.Footer className="mt-auto flex items-center justify-between gap-2 text-sm">
        <Chip size="sm" variant="soft">
          Last batch {lastBatch.id} · {lastBatch.at}
        </Chip>
        <Link href="/imports" className="text-sm">
          Import logs
          <Link.Icon />
        </Link>
      </Card.Footer>
    </Card>
  );
}
