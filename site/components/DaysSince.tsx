"use client";

import { useEffect, useState } from "react";
import { daysSince } from "@/lib/format";

/**
 * A day count that stays true. The server renders the build day's number,
 * so the static page is correct the day it ships; after hydration the
 * count recomputes against the visitor's clock, so a page built weeks ago
 * does not greet anyone with a stale count. The tool's whole pitch is that
 * severity is computed against today — its own hero gets the same rule.
 *
 * Initial state is the server's value, so the first client render matches
 * the served HTML and hydration has nothing to complain about; the
 * correction lands in an effect, after.
 */
export default function DaysSince({
  since,
  initial,
}: {
  since: string;
  initial: number;
}) {
  const [days, setDays] = useState(initial);
  useEffect(() => setDays(daysSince(since)), [since]);
  return <>{days}</>;
}
