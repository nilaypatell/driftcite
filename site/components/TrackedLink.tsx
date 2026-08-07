"use client";

import { track } from "@vercel/analytics";
import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * An anchor that counts its clicks. Exists so the two hero funnels can be
 * compared — copies of the agent prompt against clicks toward the App —
 * instead of guessed about. The navigation itself is untouched: track()
 * fires a beacon and the browser follows the href as it always did.
 */
export default function TrackedLink({
  event,
  children,
  ...rest
}: { event: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} onClick={() => track(event)}>
      {children}
    </a>
  );
}
