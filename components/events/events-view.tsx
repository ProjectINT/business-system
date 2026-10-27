"use client";

// The /events page (docs/EVENTS_VISUALIZATION_PLAN.md, 3): the header with the case and the check
// against the CLI's output, then the flow of the records, the figures, the calendar of nights, the feed
// of events, the exceptions and the review. One selection lights up the related records in every section.
// Decisions live in the address (`d`): picking one replaces it, the server computes the page again.
import { Alert, Button, Chip, Tabs } from "@heroui/react";
import { CircleCheck, CircleXmark, Xmark } from "@gravity-ui/icons";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { Decision } from "@/lib/nightly/decisions";
import { encodeDecisions } from "@/lib/nightly/decision-param";
import { EventFeed } from "./event-feed";
import { ExceptionCatalogue } from "./exception-catalogue";
import { FiguresTable } from "./figures-table";
import { FlowStrip } from "./flow-strip";
import { EventRecordDrawer } from "./record-drawer";
import { ReviewPanel } from "./review-panel";
import { EventsProvider, useEvents } from "./selection";
import { StayCalendar } from "./stay-calendar";
import { monthText, type Model } from "./view-of";

interface Props {
  model: Model;
  cases: { id: string; label: string }[];
  caseId: string;
  file: string;
  /** The CLI's output on this file, when the repository has it. */
  check: { file: string; same: boolean } | null;
  decisions: Decision[];
  warning: string | null;
}

export function EventsView({ model, cases, caseId, file, check, decisions, warning }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [reviewing, setReviewing] = useState<string | null>(null);

  const go = useCallback(
    (id: string, next: readonly Decision[]) => {
      const q = new URLSearchParams({ case: id });
      if (next.length > 0) q.set("d", encodeDecisions(next));
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [router, pathname],
  );
  const review = useCallback((case_key: string) => {
    setReviewing(case_key);
    document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <EventsProvider model={model} review={review}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">Events visualization</h1>
              <p className="text-sm text-muted">
                {model.case_id} · report months {model.report_months.map(monthText).join(", ")} · <span className="font-mono text-xs">{file}</span>
              </p>
            </div>
            <Tabs variant="secondary" selectedKey={caseId} onSelectionChange={(k) => go(String(k), [])}>
              <Tabs.ListContainer>
                <Tabs.List aria-label="Built-in cases" className="w-fit">
                  {cases.map((c) => (
                    <Tabs.Tab key={c.id} id={c.id} className="whitespace-nowrap">
                      {c.label}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          </div>
          <CheckLine check={check} applied={model.applied.length} />
          {warning !== null && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{warning}</Alert.Title>
              </Alert.Content>
            </Alert>
          )}
        </header>

        <SelectionBar />
        <FlowStrip />
        <FiguresTable />
        <StayCalendar />
        <EventFeed />
        <ExceptionCatalogue />
        <ReviewPanel
          decisions={decisions}
          focus={reviewing}
          onDecide={(d) => go(caseId, [...decisions, d])}
          onUndo={(i) => go(caseId, decisions.filter((_, j) => j !== i))}
          otherCase={cases.find((c) => c.id !== caseId) ?? null}
          onOtherCase={(id) => go(id, [])}
        />
        <EventRecordDrawer />
      </div>
    </EventsProvider>
  );
}

function CheckLine({ check, applied }: { check: Props["check"]; applied: number }) {
  if (applied > 0) {
    return (
      <Chip variant="soft" color="accent" className="w-fit">
        With {applied} decision{applied === 1 ? "" : "s"}: the figures differ from the CLI output, which has no decisions
      </Chip>
    );
  }
  if (check === null) return <span className="text-sm text-muted">As the CLI computes this file: no decisions applied</span>;
  return (
    <Chip variant="soft" color={check.same ? "success" : "danger"} className="w-fit gap-1.5">
      {check.same ? <CircleCheck className="size-3.5" /> : <CircleXmark className="size-3.5" />}
      {check.same ? "Same as" : "Differs from"} <span className="font-mono text-xs">{check.file}</span>
    </Chip>
  );
}

/** What is selected, above the sections; pressing Clear lights everything again. */
function SelectionBar() {
  const { highlight, select } = useEvents();
  if (highlight === null) {
    return <p className="text-sm text-muted">Click a figure, a night, an event or an exception to light up the records behind it.</p>;
  }
  return (
    <div className="sticky top-0 z-20 -mx-1 flex items-center gap-3 rounded-xl border border-separator bg-background/95 px-3 py-2 backdrop-blur">
      <span className="text-sm">
        <span className="text-muted">Selected:</span> <span className="font-medium">{highlight.label}</span>
        <span className="text-muted">
          {" "}
          · {highlight.reservations.size} booking{highlight.reservations.size === 1 ? "" : "s"}, {highlight.payments.size} payment
          {highlight.payments.size === 1 ? "" : "s"}
        </span>
      </span>
      <Button size="sm" variant="tertiary" className="ms-auto" onPress={() => select(null)}>
        <Xmark className="size-3.5" />
        Clear
      </Button>
    </div>
  );
}
