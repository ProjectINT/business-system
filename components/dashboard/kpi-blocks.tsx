"use client";

// The three blocks of PLAN.md 7.4, each labelled with its basis so that revenue and cash are not
// mixed: accruals by nights of stay, cash by payment date, reconciliation by check-out. A switch on
// each block shows, next to every total, the part of it that records under review bring (with them −
// without them). Held and unallocated money stand next to cash received, outside its sum.
import { createContext, useContext, useState } from "react";
import { Card, Chip, Link, Switch, Tooltip } from "@heroui/react";
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
  apart: { held: number; heldCount: number; unallocated: number; unallocatedCount: number };
}

/** Whether the block around shows the under-review part of its totals. */
const ReviewShown = createContext(false);

function UnderReview({ value, includeReview }: { value: number; includeReview: boolean }) {
  const shown = useContext(ReviewShown);
  if (!shown || value === 0) return null;
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
  nested,
  extra,
}: {
  label: React.ReactNode;
  field: MoneyKey;
  props: Props;
  strong?: boolean;
  /** A part of the row above: smaller and muted, so the parts do not read as more totals. */
  nested?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${nested ? "py-1" : "py-1.5"}`}>
      <span
        className={`flex items-center gap-2 ${nested ? "text-xs" : "text-sm"} ${strong ? "font-medium" : "text-muted"}`}
      >
        {label}
        {extra}
      </span>
      <span className="flex flex-col items-end leading-tight">
        <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${nested ? "text-sm text-muted" : ""}`}>
          {idrFull(props.headline[field])}
        </span>
        <UnderReview value={props.underReview[field]} includeReview={props.includeReview} />
      </span>
    </div>
  );
}

/** OTA fees split by the booking's channel; the parts add up to the row above. On Direct it is the marketing fee; without a channel (the event feed), its own line. */
function OtaFees({ props }: { props: Props }) {
  return (
    <div className="pb-1.5">
      <Metric label="OTA fees" field="otaFee" props={props} />
      <div className="ms-1 flex flex-col border-s border-separator ps-3">
        <Metric label="OTA bookings" field="otaFeeOta" props={props} nested />
        <Metric
          label="Direct bookings: marketing"
          field="otaFeeDirect"
          props={props}
          nested
          extra={
            <Tooltip delay={150}>
              <Tooltip.Trigger aria-label="About the fee on direct bookings">
                <CircleInfo className="size-3 cursor-help" />
              </Tooltip.Trigger>
              <Tooltip.Content className="max-w-xs">
                On a direct booking the “OTA fee” of the source tops up the advertising budget of our own sales
                channel. It is deducted from the owner balance like an OTA fee, and the payment arrives net of it.
              </Tooltip.Content>
            </Tooltip>
          }
        />
        {(props.headline.otaFeeUnknown !== 0 || props.underReview.otaFeeUnknown !== 0) && (
          <Metric label="Channel unknown" field="otaFeeUnknown" props={props} nested />
        )}
      </div>
    </div>
  );
}

/** Money we know of that is not the villas': next to cash received, not in it. */
function ApartMetric({ label, amount, payments, hint }: { label: string; amount: number; payments: number; hint: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2 text-sm text-muted">
        {label}
        <Tooltip delay={150}>
          <Tooltip.Trigger aria-label={`About ${label.toLowerCase()}`}>
            <CircleInfo className="size-3 cursor-help" />
          </Tooltip.Trigger>
          <Tooltip.Content className="max-w-xs">{hint}</Tooltip.Content>
        </Tooltip>
      </span>
      <span className="flex flex-col items-end leading-tight">
        <span className="tabular-nums">{idrFull(amount)}</span>
        <span className="text-xs text-muted">
          {count(payments)} {payments === 1 ? "payment" : "payments"} · not in cash received
        </span>
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

/** A card whose header switches the under-review part of its totals on and off; off by default. */
function Block({
  title,
  description,
  fields,
  props,
  footer,
  children,
}: {
  title: string;
  description: string;
  /** The totals of the block: the switch is there only when records under review move one of them. */
  fields: MoneyKey[];
  props: Props;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const hasReview = fields.some((f) => props.underReview[f] !== 0);
  return (
    <Card className="gap-4">
      <Card.Header className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Card.Title>{title}</Card.Title>
          <Card.Description>{description}</Card.Description>
        </div>
        {hasReview && (
          <Switch size="sm" className="shrink-0" isSelected={shown} onChange={setShown}>
            <Switch.Content className="text-xs text-muted">
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              Under review
            </Switch.Content>
          </Switch>
        )}
      </Card.Header>
      <ReviewShown value={shown}>
        <Card.Content className="gap-3">{children}</Card.Content>
      </ReviewShown>
      {footer}
    </Card>
  );
}

export function KpiBlocks(props: Props) {
  const { headline, byStatus, cancellations } = props;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Block
        title="Accruals"
        description="By nights of stay in the period"
        fields={[
          "gross",
          "refund",
          "otaFee",
          "otaFeeOta",
          "otaFeeDirect",
          "otaFeeUnknown",
          "pbjt",
          "netRental",
          "managementFee",
          "ownerEstimate",
          "operatingExpenses",
          "ownerBalance",
        ]}
        props={props}
        footer={
          <Card.Footer className="mt-auto text-xs text-muted">
            {count(headline.nights)} nights · expenses paid + pending by expense date ·{" "}
            {cancellations.count > 0
              ? `${count(cancellations.count)} cancellations (${idrCompact(cancellations.gross)}) not in revenue`
              : "no cancellations"}
          </Card.Footer>
        }
      >
        <Hero label="Gross bookings" field="gross" props={props} />
        <div className="flex flex-col divide-y divide-separator">
          <Metric
            label="PBJT payable"
            field="pbjt"
            props={props}
            extra={
              <Tooltip delay={150}>
                <Tooltip.Trigger aria-label="About PBJT">
                  <CircleInfo className="size-3 cursor-help" />
                </Tooltip.Trigger>
                <Tooltip.Content className="max-w-xs">
                  The local tax on the stay, collected with it and owed to the state: not revenue, not in the management fee or
                  the owner estimate. The CSV files carry none.
                </Tooltip.Content>
              </Tooltip>
            }
          />
          <Metric label="Refunds" field="refund" props={props} />
          <OtaFees props={props} />
          <Metric label="Net rental" field="netRental" props={props} strong />
          <Metric label="Management fees" field="managementFee" props={props} />
          <Metric
            label="Owner estimate"
            field="ownerEstimate"
            props={props}
            strong
            extra={<EstimateChip gaps={props.ownerBalanceGaps} />}
          />
          <Metric label="Operating expenses" field="operatingExpenses" props={props} />
          <Metric
            label="Owner balance"
            field="ownerBalance"
            props={props}
            strong
            extra={<EstimateChip gaps={props.ownerBalanceGaps} />}
          />
        </div>
      </Block>

      <Block
        title="Cash"
        description="By payment date and expense date"
        fields={["received", "paidExpenses", "netCashFlow"]}
        props={props}
        footer={
          <Card.Footer className="mt-auto text-xs text-muted">
            Payments arrive net of the OTA fee · pending expenses are not cash yet
          </Card.Footer>
        }
      >
        <Hero label="Cash received" field="received" props={props} />
        <div className="flex flex-col divide-y divide-separator">
          <Metric label="Paid expenses" field="paidExpenses" props={props} />
          <Metric label="Net cash flow" field="netCashFlow" props={props} strong />
          <ApartMetric
            label="Held"
            amount={props.apart.held}
            payments={props.apart.heldCount}
            hint="Pending payments, which are not money yet, and payments for reservations the checks keep out of the figures: real money, not the villa's until the reservation is in."
          />
          <ApartMetric
            label="Unallocated"
            amount={props.apart.unallocated}
            payments={props.apart.unallocatedCount}
            hint="Payments for a reservation that is not in the data: kept, never counted as the villa's revenue."
          />
        </div>
      </Block>

      <Block
        title="Reconciliation"
        description="Reservations checking out in the period, payments of any date"
        fields={["difference", "expected", "reconciledReceived"]}
        props={props}
        footer={
          <Card.Footer className="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
            <span>Due at check-in: the villa is paid in full before arrival</span>
            <Link href={props.reconciliationHref} className="shrink-0 text-sm">
              Details
              <Link.Icon />
            </Link>
          </Card.Footer>
        }
      >
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
      </Block>
    </div>
  );
}
