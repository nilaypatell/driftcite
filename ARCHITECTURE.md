# apidrift: how it works and why it survives

Every number in this document was verified against a live endpoint on
2026-07-26, not estimated.

## The moat, stated concretely

The code is not the moat and never will be. An afternoon with a good model
reproduces everything in this repo. That is the condition of all software now,
not a fact about this project. So the question is only what stays scarce when
writing code is free.

**Months 1 to 6: we have no moat.** Anyone can clone us. The only thing we own
is that we started. Pretending otherwise would be a lie.

**What accrues, and why a competitor cannot catch up by coding faster:**

1. **The history.** A drift feed has to be *run*, daily, forever. A model can
   write the differ in an hour and cannot tell you what Stripe changed last
   Tuesday unless somebody was polling and recording. A competitor starting in
   2027 starts their history in 2027.

2. **The verification record.** Raw spec diffs are noisy: some removals are
   spec cleanup, not real breaks. Which ones actually broke people is only
   knowable if you were watching when it happened. The raw material also
   decays. `slackapi/slack-api-specs` has not been pushed since 2021, and
   Optic's domain no longer resolves. Two years of recorded outcomes cannot be
   regenerated at any speed, by anyone.

3. **Installs.** A byte-identical clone has zero users. Nobody swaps a working
   check in their CI for an unknown identical one.

4. **Citations.** Nobody clones caniuse. Its code is trivial. The citations
   point there.

The strategic consequence: since the code is clonable anyway, **give it away on
purpose.** That converts the worthless half into distribution and concentrates
value in the half that takes calendar time.

## The trick that solves storage, deployment, cost, and trust at once

**The ingest runs as a scheduled GitHub Action in the public repo, and commits
the manifests back to it.**

That single decision means:

- **Storage** is git. The manifest history *is* the corpus, and the corpus is
  the moat, so the moat is append-only and public.
- **Deployment** is nothing. No servers, no database, no ops.
- **Cost** is zero. Scheduled Actions are free on public repositories.
- **Trust** is automatic. Every fact in the feed traces to a commit produced by
  a public CI run whose logs anyone can read. For a product whose entire pitch
  is "we cite the provider instead of guessing," having the pipeline itself be
  auditable is the argument, not a nice-to-have.
- **The clock starts today**, with a dated commit, not after the architecture
  is perfect.

The feed is then just files served from the repo or fronted by a CDN.

## Scan cadence, per source

Cadence is set by what each source actually supports. All four verified live.

| Source | Mechanism | Real limit | Cadence |
|---|---|---|---|
| Spec repos in git | `releases.atom` conditional GET with `If-None-Match` | returns **304 with no rate-limit headers at all**, outside the REST quota | 5 min |
| Spec repos, fallback | GitHub REST | 5,000/hr authenticated; conditional 304s do not count | hourly |
| npm (4,230,819 packages) | `replicate.npmjs.com/registry/_changes` sequence cursor, keyless | `limit` max 10,000 | 5 min |
| PyPI | `X-PyPI-Last-Serial` on `/simple/` | `cache-control: max-age=600`, so faster polling is pointless | 10 min |
| Docs without a spec | fetch plus content hash | none | daily |

**Polling is mandatory, not a choice.** Webhooks require repository ownership
or admin, which we will never have on a provider's repo. The Events API is not
a substitute either: GitHub documents latency of "anywhere from 30 seconds to
6 hours."

**Never full-crawl npm.** Its Open-Source Terms state that "under no
circumstances are five million requests in a single month-long period ...
remotely reasonable." A full packument crawl is 4.2M requests, or 84% of the
monthly budget in a single pass. Follow the cursor incrementally, always.

**The registries need no per-provider work at all.** One cursor covers all of
npm; one header covers all of PyPI. That is millions of packages for two
requests every five minutes.

**Spec polling is bounded by the GitHub limit of 5,000 requests/hour
(authenticated, verified).** At one request per provider per hour, 100
providers costs 100 of 5,000. We are not close to the ceiling, and releases on
repos we do not own are readable (confirmed against `stripe/openapi`, tag
v2345 published 2026-07-23).

Spec snapshots are stored only on change, content-addressed. Stripe's spec is
7.8MB raw and roughly 1MB gzipped, so 100 providers changing weekly for two
years is on the order of 10GB. That is object-storage pocket change, and only
needed for providers whose git history we cannot lean on.

## How a stranger adopts it in under 60 seconds

Three levels, each a superset of the last:

**1. Look, no install.**

    npx apidrift .

Runs locally. Nothing leaves the machine. No account, no signup, no upload.
This matters beyond privacy: Show HN's own guidelines require that people can
try a thing "without barriers such as signups or emails," and the entire
category we are entering assumes codebase access we do not need.

**2. Catch it on every PR.** Three lines in a workflow file, exits non-zero on
breaking drift.

**3. Get told without looking.** Install the App, it stores a fingerprint of
which artifacts your code touches (a few hundred strings, not your code), and
when a provider changes one of them you get a PR.

Level 3 is the product. Levels 1 and 2 are how anyone ever hears about it.

## Why this can be quiet enough to leave on

Every alerting tool dies of noise. People mute it, then delete it. `npm audit`
is the standard example and has an 872-point Hacker News thread titled "Npm
Audit: broken by design?" as its epitaph.

We can be quiet because we check call sites. We do not say Stripe changed
something. We say line 309 of `ai-providers.js` calls a model that died 202
days ago. Getting the match shapes right took one repo from 86 findings at
roughly 25% true positives to 5 at 100%, and that ratio is the whole product.

Severity is also computed against today rather than frozen when a manifest was
written, so an entry reading "deprecated, retires 2026-06-15" reports as
**retired** once that date passes, and as "breaks in 14 days" before it. No
dependency tool has a field for time remaining.

## Coverage ceiling

| Tier | Source | Providers | Per-provider work |
|---|---|---|---|
| 1 | Versioned OpenAPI in public git | Stripe, GitHub, AWS (426 services), Twilio, Cloudflare, DigitalOcean, Box, Adyen, Plaid, OpenAI, Discord, Intercom, Asana | one config entry |
| 2 | Package registries | all of npm and PyPI | none, two cursors |
| 3 | APIs.guru aggregate | 2,529 APIs, 108,837 endpoints | bulk import |
| 4 | Hand-curated | model IDs and anything with no spec | ongoing |

Tiers 1 to 3 are mechanical. Tier 4 is where the human judgment lives, and is
therefore also where the moat lives.

The honest ceiling: providers publish *what* changed and almost never *when it
dies*. Nine major APIs returned zero RFC 9745 Deprecation headers and zero RFC
8594 Sunset headers. Stripe marks 2 of 534 operations deprecated with no dates.
So mechanical ingest gets breadth, and dates stay partly manual for years.

## What is deliberately not built yet

The PR. It is last on purpose. A single bad automated PR at scale ends the
brand, and GitHub's acceptable use policy bans bulk automated activity outright.
Opt-in only, never a batch, always with the provider's quote, an evidence URL,
and a passing test.

## Hosting, measured

The feed goes on **Cloudflare R2 behind a custom domain.** At 1M fetches/day
R2 costs $7.20/mo against roughly $273 on S3 and $340 to $764 on Vercel Pro.
It is a 50x decision.

Three options are disqualified outright, for reasons worth writing down so
nobody relitigates them:

- **GitHub Pages**, twice over: a 100GB/month soft cap, and an explicit
  prohibition on hosting anything "primarily directed at ... providing
  commercial software as a service."
- **Vercel Hobby**: non-commercial use only, and exceeding 1M edge requests
  pauses the feature for 30 days rather than billing.
- **`pub-*.r2.dev`**: Cloudflare states it "is intended for non-production
  traffic," is rate-limited, and gets zero CDN caching. Custom domain always.

Storage is measured, not estimated. Stripe's spec is 7,866,866 bytes raw and
299,833 compressed with zstd, a 26x ratio. 100 providers times 730 daily
snapshots is 574GB raw, about 15GB content-addressed and deduplicated, which
sits inside R2's free band. **There is no reason to ever discard history**,
which matters because the history is the moat.

One operational trap: scheduled Actions on a public repo auto-disable after 60
days without activity. A daily manifest commit keeps them alive, but the feed
needs its own freshness watchdog regardless.

## The PR ceiling

A GitHub App installation gets 5,000/hr baseline, but the binding constraint is
the secondary limit of **500 content-creating requests per hour**. At roughly
five calls per PR that is about 100 PRs/hour per installation, so a large
customer hit by one broad breaking change must be a serial queue with backoff
from day one.

The AUP bans "automated excessive bulk activity." That makes the 86-to-5
precision work platform-survival insurance, not a quality nicety.

Permissions ask is exactly two scopes: `Contents: write` and
`Pull requests: write`. No admin, no org-wide read, and never `Workflows:
write` unless we actually edit CI files, because that scope scares security
reviewers and costs installs.

## Licensing and the open-core line

| Component | License |
|---|---|
| Scanner CLI, match shapes, manifest schema, spec-diff generator | **Apache 2.0** (the patent grant matters for a matching engine) |
| Published manifests, evidence registry, severity data | **Proprietary data license**: free for internal use and research, prohibited for building a competing feed. Semgrep's Rules License is the template |
| Hosted control plane: scheduling, cross-run state, PR generation | Closed |

This is where Dependabot draws it, and that boundary has held for seven years
at GitHub scale.

## Pricing

Per-org flat, **never per-seat.** Renovate's paid tier was converted to free in
2019 and Greenkeeper shut down in 2020; both sold dependency automation per
developer. That grave is well marked.

| Tier | Price | What it buys |
|---|---|---|
| Free | $0 | Unlimited public repos, unlimited local CLI, keyless feed, 3 private repos, daily refresh, findings only |
| Team | $99/mo per org, unlimited seats | 25 private repos, hourly feed, PR generation |
| Business | $499/mo | 200 private repos, 5-minute feed, SSO, org rollup |
| Enterprise | from $16,000/yr | Self-hosted, private manifests for the customer's own internal APIs |

Team works out to $3.96 per private repo, sitting between Depfu's $5.80 and
$2.36 tiers, which is the closest structural comparable. Three independent
payment triggers: a private repo, feed freshness, or an automated PR.

Publishing a price is itself a differentiator. Infield cannot, because they
sell expert developer hours alongside the software, and services have no list
price. Our artifacts are generated from the provider's own spec at near-zero
marginal cost per provider, so we can.

## Where the OpenRouter analogy breaks

Worth stating plainly, because a serious investor will find it first.

OpenRouter charges 5.5% at the moment money enters their system. They sit on a
metered flow of 25 trillion tokens a week. **We sit on zero flow and there is
no obvious version of us that ever does.**

There is no evidenced general premium for being a neutral layer. What the deals
support is narrower: neutrality *plus a metered flow* commands a premium.
Plaid sold for $5.3B at a reported >50x multiple as an "insurance policy" on
Visa's debit business. Against that, Atlassian bought Optic, our exact
category, for an undisclosed price and archived it in January 2026, and
GitHub's Dependabot purchase price remains confidential.

Every large number in this space came from a layer carrying money. Every layer
in our category sold for a price nobody published.
