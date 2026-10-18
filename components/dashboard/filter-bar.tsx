"use client";

// Filters live in the URL (PLAN.md 8): the bar only builds the next URL and navigates; the server
// reads it, computes and renders. Local state shows a choice at once while the page recomputes.
import { Button, DateField, DateRangePicker, Label, ListBox, RangeCalendar, Select, Spinner, Switch, type Key } from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchOf, type FilterOptions, type FilterState } from "@/lib/data/query";

const ALL_CLUSTERS = "__all__";

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function presetLabel(preset: FilterOptions["presets"][number]): string {
  if (preset.id === "all") return "Whole period";
  const [y, m] = preset.id.split("-").map(Number) as [number, number];
  return monthLabel.format(new Date(Date.UTC(y, m - 1, 1)));
}

/** State that follows the URL but changes at once on input (React: adjusting state when a prop changes). */
function useFollowing(state: FilterState): [FilterState, (next: FilterState) => void] {
  const [shown, setShown] = useState(state);
  const [prev, setPrev] = useState(state);
  if (prev !== state) {
    setPrev(state);
    setShown(state);
  }
  return [shown, setShown];
}

export function FilterBar({ state, options }: { state: FilterState; options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [shown, setShown] = useFollowing(state);

  const apply = (next: FilterState) => {
    setShown(next);
    startTransition(() => router.push(`${pathname}${searchOf(next, options.range)}`, { scroll: false }));
  };

  const period: { start: CalendarDate; end: CalendarDate } = { start: parseDate(shown.from), end: parseDate(shown.to) };
  const isDefault = searchOf(shown, options.range) === "";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-separator p-3 sm:p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Period</span>
          <div className="flex flex-wrap items-center gap-1">
            {options.presets.map((p) => {
              const active = shown.from === p.from && shown.to === p.to;
              return (
                <Button
                  key={p.id}
                  size="sm"
                  variant={active ? "secondary" : "ghost"}
                  aria-pressed={active}
                  onPress={() => apply({ ...shown, from: p.from, to: p.to })}
                >
                  {presetLabel(p)}
                </Button>
              );
            })}
          </div>
        </div>

        <DateRangePicker
          className="w-72"
          value={period}
          onChange={(v) => v && apply({ ...shown, from: v.start.toString(), to: v.end.toString() })}
        >
          <Label className="text-xs text-muted">Custom range</Label>
          <DateField.Group fullWidth>
            <DateField.Input slot="start">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
            <DateRangePicker.RangeSeparator />
            <DateField.Input slot="end">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
            <DateField.Suffix>
              <DateRangePicker.Trigger>
                <DateRangePicker.TriggerIndicator />
              </DateRangePicker.Trigger>
            </DateField.Suffix>
          </DateField.Group>
          <DateRangePicker.Popover>
            <RangeCalendar aria-label="Period">
              <RangeCalendar.Header>
                <RangeCalendar.YearPickerTrigger>
                  <RangeCalendar.YearPickerTriggerHeading />
                  <RangeCalendar.YearPickerTriggerIndicator />
                </RangeCalendar.YearPickerTrigger>
                <RangeCalendar.NavButton slot="previous" />
                <RangeCalendar.NavButton slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid>
                <RangeCalendar.GridHeader>
                  {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                </RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
              </RangeCalendar.Grid>
              <RangeCalendar.YearPickerGrid>
                <RangeCalendar.YearPickerGridBody>
                  {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
                </RangeCalendar.YearPickerGridBody>
              </RangeCalendar.YearPickerGrid>
            </RangeCalendar>
          </DateRangePicker.Popover>
        </DateRangePicker>

        <Select
          className="w-56"
          placeholder="All villas"
          selectionMode="multiple"
          value={[...shown.propertyIds]}
          onChange={(keys) => apply({ ...shown, propertyIds: (keys as Key[]).map(String).sort() })}
        >
          <Label className="text-xs text-muted">Villas</Label>
          <Select.Trigger>
            <Select.Value className="truncate">
              {({ isPlaceholder, selectedText }) => (isPlaceholder ? "All villas" : selectedText)}
            </Select.Value>
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox selectionMode="multiple">
              {options.properties.map((p) => (
                <ListBox.Item key={p.id} id={p.id} textValue={p.id}>
                  {p.id}
                  <span className="truncate text-xs text-muted">{[p.name, p.cluster].filter(Boolean).join(" · ")}</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          className="w-40"
          value={shown.cluster ?? ALL_CLUSTERS}
          onChange={(key) => apply({ ...shown, cluster: key === ALL_CLUSTERS || key === null ? null : String(key) })}
        >
          <Label className="text-xs text-muted">Cluster</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id={ALL_CLUSTERS} textValue="All clusters">
                All clusters
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {options.clusters.map((c) => (
                <ListBox.Item key={c} id={c} textValue={c}>
                  {c}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Switch
          className="pb-2"
          isSelected={shown.includeReview}
          onChange={(includeReview) => apply({ ...shown, includeReview })}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Include records under review
          </Switch.Content>
        </Switch>

        <div className="ms-auto flex items-center gap-2 pb-1">
          {isPending && <Spinner size="sm" aria-label="Updating" />}
          {!isDefault && (
            <Button
              size="sm"
              variant="tertiary"
              onPress={() =>
                apply({ ...options.range, propertyIds: [], cluster: null, includeReview: true })
              }
            >
              Reset filters
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
