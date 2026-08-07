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

/** Spelled-out small numbers, for prose that names a count the data file
 *  owns. The words drifted from the numbers once — three components said
 *  "eighteen" for a feed that had moved to nineteen — so prose derives
 *  from the same constant the figures use, or it does not name a count. */
const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
] as const;

export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/** Whole days from an ISO date to now. Runs at build on the server and
 *  again after hydration on the client, so the served page carries the
 *  build day's count and a long-lived tab corrects itself. */
export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.floor((now - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000);
}
