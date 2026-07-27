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

## The one restriction

You may **not** use these manifests, in whole or in substantial part, to
create, train, or operate a product or service whose primary purpose is to
provide API drift, deprecation, or breaking change data to third parties.

In plain terms: build anything you like on top of this data. Do not repackage
the data itself as a competing feed.

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
