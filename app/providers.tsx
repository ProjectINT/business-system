"use client";

import { RouterProvider } from "@heroui/react";
import { useRouter } from "next/navigation";

// Lets HeroUI links (React Aria) navigate through the Next.js router.
export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return <RouterProvider navigate={router.push}>{children}</RouterProvider>;
}
