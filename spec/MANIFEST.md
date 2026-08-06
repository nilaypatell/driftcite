# Drift Manifest, spec version 1

A drift manifest is a machine-readable statement, authored by an API provider,
of what in their surface has changed: retired model IDs, removed request
parameters, renamed tool types, sunset endpoints.

One file per provider. The manifest is the contract. Everything downstream
(scanning, patching, reporting) is derived from it.

## Why the provider should own this

Providers today publish deprecations as prose: a changelog entry, a blog post,
a docs table. Humans read those. Codebases do not. The gap between "we
announced it" and "it is fixed in customer code" is where support tickets and
churn live.

A manifest closes that gap without the provider having to know anything about
any particular customer's repo.

## Format

```yaml
provider: <slug>            # stripe, openai, github, cloudflare
spec_version: 1
updated: <YYYY-MM-DD>       # curated manifests; generated ones carry observations
source_license: <spdx>      # optional; the licence of the spec this came from
source_notice: <url>        # optional; that licence, where it can be read
sources:                    # where each fact can be independently checked
  - <url>
context:                    # optional
  file_markers:             # a file must contain one of these before
    - <string>              # non-model artifacts count as findings
artifacts:
  - id: <provider>/<kind>/<name>    # stable, globally unique
    kind: model_id | request_param | tool_type | endpoint | sdk_symbol | enum_value
    match:
      literals: ["<exact string as it appears in source>"]
    status: active | deprecated | retired | removed
    announced_on: <YYYY-MM-DD>      # optional
    retires_on: <YYYY-MM-DD>        # optional, absent if already gone
    replacement: <string>           # what to use instead, null if none
    severity: breaking | warning | info
    note: <one line, human readable>
    evidence: <url>                 # the specific page proving this artifact
    require_context: true           # optional; see rule 5
```

### `observations`, on a generated manifest

A manifest produced by diffing two published specs also records each
comparison it made, and what it decided not to emit:

```yaml
observations:
  - repo: stripe/openapi
    from: v1200
    to: v2345
    from_api_version: '2024-06-20'
    to_api_version: 2026-06-24.dahlia
    observed_on: '2026-07-26'
    withheld:
      - reason: enum value is an ordinary word and would match unrelated code
        count: 6
        examples: ["'embedded'", "'fastest'", "'hosted'"]
```

`withheld` is the part that matters. A generator that drops a candidate
silently is indistinguishable from one that never saw it, so the reason and
the examples are written down and committed. It is also the only record of why
a real removal is absent from the feed, which is the first question anyone
asks when they find one missing.

## Rules

1. **Every artifact carries `evidence`.** A fact without a source URL does not
   go in a manifest. Downstream tooling cites it in every report and every
   pull request. This is the whole trust model: the manifest asserts, the
   evidence proves, and a human can check in one click.

2. **`match.literals` are exact source strings**, not regexes and not
   descriptions. A scanner must be able to find them without interpreting
   anything.

3. **`severity: breaking`** means code containing this artifact is already
   failing or will fail on `retires_on`. Nothing else earns `breaking`.

4. **A model, endpoint, or parameter never leaves the manifest.** Retired
   artifacts stay forever, because old code still contains them. The manifest
   is append-mostly.

5. **`require_context: true` when the same name is served by someone else.**
   Model IDs are normally distinctive enough to match anywhere, so they skip
   the `file_markers` gate. Resellers break that assumption: Azure serves
   `gpt-4o` and `claude-opus-4-1` under its own, earlier retirement dates, and
   telling someone who calls OpenAI or Anthropic directly that their model died
   on Azure's date is a wrong answer delivered with a citation. An artifact
   whose literal another provider also serves sets this flag and is then only
   reported in files that name the provider.

## Status values

| status | meaning |
|---|---|
| `active` | Current. Present so tooling can distinguish "known good" from "unknown". |
| `deprecated` | Still works. Has a `retires_on` date. |
| `retired` | Model or endpoint no longer served. Calls fail. |
| `removed` | Request parameter or field no longer accepted. Requests fail. |

The split between `retired` and `removed` matters because the failure mode
differs: a retired model is a 404 on the model ID, a removed parameter is a
400 on an otherwise valid request.
