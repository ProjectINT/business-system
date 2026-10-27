import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@heroui/react";
import { caseOf, CASES } from "@/components/events/cases";
import { EventsView } from "@/components/events/events-view";
import { toView } from "@/lib/calc";
import { formatReport, type ReportView } from "@/lib/nightly";
import { parseDecisions } from "@/lib/nightly/decisions";
import { explainCase } from "@/lib/nightly/explain";

export const metadata: Metadata = {
  title: "Events visualization — Villa Portfolio",
};

// The final test seen by a person (docs/EVENTS_VISUALIZATION_PLAN.md): the built-in JSON through the same
// lib/nightly functions as the CLI, on the server. No CSV, no data-quality run, no today: only the case
// and the decisions in the address decide the page. It renders per request, since it reads searchParams.
export default function EventsPage({ searchParams }: PageProps<"/events">) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <Suspense fallback={<Skeleton className="h-[600px] rounded-2xl" />}>
        <Events searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Events({ searchParams }: Pick<PageProps<"/events">, "searchParams">) {
  const query = await searchParams;
  const c = caseOf(query.case);
  const { decisions, warning } = parseDecisions(typeof query.d === "string" ? query.d : undefined);
  const model = toView(explainCase(c.input, decisions));
  const check =
    c.expected === null
      ? null
      : { file: c.expected.file, same: formatReport(model.report) === formatReport(c.expected.report as ReportView) };

  return (
    <EventsView
      key={c.id}
      model={model}
      cases={CASES.map(({ id, label }) => ({ id, label }))}
      caseId={c.id}
      file={c.file}
      check={check}
      decisions={decisions}
      warning={warning}
    />
  );
}
