"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Renders its children only on one route.
 *
 * The announcement banner sits *above* the nav, and the nav lives in the
 * shared layout — so the banner cannot live in `app/page.tsx`. This gates it
 * from the layout instead. Children are still server-rendered and passed
 * through as a prop, so nothing inside becomes client code.
 */
export default function RouteOnly({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  return usePathname() === path ? <>{children}</> : null;
}
