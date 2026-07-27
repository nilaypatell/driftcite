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
updated: <YYYY-MM-DD>
sources:                    # where each fact can be independently checked
  - <url>
context:                    # optional
  file_markers:             # a file must contain one of these before
    - <string>              # non-model artifacts count as findings
artifacts:
  - id: <provider>/<kind>/<name>    # stable, globally unique
    kind: model_id | request_param | tool_type | endpoint | sdk_symbol
    match:
      literals: ["<exact string as it appears in source>"]
    status: active | deprecated | retired | removed
    announced_on: <YYYY-MM-DD>      # optional
    retires_on: <YYYY-MM-DD>        # optional, absent if already gone
    replacement: <string>           # what to use instead, null if none
    severity: breaking | warning | info
    note: <one line, human readable>
    evidence: <url>                 # the specific page proving this artifact
```

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
