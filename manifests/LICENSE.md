# driftcite Data License, version 1.0

This license covers the contents of the `manifests/` directory: the drift
manifests, the evidence registry, the observation history, and the severity
data. It does **not** cover the software in this repository, which is licensed
under the Apache License 2.0. See the `LICENSE` file at the repository root.

## What this license does and does not claim

**It does not claim the underlying facts.** That Stripe removed
`/v1/invoices/upcoming`, or that a maintainer wrote "Security vulnerability
fixed in 5.2.1", are facts about the world. Facts are not ours and cannot be
owned by anyone. Every one of them is published by the provider, and every
artifact in these manifests carries an `evidence` URL pointing at the
provider's own source precisely so you can verify it without us.

**It claims the compilation.** What is ours is the selection, normalization,
verification, dating, and continuous maintenance of these facts as a single
cross-vendor collection. That is the work, and it is what this license covers.

If you disagree with that distinction, you are free to go and derive the same
facts from the same public sources yourself. The generator that does it is in
this repository under Apache 2.0, and we will not object.

## Grant

You may, free of charge:

1. **Use these manifests internally**, for any purpose, commercial or not,
   including scanning proprietary codebases and running them in CI.
2. **Redistribute them** as part of an application, provided this license and
   attribution travel with them.
3. **Modify them**, including adding your own artifacts.
4. **Use them for research**, including academic publication, with attribution.

## Model lifecycle rows are CC BY 4.0, with no restriction at all

Every `model_id` artifact — the model identifier, its status, its
`announced_on` and `retires_on` dates, its provider-named replacement, and its
`evidence` URL — is released under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Take them, embed them, ship them, sell around them. The only ask is
attribution.

This carve-out is deliberate and it is not generosity. A model retirement date
is worth something only where a developer already is, which means inside the
catalogs and SDKs they already depend on, not inside a feed they have to hear
about first. A licence that forbids embedding protects a compilation that
anyone can rebuild from the same public pages in an afternoon, while
foreclosing the only position that compounds: being the row everyone else's
file points at. caniuse is not canonical because its data was locked up.

If you maintain a model catalog, an SDK, or a pricing table, you are welcome to
copy these rows wholesale. We would rather send you a pull request than a
cease and desist, and there is a standing offer to keep your copy current.

## The one restriction, on everything else

For the rest of the collection — the generated spec diffs, the endpoint,
parameter and enum artifacts, the observation history and the severity data —
you may **not** use these manifests, in whole or in substantial part, to
create, train, or operate a product or service whose primary purpose is to
provide API drift, deprecation, or breaking change data to third parties.

In plain terms: build anything you like on top of that data. Do not repackage
it as a competing feed.

## Attribution

Where practical, cite as: `driftcite manifests, <date>, https://driftcite.dev`

## No warranty

These manifests are provided as is, without warranty of any kind. API
deprecation data goes stale by nature, and a manifest is a record of what was
observed on a date, not a guarantee about the present. Verify against the
`evidence` URL before acting on anything that matters.

## Why this boundary

The scanner is deliberately permissive because we want it embedded everywhere,
including in competitors' pipelines. The data is where the work accumulates:
it has to be polled, verified, and maintained every day, forever, and it decays
if anyone stops. That maintenance is the product, and this license protects the
maintenance rather than the facts.

This is the same boundary Semgrep draws between its engine and its rules.
