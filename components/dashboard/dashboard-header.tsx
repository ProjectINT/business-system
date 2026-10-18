"use client";

import { Tabs } from "@heroui/react";
import { usePathname } from "next/navigation";

const TABS = [
  { id: "/", label: "Overview" },
  { id: "/raw-data", label: "Raw data" },
];

export interface SourceSummary {
  properties: number;
  clusters: number;
  asOf: string;
  asOfDefaulted: boolean;
  range: { from: string; to: string };
}

export function DashboardHeader({ summary }: { summary: SourceSummary }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio overview</h1>
        <p className="text-sm text-muted">
          {summary.properties} villas · {summary.clusters} clusters · data {summary.range.from} … {summary.range.to} ·
          as of {summary.asOf}
          {summary.asOfDefaulted ? " (latest updated_at)" : ""} · amounts in IDR
        </p>
      </div>

      <Tabs className="w-fit" selectedKey={pathname === "/raw-data" ? "/raw-data" : "/"}>
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
    </div>
  );
}
