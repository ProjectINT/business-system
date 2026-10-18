"use client";

import { Button, Chip, Label, ListBox, Select, Tabs } from "@heroui/react";
import { ArrowRotateRight, FileArrowUp } from "@gravity-ui/icons";
import { usePathname } from "next/navigation";
import { CLUSTERS, PERIODS, PROPERTY_AGGREGATES } from "@/lib/mock/dashboard";

const TABS = [
  { id: "/", label: "Overview" },
  { id: "/raw-data", label: "Raw data" },
];

export function DashboardHeader() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Portfolio overview</h1>
            <Chip size="sm" variant="soft" color="warning">
              Demo data
            </Chip>
          </div>
          <p className="text-sm text-muted">
            20 villas · 4 clusters · data as of Nov 5, 2026 · amounts in IDR
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button isIconOnly variant="tertiary" aria-label="Refresh data">
            <ArrowRotateRight />
          </Button>
          <Button>
            <FileArrowUp />
            Import data
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <Tabs selectedKey={pathname === "/raw-data" ? "/raw-data" : "/"}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Dashboard sections" className="w-fit">
              {/* Route tabs: selected pill is plain CSS, not <Tabs.Indicator />. The animated
                  indicator gets stuck mid-transition on a hard reload in dev (StrictMode). */}
              {TABS.map((tab) => (
                <Tabs.Tab
                  key={tab.id}
                  id={tab.id}
                  href={tab.id}
                  className="px-5 data-[selected=true]:bg-segment data-[selected=true]:shadow-surface"
                >
                  {tab.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        <div className="flex flex-wrap items-end gap-3">
          <Select className="w-52" defaultValue="all">
            <Label className="sr-only">Period</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {PERIODS.map((p) => (
                  <ListBox.Item key={p.id} id={p.id} textValue={p.label}>
                    {p.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select className="w-52" defaultValue="all">
            <Label className="sr-only">Property</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="All villas">
                  All villas
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {CLUSTERS.map((c) => (
                  <ListBox.Item key={c} id={`cluster:${c}`} textValue={`Cluster ${c}`}>
                    Cluster {c}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
                {PROPERTY_AGGREGATES.map((p) => (
                  <ListBox.Item key={p.id} id={p.id} textValue={`${p.id} · ${p.name}`}>
                    {p.id} · {p.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
      </div>
    </div>
  );
}
