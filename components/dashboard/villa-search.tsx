"use client";

// The villa search of the table: the text filters villas by id, name or cluster, and the same villas are
// suggested under the field; picking one narrows the table to that villa alone.
import { Magnifier, Xmark } from "@gravity-ui/icons";
import { ComboBox, Description, Input, Label, ListBox, type Key } from "@heroui/react";
import { useMemo } from "react";

export type VillaOption = { propertyId: string; name: string | null; cluster: string | null };

export const villaLabel = (v: VillaOption) => v.name ?? v.propertyId;

export function matchesVilla(v: VillaOption, query: string) {
  const q = query.trim().toLowerCase();
  return !q || `${v.propertyId} ${v.name ?? ""} ${v.cluster ?? ""}`.toLowerCase().includes(q);
}

export function VillaSearch({
  villas,
  query,
  picked,
  onQueryChange,
  onPick,
}: {
  villas: VillaOption[];
  query: string;
  picked: string | null;
  onQueryChange: (query: string) => void;
  onPick: (propertyId: string | null) => void;
}) {
  const suggestions = useMemo(
    () => villas.filter((v) => matchesVilla(v, query)).sort((a, b) => villaLabel(a).localeCompare(villaLabel(b))),
    [villas, query],
  );
  const pickedVilla = villas.find((v) => v.propertyId === picked);

  return (
    <ComboBox<VillaOption>
      aria-label="Search villas"
      className="w-72"
      allowsCustomValue
      items={suggestions}
      inputValue={query}
      value={picked}
      onInputChange={(text) => {
        onQueryChange(text);
        // Typing over a picked villa goes back to searching by text.
        if (pickedVilla && text !== villaLabel(pickedVilla)) onPick(null);
      }}
      onChange={(key: Key | null) => {
        const villa = villas.find((v) => v.propertyId === key);
        onPick(villa?.propertyId ?? null);
        // With both the text and the value controlled, React Aria leaves the text of a pick to us.
        if (villa) onQueryChange(villaLabel(villa));
      }}
    >
      <ComboBox.InputGroup>
        <Magnifier className="pointer-events-none absolute start-3 z-10 size-4 text-field-placeholder" />
        {query !== "" && (
          // A plain button: a React Aria button inside the combo box would take the props of its trigger.
          <button
            type="button"
            aria-label="Clear search"
            className="absolute end-8 z-10 flex size-5 items-center justify-center rounded-full text-field-placeholder hover:text-field-foreground"
            onClick={() => {
              onQueryChange("");
              onPick(null);
            }}
          >
            <Xmark className="size-3.5" />
          </button>
        )}
        <Input placeholder="Search villa or cluster…" className={query !== "" ? "ps-9 pe-14" : "ps-9"} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox renderEmptyState={() => <div className="px-2 py-1.5 text-sm text-muted">No villas match</div>}>
          {(v: VillaOption) => (
            <ListBox.Item id={v.propertyId} textValue={villaLabel(v)}>
              <div className="flex flex-col">
                <Label>{villaLabel(v)}</Label>
                <Description>{[v.name != null ? v.propertyId : null, v.cluster].filter(Boolean).join(" · ")}</Description>
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          )}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
