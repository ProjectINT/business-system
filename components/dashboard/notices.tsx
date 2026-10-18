"use client";

import { Alert } from "@heroui/react";

export interface Notice {
  status: "warning" | "danger" | "accent";
  title: string;
  description?: string;
}

/** Banners above the figures: ignored URL filters, failed checks, records the calculator refused. */
export function Notices({ items }: { items: Notice[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {items.map((n) => (
        <Alert key={n.title} status={n.status}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{n.title}</Alert.Title>
            {n.description && <Alert.Description>{n.description}</Alert.Description>}
          </Alert.Content>
        </Alert>
      ))}
    </div>
  );
}
