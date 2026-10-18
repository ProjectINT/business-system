"use client";

import { Tabs } from "@heroui/react";
import { usePathname } from "next/navigation";

export interface RouteTab {
  href: string;
  label: string;
}

/** The tab whose href is the longest prefix of the path; the section root matches only itself. */
function selectedOf(tabs: readonly RouteTab[], pathname: string) {
  const hits = tabs.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? tabs[0]?.href;
}

export function RouteTabs({ tabs, label }: { tabs: readonly RouteTab[]; label: string }) {
  const pathname = usePathname();

  return (
    <Tabs className="w-fit max-w-full" selectedKey={selectedOf(tabs, pathname)}>
      <Tabs.ListContainer>
        <Tabs.List aria-label={label} className="w-fit">
          {/* Route tabs: selected pill is plain CSS, not <Tabs.Indicator />. The animated
              indicator gets stuck mid-transition on a hard reload in dev (StrictMode). */}
          {tabs.map((tab) => (
            <Tabs.Tab
              key={tab.href}
              id={tab.href}
              href={tab.href}
              className="whitespace-nowrap px-5 data-[selected=true]:bg-segment data-[selected=true]:shadow-surface"
            >
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
