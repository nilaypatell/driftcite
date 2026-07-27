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

## Running the tests

```console
node test/run.mjs
```

Every test in there is a real false positive this scanner produced against a
live codebase, kept as a regression. `refund` matching inside "refunded",
`hosted` as an ordinary English word, a parameter quoted inside a comment. If
you change matching behaviour, add the case that made you change it.

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
   finding that is missing. Going from 29 artifacts to 125 produced zero new
   findings across nine real repositories, and that property is worth
   protecting.
