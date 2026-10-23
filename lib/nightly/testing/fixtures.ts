// Raw (JSON-shaped) case records for tests: the villas and rules of the public case, events and
// payments on demand. Values are untyped so a test can put a wrong type where it wants an error.
export type Raw = Record<string, unknown>;

/** E_R101_V2 of the public case. */
export function rawEvent(overrides: Raw = {}): Raw {
  return {
    source_event_id: "E_R101_V2",
    reservation_id: "R101",
    property_id: "V01",
    updated_at: "2026-11-20T08:00:00Z",
    status: "modified",
    check_in: "2026-11-29",
    check_out: "2026-12-03",
    accommodation_gross_idr: 4400000,
    pbjt_idr: 440000,
    ota_fee_idr: 660000,
    currency: "IDR",
    ...overrides,
  };
}

/** P101 of the public case. */
export function rawPayment(overrides: Raw = {}): Raw {
  return {
    payment_id: "P101",
    reservation_id: "R101",
    payment_date: "2026-12-07",
    amount_idr: 4180000,
    status: "received",
    ...overrides,
  };
}

/** The public case without events and payments. */
export function rawCase(overrides: Raw = {}): Raw {
  return {
    case_id: "TEST",
    report_months: ["2026-11", "2026-12"],
    properties: [
      { property_id: "V01", base_currency: "IDR" },
      { property_id: "V02", base_currency: "IDR" },
    ],
    commission_rules: [
      { property_id: "V01", effective_from: "2026-11-01", effective_to: "2026-11-30", rate_bps: 1700 },
      { property_id: "V01", effective_from: "2026-12-01", effective_to: "2026-12-31", rate_bps: 2000 },
      { property_id: "V02", effective_from: "2026-11-01", effective_to: "2026-12-31", rate_bps: 1000 },
    ],
    reservation_events: [],
    payments: [],
    ...overrides,
  };
}

/** A row of the six figures of the report (monthly, total, a villa's month), in the order of the plan's table (section 5). */
export function figures(
  accommodation_gross_idr: number,
  pbjt_liability_idr: number,
  ota_fee_idr: number,
  management_fee_idr: number,
  owner_estimate_idr: number,
  cash_received_idr: number,
) {
  return { accommodation_gross_idr, pbjt_liability_idr, ota_fee_idr, management_fee_idr, owner_estimate_idr, cash_received_idr };
}

export const ZERO_FIGURES = figures(0, 0, 0, 0, 0, 0);
