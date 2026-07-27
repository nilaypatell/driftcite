# Outreach pull requests, drafted

Rules these follow, decided before any were written:

- **The model must already be dead**, not scheduled to die. "This returns an
  error today" is checkable; "this expires in 88 days" invites debate.
- **Production source only.** No test fixtures, no examples, no docs.
- **Never a migration file.** `hotovo/aider-desk` was disqualified for exactly
  this: its finding sits in `migrations/v0-to-v1.ts`, and a historical
  migration must stay frozen even when the value in it is stale.
- **The provider's own page is the citation**, so a maintainer verifies in one
  click without trusting us.
- **Disclose the tool in one line.** Hiding it and being found out is worse
  than mentioning it.
- Opened by a person, from a personal account, never in a batch.

---

## 1. undertheseanlp/underthesea (1,796 stars)

Strongest candidate. Two provider defaults, both dead, two separate one-line
changes in files whose entire job is to name the default model.

**Files**
- `underthesea/agent/providers/anthropic_provider.py:18`
  `DEFAULT_MODEL = "claude-sonnet-4-20250514"` (retired 2026-06-15, 41 days ago)
- `underthesea/agent/providers/gemini_provider.py:19`
  `DEFAULT_MODEL = "gemini-2.0-flash"` (retired 2026-06-01, 56 days ago)

**Title**
`fix: default models for both providers have been retired upstream`

**Body**

> Both provider defaults currently point at models that have been shut down, so
> a user who does not override `DEFAULT_MODEL` gets an API error rather than a
> response.
>
> **`anthropic_provider.py`** defaults to `claude-sonnet-4-20250514`, retired
> 2026-06-15.
> **`gemini_provider.py`** defaults to `gemini-2.0-flash`, shut down 2026-06-01
> per Google's changelog: https://ai.google.dev/gemini-api/docs/changelog
>
> This updates each to the replacement the provider names, and changes nothing
> else. Happy to split it into two commits, or to drop the Gemini half if you
> would rather pin a different version.
>
> Found while testing driftcite, a tool I am building that checks code against
> providers' published deprecation notices.

---

## 2. timpaul/form-extractor-prototype (403 stars)

Cleanest possible diff: one line, one word, unambiguous.

**File**
- `server.js:363` — `model: "gemini-2.0-flash"` (shut down 2026-06-01, 56 days ago)

**Title**
`fix: gemini-2.0-flash was shut down on 1 June 2026`

**Body**

> `server.js` calls `gemini-2.0-flash`, which Google shut down on 2026-06-01.
> Requests to it now fail, so the extraction path returns an error.
>
> Google's changelog lists `gemini-3.5-flash` as the replacement:
> https://ai.google.dev/gemini-api/docs/changelog
>
> One-line change, no other edits. Found while testing driftcite, a tool I am
> building that checks code against providers' published deprecation notices.

---

## 3. farshed/sage (465 stars)

A real runtime fallback: the string after `||` is what runs when the
environment variable is unset.

**File**
- `index.ts:62` — fallback `claude-3-5-haiku-20241022` (retired 2026-02-19, 158 days ago)

Only the Anthropic line is proposed. The OpenAI line on 63 names `gpt-4-turbo`,
which is deprecated but **not yet shut down** (scheduled 2026-10-23), and
changing a model that still works is the maintainer's call, not ours. Mention
it in the body, do not touch it.

**Title**
`fix: default Anthropic model has been retired`

**Body**

> The Anthropic fallback in `index.ts` is `claude-3-5-haiku-20241022`, which was
> retired on 2026-02-19. Anyone running without `ANTHROPIC_MODEL` set hits a
> 404 rather than a reply.
>
> Updated to `claude-haiku-4-5`, the replacement named in Anthropic's migration
> guide.
>
> Separately, and deliberately not changed here: the OpenAI fallback on the next
> line is `gpt-4-turbo`, which OpenAI has scheduled for shutdown on 2026-10-23.
> It still works today, so I have left that to you.
>
> Found while testing driftcite, a tool I am building that checks code against
> providers' published deprecation notices.

---

## Held back

| Repo | Why not |
|:--|:--|
| `hotovo/aider-desk` | finding is in a migration file, which must stay frozen |
| `ccfos/nightingale` | only finding is in `ai_summary_test.go` |
| `google/timesketch` | all three findings are in `_test.py` files |
| `SuanmoSuanyangTechnology/MemoryBear` | mostly a model catalogue and prose descriptions, not call sites |
| `morettt/my-neuro` | findings are in log strings and config descriptions |

## Before opening any of them

1. Re-clone at current HEAD and confirm the line still exists. These were
   verified 2026-07-27 and a maintainer may have fixed it already.
2. Read `CONTRIBUTING.md` and follow the project's own conventions.
3. Check no open PR already does this.
4. Open at most three in a week. Volume is what turns useful into spam.
