"use client";

import { Avatar, Chip, Separator } from "@heroui/react";
import { ClockArrowRotateLeft, House, ScalesUnbalanced, ShieldCheck } from "@gravity-ui/icons";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Path prefixes that keep the item active. */
  match: string[];
  soon?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: House, match: ["/raw-data"] },
  { href: "/imports", label: "Import logs", icon: ClockArrowRotateLeft, match: ["/imports"] },
  { href: "/reconciliation", label: "Reconciliation", icon: ScalesUnbalanced, match: ["/reconciliation"] },
  { href: "/data-quality", label: "Data quality", icon: ShieldCheck, match: ["/data-quality"] },
];

function isActive(item: NavItem, pathname: string) {
  return pathname === item.href || item.match.some((p) => pathname.startsWith(p));
}

/** Compact top navigation for screens without the sidebar. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex gap-1 border-b border-separator px-4 py-2 lg:hidden">
      {NAV.filter((item) => !item.soon).map((item) => (
        <NextLink
          key={item.href}
          href={item.href}
          aria-current={isActive(item, pathname) ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            isActive(item, pathname) ? "bg-surface-secondary font-medium" : "text-muted"
          }`}
        >
          {item.label}
        </NextLink>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-e border-separator px-4 py-6 lg:flex">
      <div className="flex items-center gap-3 px-2">
        <Avatar color="accent" variant="soft">
          <Avatar.Fallback>VP</Avatar.Fallback>
        </Avatar>
        <div className="flex flex-col leading-tight">
          <span className="font-semibold">Villa Portfolio</span>
          <span className="text-sm text-muted">Finance &amp; Ops</span>
        </div>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map((item) => {
          const { href, label, icon: Icon, soon } = item;
          const active = isActive(item, pathname);

          if (soon) {
            return (
              <span
                key={href}
                aria-disabled="true"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted/60"
              >
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                <Chip size="sm" variant="soft">
                  Soon
                </Chip>
              </span>
            );
          }

          return (
            <NextLink
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                active
                  ? "bg-surface-secondary font-medium text-foreground"
                  : "text-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </NextLink>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-4">
        <Separator />
        <div className="flex items-center gap-3 px-2">
          <Avatar size="sm">
            <Avatar.Fallback>FN</Avatar.Fallback>
          </Avatar>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">Finance team</span>
            <span className="text-xs text-muted">role: finance</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
