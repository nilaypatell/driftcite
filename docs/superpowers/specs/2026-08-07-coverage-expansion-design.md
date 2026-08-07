# Coverage expansion and user-supplied providers

Date: 2026-08-07. Status: approved (direction delegated: yield-first, both
phases, local-plus-upstream custom providers).

## What this is

Two things, in order:

1. **Expand coverage where coverage has measured yield.** Across 467 real
   repositories, model IDs produced 740 repo-hits and the entire spec-diff
   endpoint pipeline produced 1. So the expansion is curated manifests first —
   the kinds of artifacts that fire — and cheap spec-repo rows second, for
   breadth. Four curated categories, all verified against the provider's own
   pages before an artifact is written:
   - **AI model providers**: xAI, Perplexity, Together, Fireworks, DeepSeek,
     ElevenLabs, AssemblyAI, Stability, Replicate (those with real deprecation
     pages; ones without are recorded as checked-and-clean, not invented).
   - **Version-windowed APIs**: Shopify API versions, Meta Graph API versions,
     Salesforce REST versions, Google Ads API versions. Whole versions die on a
     schedule; the literal is the version-bearing URL fragment, which is
     distinctive by construction.
   - **SDK major-version breaks**: openai-python v0 symbols, google-generativeai
     (PyPI), aws-sdk v2 (npm), firebase compat imports. Renames that no
     lockfile tool sees; the best-performing artifact in the feed is one.
   - **Runtime retirements**: AWS Lambda runtime IDs, Google Cloud Functions
     runtime IDs, Vercel Node versions, Heroku stacks. Strings that live in
     serverless.yml / vercel.json / terraform, with hard break dates.

2. **Let anyone add an API driftcite does not track.** A JSON file in their own
   repo, read by the CLI at scan time — private and internal APIs included —
   plus a documented path to upstream public ones.

## Custom providers: `.driftcite-local.json`

- One file at the scan root, named to match `.driftcite-baseline.json`.
- Shape: `{ "local_version": 1, "artifacts": [ ...feed-shaped artifacts... ] }`.
  Same fields the feed uses: `id`, `provider`, `kind`, `match.literals`,
  `status`, `severity`, `retires_on`, `replacement`, `note`, `evidence`,
  `file_markers`. No new vocabulary.
- **Validated on load with the same rules the feed self-test enforces.** An
  artifact with no evidence URL, no literals, or an unknown status is skipped
  and named in the output — never silently dropped, never silently accepted.
  Kinds that require context (`endpoint`, `request_param`, `sdk_symbol`,
  `enum_value`, `tool_type`) must carry `file_markers`; `model_id` may stand
  alone, as in the feed.
- **The feed wins collisions.** A local artifact whose id or literal the feed
  already claims is skipped with a note saying which feed artifact owns it.
  This is the CLI-side mirror of the build guard against one literal carrying
  two death dates.
- The file itself is never scanned (basename skip), for the same reason the
  feed is not: a drift manifest contains every literal by definition.
- `npx driftcite --init-local` writes a template with an `$example` block the
  loader ignores, so initialising it cannot itself create findings.
- Local findings are reported in the same list, and `--json` carries a `local`
  block (file, count, problems) so CI and the watch can see it.

**Upstreaming** is documentation, not machinery: README gains a "track your own
API" section saying (a) private API → keep it local, (b) public API with a spec
repo → 4 lines in providers.yaml by PR, (c) public API with a deprecations page
→ a curated manifest by PR. No automated PR opening; YAGNI.

## Non-goals

- No local spec-repo tracking (that is the Python pipeline and a clock; the
  local file is artifacts, which is what yields findings anyway).
- No re-investment in endpoint diffing beyond the cheap providers.yaml rows.
- No artifact ships without the provider's own evidence URL, and no date is
  ever inferred. Research that comes back unverifiable is dropped, not shipped.
- The do-not-re-add list from 2026-08-06 stands (max_tokens et al.), as do both
  precision rules (match shapes, marker gating) and all five build guards.

## Testing

- New CLI behaviour lands with tests in test/run.mjs in the existing idiom:
  a local artifact fires; an invalid one is skipped and named; a colliding one
  loses to the feed; the local file itself is not scanned; --init-local writes
  a template that produces zero findings.
- Every new manifest passes `build_feed.py` (guards) and
  `build_feed.py --self-test` after a rebuild.
- Precision spot-check: `--offline --no-deps` against quickcruit-backend must
  keep its 13-finding baseline (no regressions from new artifacts).
