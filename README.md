# apidrift

Codebases rot against the APIs they call. Model IDs get retired, request
parameters get removed, endpoints get sunset. The provider announces it in a
changelog; the code never hears about it.

apidrift is two things:

1. **A drift manifest format** (`spec/MANIFEST.md`) that lets an API provider
   state, once and machine-readably, what in their surface has changed.
2. **A scanner** (`scanner/scan.py`) that finds those changes in any repo.

The long-term product is provider-side: providers have telemetry, not code
visibility. Anthropic knows which API key called a retired model. It does not
know the call is a hardcoded string in a config file nobody has touched in
eight months. That view requires scanning the code universe, not the logs, and
no single provider can build it neutrally for all the others.

## Design rule

**The manifest asserts the fact and carries the evidence URL. The scanner only
locates it.** Detection is literal string matching, never inference. Every
finding cites a source page a human can check in one click. Break this and the
first hallucinated migration kills the product.

## Usage

```
pip install pyyaml
python3 scanner/scan.py ~/path/to/repo
python3 scanner/scan.py ~/path/to/repo --json
```

Exit code is 1 if anything `breaking` was found, 0 otherwise, so it drops into
CI as-is.

## Coverage

| provider | artifacts | status |
|---|---|---|
| anthropic | 15 | seeded from the official model and migration docs |
| openai | - | not started |
| stripe | - | not started |
| clerk | - | not started |

## The category no lockfile tool can see

When a provider drops a field, removes an endpoint, or retires an enum value,
**nothing moves in your lockfile.** Socket.dev, deps.dev, Dependabot, Renovate
and npm-deprecated-check all read manifests, so they are blind to this by
construction, not by oversight. That is the gap.

`scanner/openapi_diff.py` generates manifest artifacts by diffing two versions
of a provider's own published OpenAPI spec. No hand-authoring, no model in the
detection path, and the evidence is the provider's own git compare URL.

    python3 scanner/openapi_diff.py --provider stripe --from v1200 --to v2345 \
        --out manifests/stripe.generated.yaml

Stripe `2024-06-20` to `2026-06-24.dahlia` yields 14 artifacts, including the
removal of `/v1/invoices/upcoming` and the usage-records API along with its
`last_during_period` / `last_ever` / `increment` aggregation enums.

Supply is not the constraint. Stripe publishes 2,345 tagged spec releases,
GitHub pushes continuously, AWS covers 426 services, and APIs.guru aggregates
2,529 APIs across 108,837 endpoints.

## Matching precision

Substring matching is wrong and the first version proved it: the parameter
`refund` matched inside "refunded" and inside a sentence about refunds, and a
retired enum value like `hosted` is an ordinary English word. Each artifact
kind now only matches in the shape it actually takes when sent to a provider
(quoted string literal, object key, or bounded token), and non-model kinds also
require the file to reference that provider at all.

That change took one repo from 86 findings at roughly 25% true positives to
5 findings at 100%.

## State of the scanner, honestly

Run against `quickcruit-backend` on 2026-07-26 it returned 8 findings:

- **1 confirmed real.** `src/config/ai-providers.js:309` routes the `reasoning`
  task to `claude-3-opus-20240229`, retired 2026-01-05.
- **1 worth a look.** `claude-provider.js:133` reads `thinking.budget_tokens`,
  which is rejected with a 400 on every current model.
- **4 low value.** Entries in a model registry table, where old IDs belong.
- **2 false positives.** A `{{output_format}}` template variable and a code
  comment.

`quickcruit-frontend` and `quickcruit-jobs` came back clean.

So it finds real drift, and precision is the open problem.

## Next

1. **Classify files before reporting.** A file that *calls* the API is drift; a
   registry that *defines* models is not, and a template variable is neither.
   This one change removes 6 of the 8 findings above without losing the real
   one. The Anthropic migration guide describes exactly this split (caller /
   definer / opaque string reference), which is a good sign the distinction is
   real and not something we invented.
2. Add openai, stripe, clerk manifests.
3. Read-only scan across a few hundred public repos to size the problem.
   Aggregate numbers only; no repo named without a fix attached.
4. Patch generation, narrow: only where the manifest proves the fact, always
   shipping a test.
