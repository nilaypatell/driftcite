/* ═══════════════════════════════════════════════════════════════════════
   Date presentation.

   Machine-readable dates stay ISO in the source and in `datetime`
   attributes; only what a person reads gets reformatted. Parsed from the
   string parts rather than through `new Date()` on purpose — `new
   Date("2026-08-05")` is parsed as UTC and then printed in the viewer's
   zone, which renders the 4th for anyone west of Greenwich. Splitting the
   string keeps every build and every reader on the same day.
   ═══════════════════════════════════════════════════════════════════════ */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "2026-08-05" → "August 5, 2026". Returns the input unchanged if it
 *  isn't a plain ISO date, so a malformed entry is visible, not silent. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

/** "2026-08-05" → "August 2026", for anything dated to the month. */
export function formatMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return month ? `${month} ${m![1]}` : iso;
}
