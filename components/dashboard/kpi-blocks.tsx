"use client";

// The three blocks of PLAN.md 7.4, each labelled with its basis so that revenue and cash are not
// mixed: accruals by nights of stay, cash by payment date, reconciliation by check-out. Next to every
// total — the part of it that records under review bring (with them − without them).
import { Card, Chip, Link, Tooltip } from "@heroui/react";
import { CircleInfo } from "@gravity-ui/icons";
import type { OwnerBalanceGap, ReconciliationStatus, View } from "@/lib/calc";
import type { Dashboard, Headline } from "@/lib/data";
import { count, idrCompact, idrFull, idrSignedCompact } from "@/lib/format";
import { OWNER_BALANCE_GAP_LABEL, RECONCILIATION_META, RECONCILIATION_ORDER } from "@/components/status-meta";

type HeadlineView = View<Headline>;
type MoneyKey = Exclude<keyof HeadlineView, "nights">;

interface Props {
  headline: HeadlineView;
  underReview: HeadlineView;
  includeReview: boolean;
  byStatus: Record<ReconciliationStatus, number>;
  cancellations: View<Dashboard["cancellations"]>;
  ownerBalanceGaps: OwnerBalanceGap[];
  reconciliationHref: string;
}

function UnderReview({ value, includeReview }: { value: number; includeReview: boolean }) {
  if (value === 0) return null;
  return (
    <span className="text-xs text-warning" title={`IDR ${idrFull(value)}`}>
      {includeReview ? `under review ${idrSignedCompact(value)}` : `${idrSignedCompact(value)} under review, not counted`}
    </span>
  );
}

function Metric({
  label,
  field,
  props,
  strong,
  extra,
}: {
  label: React.ReactNode;
  field: MoneyKey;
  props: Props;
  strong?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className={`flex items-center gap-2 text-sm ${strong ? "font-medium" : "text-muted"}`}>
        {label}
        {extra}
      </span>
      <span className="flex flex-col items-end leading-tight">
        <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{idrFull(props.headline[field])}</span>
        <UnderReview value={props.underReview[field]} includeReview={props.includeReview} />
      </span>
    </div>
  );
}

function Hero({ label, field, props }: { label: string; field: MoneyKey; props: Props }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums" title={`IDR ${idrFull(props.headline[field])}`}>
        <span className="me-1.5 text-sm font-normal text-muted">IDR</span>
        {idrFull(props.headline[field])}
      </span>
      <UnderReview value={props.underReview[field]} includeReview={props.includeReview} />
    </div>
  );
}

function EstimateChip({ gaps }: { gaps: OwnerBalanceGap[] }) {
  return (
    <Tooltip delay={150}>
      <Tooltip.Trigger>
        <Chip size="sm" variant="soft" color="warning" className="cursor-help">
          Estimate
          <CircleInfo className="size-3" />
        </Chip>
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-xs">
        <p className="mb-1 font-medium">Not in the source data:</p>
        <ul className="list-disc ps-4">
          {gaps.map((g) => (
            <li key={g}>{OWNER_BALANCE_GAP_LABEL[g]}</li>
          ))}
        </ul>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function KpiBlocks(props: Props) {
  const { headline, byStatus, cancellations } = props;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="gap-4">
        <Card.Header className="gap-1">
          <Card.Title>Accruals</Card.Title>
          <Card.Description>By nights of stay in the period</Card.Description>
        </Card.Header>
        <Card.Content className="gap-3">
          <Hero label="Gross bookings" field="gross" props={props} />
          <div className="flex flex-col divide-y divide-separator">
            <Metric label="Refunds" field="refund" props={props} />
            <Metric label="OTA fees" field="otaFee" props={props} />
            <Metric label="Net rental" field="netRental" props={props} strong />
            <Metric label="Management fees" field="managementFee" props={props} />
            <Metric label="Operating expenses" field="operatingExpenses" props={props} />
            <Metric
              label="Owner balance"
              field="ownerBalance"
              props={props}
              strong
              extra={<EstimateChip gaps={props.ownerBalanceGaps} />}
            />
          </div>
        </Card.Content>
        <Card.Footer className="mt-auto text-xs text-muted">
          {count(headline.nights)} nights · expenses paid + pending by expense date ·{" "}
          {cancellations.count > 0
            ? `${count(cancellations.count)} cancellations (${idrCompact(cancellations.gross)}) not in revenue`
            : "no cancellations"}
        </Card.Footer>
      </Card>

      <Card className="gap-4">
        <Card.Header className="gap-1">
          <Card.Title>Cash</Card.Title>
          <Card.Description>By payment date and expense date</Card.Description>
        </Card.Header>
        <Card.Content className="gap-3">
          <Hero label="Cash received" field="received" props={props} />
          <div className="flex flex-col divide-y divide-separator">
            <Metric label="Paid expenses" field="paidExpenses" props={props} />
            <Metric label="Net cash flow" field="netCashFlow" props={props} strong />
          </div>
        </Card.Content>
        <Card.Footer className="mt-auto text-xs text-muted">
          Payments arrive net of the OTA fee · pending expenses are not cash yet
        </Card.Footer>
      </Card>

      <Card className="gap-4">
        <Card.Header className="gap-1">
          <Card.Title>Reconciliation</Card.Title>
          <Card.Description>Reservations checking out in the period, payments of any date</Card.Description>
        </Card.Header>
        <Card.Content className="gap-3">
          <Hero label="Difference (received − expected)" field="difference" props={props} />
          <div className="flex flex-col divide-y divide-separator">
            <Metric label="Expected payout" field="expected" props={props} />
            <Metric label="Received" field="reconciledReceived" props={props} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RECONCILIATION_ORDER.filter((s) => byStatus[s] > 0).map((s) => (
              <Chip key={s} size="sm" variant="soft" color={RECONCILIATION_META[s].color}>
                {RECONCILIATION_META[s].label} {count(byStatus[s])}
              </Chip>
            ))}
          </div>
        </Card.Content>
        <Card.Footer className="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
          <span>Due at check-in: the villa is paid in full before arrival</span>
          <Link href={props.reconciliationHref} className="shrink-0 text-sm">
            Details
            <Link.Icon />
          </Link>
        </Card.Footer>
      </Card>
    </div>
  );
}
