"use client";

// The state every section of /events shares: the model, the selection (a figure, a booking, a payment,
// an exception code or a step of the flow) with what it lights up, and the open record card. A client
// state: selecting asks nothing of the server.
import { createContext, useContext, useMemo, useState } from "react";
import { highlightOf, type Highlight, type Model, type Selection } from "./view-of";

export type OpenRecord = { type: "reservation" | "payment"; id: string };

export interface EventsState {
  model: Model;
  selection: Selection | null;
  highlight: Highlight | null;
  /** The same selection again clears it. */
  select: (s: Selection | null) => void;
  opened: OpenRecord | null;
  open: (r: OpenRecord | null) => void;
  /** Opens the review of a dispute. */
  review: (case_key: string) => void;
}

const Context = createContext<EventsState | null>(null);

export function useEvents(): EventsState {
  const state = useContext(Context);
  if (state === null) throw new Error("useEvents outside EventsProvider");
  return state;
}

/** Whether a booking, payment or row is lit by the selection; with nothing selected, everything is. */
export function useLit() {
  const { highlight } = useEvents();
  return {
    any: highlight !== null,
    reservation: (id: string) => highlight === null || highlight.reservations.has(id),
    payment: (id: string) => highlight === null || highlight.payments.has(id),
    eventRow: (row: number) => highlight === null || highlight.eventRows.has(row),
    paymentRow: (row: number) => highlight === null || highlight.paymentRows.has(row),
    night: (key: string) => highlight === null || highlight.nights.has(key),
  };
}

export function EventsProvider({ model, review, children }: { model: Model; review: (case_key: string) => void; children: React.ReactNode }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [opened, open] = useState<OpenRecord | null>(null);
  const highlight = useMemo(() => (selection === null ? null : highlightOf(model, selection)), [model, selection]);
  const state = useMemo<EventsState>(
    () => ({
      model,
      selection,
      highlight,
      select: (s) => setSelection((prev) => (s === null || JSON.stringify(prev) === JSON.stringify(s) ? null : s)),
      opened,
      open,
      review,
    }),
    [model, selection, highlight, opened, review],
  );
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
