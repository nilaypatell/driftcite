# Contributing

The most useful contribution is a provider. Coverage is the thing that takes
calendar time, and it is the part that cannot be rushed by writing code faster.

## Adding a provider

If a provider publishes a versioned OpenAPI spec in a public git repository,
the whole integration is four lines in [`providers.yaml`](providers.yaml):

```yaml
  stripe:
    repo: stripe/openapi
    path: openapi/spec3.json
    markers: [stripe, STRIPE_SECRET, STRIPE_API]
```

| Field | What it is |
|:--|:--|
| `repo` | the public git repository holding the spec |
| `path` | path to the spec inside it. `.json` or `.yaml`; the other extension is tried automatically, because providers rename these over the years |
| `markers` | strings that must appear somewhere in a file before non-model artifacts from this provider count as a finding there |

### Markers matter more than they look

They are what stops a retired parameter named `refund` from flagging every
codebase that has ever mentioned a refund. They are the difference between a
tool people leave switched on and one they mute in a week.

Pick strings that only appear in files that genuinely talk to that provider:
the SDK import name, the environment variable holding the key, the API
hostname.

### Verify before you open the PR

```console
python3 scanner/openapi_diff.py --provider <name> --from <old-ref> --to <new-ref>
```

Then read the artifacts it produced and ask whether each one would be a true
positive in somebody else's repository. Enum values are where this goes wrong:
GitHub's spec once retired values called `None`, `Remove` and `number`, and
emitting those would have flagged a quoted string in every file that mentions
GitHub. The generator filters them now, but new providers find new ways to be
generic.

## Providers with no spec

Model retirements are almost always published as prose in documentation and
never appear in a spec, so those are curated by hand in
`manifests/<name>.yaml`. Follow [`spec/MANIFEST.md`](spec/MANIFEST.md).

**Every artifact must carry an `evidence` URL** pointing at the provider's own
page. A fact without a source does not go in a manifest. That rule is the
entire trust model, and a pull request that skips it will not be merged.

### `require_context` when the literal is not yours alone

Model IDs normally skip the `file_markers` gate, because a string like
`claude-3-opus-20240229` cannot plausibly mean anything else. Resellers break
that assumption. Azure serves `gpt-4o` and `claude-sonnet-4-5` under Azure's
own, earlier retirement dates, so shipping those as ordinary model IDs told
somebody calling OpenAI directly that their model was breaking, citing
Microsoft. Set `require_context: true` on any artifact whose literal another
provider also serves, and it is then reported only in files that match this
manifest's markers.

Bedrock is the counter-example worth reading before you reach for the flag. Its
IDs are `anthropic.claude-3-5-sonnet-20240620-v1:0`, which name the reseller in
the literal, so they need no gate. The flag is for a collision, not for a
reseller.

`azure-models.yaml` is currently held out of `feed/feed.json` by a block in
`scanner/build_feed.py`, and the build prints why every time it runs: npm
serves driftcite 0.2.0, which predates `require_context` and ignores it, and
that published client fetches this feed at runtime. Shipping those 42
artifacts would tell every `npx driftcite` user that `claude-sonnet-4-5` was
breaking, citing Microsoft, in code that never touched Azure. The manifest
keeps the artifacts; only the published feed withholds them, until a release
that can read the field is the one people run.

## The daily clock

A scheduled workflow runs four observers every morning, rebuilds the feed, and
commits what they saw. Three of the four exist because a curated manifest is a
transcription, and a transcription rots the day the page behind it is edited.

**`scanner/refresh.py`** re-diffs each spec provider against the last ref it
recorded in `manifests/state.json`.

**`scanner/watch_pages.py`** takes no configuration at all. It reads the
`sources:` list out of every hand-curated manifest — anything under
`manifests/` that is not `*.generated.yaml`, since a generated manifest cites
git compares, which are immutable and pointless to watch — fetches each URL,
strips the markup, and hashes the readable text. A changed hash is not a
finding, it is a work order, and the output names the manifest files that page
feeds so nobody has to remember which page belongs to what. The consequence for
you: adding a URL to `sources:` is how you put a page under watch. There is no
second list to update.

**`scanner/probe_models.py`** asks each provider for its live model list and
records what appeared and vanished, configured under `model_lists:` in
`providers.yaml`:

```yaml
model_lists:
  google:
    url: https://generativelanguage.googleapis.com/v1beta/models
    auth: query-key          # bearer | x-api-key | query-key
    key_env: [GEMINI_API_KEY, GOOGLE_API_KEY]   # tried in order
    id_path: models.name     # where the IDs live in the response
    strip: models/           # optional; Google returns models/gemini-1.5-pro
```

A manifest says a model retired because a page said so. The probe says it
because the request went out today and the ID was gone, and nobody can
reconstruct next year which IDs a provider was serving today unless somebody
asked today. It also audits both directions: a manifest claiming `retired` for
an ID still being served is a contradiction, and an ID that vanished with no
manifest entry is a curation job. A provider with no key in the environment is
skipped by name, never silently.

**`scanner/probe_sunset.py`** asks the endpoints themselves, under
`sunset_probes:`:

```yaml
sunset_probes:
  github:
    base: https://api.github.com
    watch_paths:
      - /rate_limit
```

RFC 8594 defines a `Sunset` response header and RFC 9745 a `Deprecation`
header, so a provider can announce a retirement in band months before writing
a blog post. Paths come from the endpoint artifacts already in that provider's
manifests, which turns a removal we cite into a removal we witnessed, plus any
`watch_paths` you list for endpoints that are still alive. Only HEAD is ever
sent and templated paths are skipped: a probe that invents an `{owner}` is
measuring something other than the API. No key is needed, because a 401 still
carries the response headers.

## Running the tests

```console
npm test
```

That is both suites, 179 tests: `test/run.mjs` covers the scanner and the CLI,
`test/watch.mjs` covers the hosted watch in `ee/watch/`. The 24 under `match
precision` and `finding context` are the ones to read first, because none of
them was invented. Each is a false positive this scanner produced against a
live codebase and now refuses: `refund` matching inside "refunded", `hosted` as
an ordinary English word, a parameter quoted inside a comment. If you change
matching behaviour, add the case that made you change it.

### `--self-test` on the scanner scripts

There is no Python test file. The convention instead is a `self_test()` living
in the script it tests, reachable as `--self-test`, running in-process against
fixtures with no network and no keys. Four scripts carry one:

```console
python3 scanner/openapi_diff.py --self-test   # the artifact filters
python3 scanner/probe_models.py --self-test   # appeared, vanished, returned
python3 scanner/probe_sunset.py --self-test   # header and status transitions
python3 scanner/build_feed.py --self-test     # the feed already committed
```

They are built in rather than filed away because these are the scripts you
reach for at 2am when a provider has moved, and a check you can run in the same
breath as the command is a check that gets run. If you add a filter or a state
transition, extend the `self_test()` next to it.

`build_feed.py --self-test` is the odd one: after a fixture check it opens
`feed/feed.json` itself and audits the artifacts actually committed, so it
fails on data rather than on code. It exists because nothing else ever opened
the one file every `npx driftcite` run downloads, and an artifact with no
evidence URL, no literal, or an unparseable `retires_on` ships perfectly and
fails at the user.

Two gaps worth knowing about rather than discovering. `refresh.py`, `scan.py`,
`sweep.py` and `watch_pages.py` carry no `--self-test` at all. And CI runs the
first three of the four above but not `build_feed.py --self-test`; it rebuilds
the feed and fails on a diff instead, which catches a stale feed and not a bad
artifact inside a fresh one. Run it yourself before you push manifest changes.

## Rebuilding the feed

```console
python3 scanner/build_feed.py
```

CI fails if `feed/feed.json` is out of sync with the manifests, so run this
before pushing when you have touched anything under `manifests/`.

## Licensing of contributions

Code you contribute is under [Apache 2.0](LICENSE), like the rest of the
scanner.

**Manifest data you contribute is dedicated to the public domain under
[CC0](https://creativecommons.org/publicdomain/zero/1.0/).** By opening a pull
request that adds or edits anything under `manifests/`, you place that content
in the public domain.

This is deliberate and it protects you more than it protects us. The single
most durable grievance in open source relicensing fights has been companies
changing the terms on work other people contributed for free. Taking manifest
data as CC0 means we can never do that to you: your contribution is already
public domain and stays that way no matter what happens to this project.

GitHub's own Advisory Database uses the same arrangement for the same reason.

## The two rules that are not up for negotiation

1. **No inference in the detection path.** A manifest asserts the fact and
   carries the evidence; the scanner only locates it. The moment driftcite
   reports something a provider did not actually publish, it is worthless.
2. **Precision over coverage.** A finding that is wrong costs more than a
   finding that is missing. The feed has gone from 29 artifacts to 235 without
   one match shape being loosened to accommodate a new provider, and that
   property is worth more than the next ten providers.
