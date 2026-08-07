/* ═══════════════════════════════════════════════════════════════════════
   Every number on the page, in one place.

   All of it is read out of the repository, not invented:
     corpus/report.json     the scan of 449 public repositories, July 2026
     providers.yaml         the seven spec-tracked providers
     feed/feed.json         what users receive, 411 artifacts

   If a figure is not in this file it does not belong on the page.
   ═══════════════════════════════════════════════════════════════════════ */

export const CORPUS = {
  attempted: 467,
  scanned: 449,
  failed: 18,
  affected: 176,
  sharePct: 39.2,
  totalFindings: 3388,
  breaking: 2932,
  medianWhenAffected: 7,
  worstRepo: 115,
} as const;

/** One dot per repository scanned; `affected` of them are dead. */
export const PLOT = { total: CORPUS.scanned, hits: CORPUS.affected } as const;

export const BY_POPULARITY = [
  { label: "under 100 ★", pct: 37.7 },
  { label: "100 – 1k ★", pct: 39.8 },
  { label: "1k – 10k ★", pct: 44.1 },
  { label: "over 10k ★", pct: 83.3 },
] as const;

export const STATS = [
  { value: CORPUS.scanned, label: "repositories scanned" },
  { value: CORPUS.breaking, label: "dead call sites found" },
  { value: CORPUS.medianWhenAffected, label: "median, when affected" },
  { value: CORPUS.worstRepo, label: "worst single repository" },
] as const;

/** 411 artifacts across 19 providers, counted from feed/feed.json —
 *  what a user actually receives. Azure's rows are back in the feed now that
 *  the published client reads `require_context`; they were withheld while it
 *  did not, because a reseller's retirement date reported to somebody calling
 *  the vendor directly is a wrong answer with a citation attached.
 *
 *  `watched` means the spec is tracked but nothing has been retired from it
 *  yet. Providers that landed after the July 2026 corpus scan carry no
 *  `findings` figure and stay out of that chart rather than claim a zero the
 *  scan never measured. */
export const PROVIDERS = [
  { name: "OpenAI", artifacts: 117, findings: 123 },
  { name: "Mistral", artifacts: 45 },
  { name: "Azure", artifacts: 41 },
  { name: "Square", artifacts: 41 },
  { name: "Cloudflare", artifacts: 33, findings: 78 },
  { name: "GitHub", artifacts: 26, findings: 1 },
  { name: "Google", artifacts: 23, findings: 213 },
  { name: "Anthropic", artifacts: 21, findings: 383 },
  { name: "Cohere", artifacts: 19 },
  { name: "Bedrock", artifacts: 17 },
  { name: "Datadog", artifacts: 12 },
  { name: "Stripe", artifacts: 8, findings: 32 },
  { name: "DigitalOcean", artifacts: 4 },
  { name: "Groq", artifacts: 2, findings: 87 },
  { name: "Adyen", artifacts: 1 },
  { name: "Plaid", artifacts: 1 },
  { name: "Twilio", watched: "none yet" },
  { name: "Asana", watched: "none yet" },
  { name: "Box", watched: "by commit" },
] as const;

export const TOTAL_ARTIFACTS = 411;
export const TOTAL_PROVIDERS = 19;

export const DEAD_IDENTIFIERS = [
  { prefix: "google/model_id/", id: "gemini-2.0-flash", repos: 81 },
  { prefix: "anthropic/model_id/", id: "claude-sonnet-4-20250514", repos: 65 },
  { prefix: "openai/model_id/", id: "gpt-4-turbo", repos: 57 },
  { prefix: "groq/model_id/", id: "llama-3.3-70b-versatile", repos: 50 },
  { prefix: "anthropic/model_id/", id: "claude-3-5-sonnet-20241022", repos: 44 },
  { prefix: "anthropic/request_param/", id: "budget_tokens", repos: 28 },
] as const;

/** The precision story: an early build's false-positive rate. */
export const PRECISION = { before: 86, after: 5 } as const;

/** Paid tiers aren't sellable yet, so nothing in the chrome points at
 *  /pricing. The page itself still builds and is reachable by URL — flip
 *  this to true to put the nav and footer links back. */
export const SHOW_PRICING: boolean = false;

/** The command, in one place. The hero button copies it, the social card
 *  draws it, and the docs print it — three places that must not disagree.
 *
 *  The -y matters more than it looks: on a cold cache npx asks
 *  "Ok to proceed?" before downloading, but only when a pty is attached.
 *  A human in a terminal answers it; a coding agent running the command
 *  through a pty hangs on it forever, and an agent running without a pty
 *  never sees it — the worst kind of works-when-tested. */
export const COMMAND = "npx -y driftcite ." as const;

export const LINKS = {
  repo: "https://github.com/nilaypatell/driftcite",
  app: "https://github.com/apps/driftcite",
  npm: "https://www.npmjs.com/package/driftcite",
  readme: "https://github.com/nilaypatell/driftcite#readme",
  ci: "https://github.com/nilaypatell/driftcite#in-ci",
  report:
    "https://github.com/nilaypatell/driftcite/blob/main/corpus/report.json",
  providersYaml:
    "https://github.com/nilaypatell/driftcite/blob/main/providers.yaml",
  pr: "https://github.com/nilaypatell/underthesea/pull/1",
  architecture:
    "https://github.com/nilaypatell/driftcite/blob/main/ARCHITECTURE.md",
  contributing:
    "https://github.com/nilaypatell/driftcite/blob/main/CONTRIBUTING.md",
  security:
    "https://github.com/nilaypatell/driftcite/blob/main/SECURITY.md",
  circleci:
    "https://discuss.circleci.com/t/post-mortem-workflows-not-running-and-jobs-failing-01-03-2022/43244",
  openaiDeprecations: "https://developers.openai.com/api/docs/deprecations",
  stripeOpenapi: "https://github.com/stripe/openapi",
} as const;

/** The seven chapter rails, in order. Numbers are derived from this
 *  array at render time so they cannot drift out of sync. */
export const CHAPTERS = [
  { label: "The blind spot", end: "why nothing catches it" },
  { label: "The scan", end: "one command" },
  { label: "The corpus", end: "measured, july 2026" },
  { label: "What it watches", end: "nineteen providers" },
  { label: "Three ways to run it", end: "same engine" },
  { label: "Receipts", end: "pr #1, unattended" },
  { label: "Why it stays quiet", end: "precision first" },
] as const;
