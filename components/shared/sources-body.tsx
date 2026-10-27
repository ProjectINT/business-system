// The body of a "what is this figure made of" tooltip: the records behind a figure, one line each,
// "N more records" past the limit, the total and a note. Used by the dashboard's villa table
// (figure-sources.tsx) and the figures of /events.
import { count } from "@/lib/format";

export interface Line {
  readonly key: string;
  /** A record id, or a term of the owner balance. */
  readonly label: string;
  readonly detail?: string;
  readonly value: number;
}

export interface Parts {
  readonly lines: Line[];
  /** Records left out of the lines because they bring nothing to the figure. */
  readonly note?: string;
}

/** Longer lists end with one line for the rest. */
const MAX_LINES = 10;

function plural(n: number, word: string): string {
  return `${count(n)} ${word}${n === 1 ? "" : "s"}`;
}

export function SourcesBody({
  title,
  villa,
  hint,
  parts,
  total,
  format,
  underReview = false,
}: {
  title: string;
  villa: string;
  hint: string;
  parts: Parts;
  total: number;
  format: (v: number) => string;
  /** The dashboard's part under review: what the records would add, not in the figure. */
  underReview?: boolean;
}) {
  const shown = parts.lines.length > MAX_LINES ? parts.lines.slice(0, MAX_LINES - 1) : parts.lines;
  const rest = parts.lines.slice(shown.length);
  return (
    <div className="flex flex-col gap-2 p-1">
      <div className="flex flex-col">
        <span className="text-sm">
          <span className={`font-medium ${underReview ? "text-warning" : ""}`}>
            {underReview ? `${title}: records under review` : title}
          </span>
          <span className="text-muted"> · {villa}</span>
        </span>
        <span className="text-muted">{underReview ? "Not in the figure: what they would add to it" : hint}</span>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1">
        {shown.map((l) => (
          <div key={l.key} className="contents">
            <span className="font-medium whitespace-nowrap">{l.label}</span>
            <span className="text-muted">{l.detail}</span>
            <span className="text-end tabular-nums whitespace-nowrap">{format(l.value)}</span>
          </div>
        ))}
        {rest.length > 0 && (
          <>
            <span className="col-span-2 text-muted">{plural(rest.length, "more record")}</span>
            <span className="text-end tabular-nums whitespace-nowrap">{format(rest.reduce((n, l) => n + l.value, 0))}</span>
          </>
        )}
        <div className="col-span-3 border-t border-separator" />
        <span className="col-span-2 font-medium">{underReview ? "Under review" : "Total"}</span>
        <span className="text-end font-semibold tabular-nums whitespace-nowrap">{format(total)}</span>
      </div>
      {parts.note && <span className="text-muted">{parts.note}</span>}
    </div>
  );
}

