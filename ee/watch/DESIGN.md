# The hosted watch

Everything in this directory is covered by `ee/LICENSE`, not Apache 2.0.
This is the fourth row of the README's table: *told the hour a provider
moves, across every repo*, without a workflow file in any of them.

## What it is

A sweep. Given a GitHub App's credentials, one run:

1. lists every installation of the App, and every repository each one grants,
2. decides which repositories actually need scanning (most do not, most days),
3. shallow-clones each of those, runs the same public CLI anyone can read,
4. applies only the fixes the provider itself named, using the CLI's own
   fix path with all of its refusals intact,
5. pushes a branch and opens one pull request per repository, serially,
6. records what was matched, and nothing else.

There is no server. A sweep is a process that starts, finishes, and exits;
scheduling it is cron's job. Webhooks, billing, and hourly cadence are
deliberately absent from v1 — polling the installation list each sweep is
correct at this scale, and every absent component is one that cannot fail.

## The privacy invariant

The state file stores, per repository: provider names, matched artifact IDs,
the head commit it last scanned, and which pull requests it opened. **Never
file paths, never line numbers, never excerpts, never code.** This is the
README's "a few hundred strings, never files" promise, enforced in code:
`state.mjs` refuses to serialise any shape outside its allowlist, so a future
edit that tries to persist a finding verbatim fails a test instead of
shipping.

Source is cloned to a temporary directory for the duration of one scan and
deleted before the next repository starts.

## Earning the clone

Cloning someone's code is the expensive and trust-sensitive act, so a
repository is cloned only when something could have changed the answer:

- it has never been scanned, or
- its head commit moved since the last scan (their code changed), or
- the feed changed for a provider this repository is known to touch
  (the provider moved), or
- the sweep was invoked with `--full`.

The feed delta is computed against a per-provider snapshot of artifact IDs
kept in the state file, so the planner needs nothing but the previous state
and the current feed. A repository whose providers saw no drift and whose
code did not move costs one `git ls-remote`-equivalent API call and no clone.

## Pull request rules

Inherited from the opt-in workflow, enforced here in code:

- **Serial, always.** One PR is created at a time across the whole sweep,
  with backoff honouring `Retry-After` and exhausted rate windows. The
  secondary limit of 500 content-creating requests per hour is the binding
  constraint and the reason this is a queue, not a fan-out.
- **Never reopen.** If the fix branch already exists on the remote, a
  previous PR is open or was deliberately closed; leave it alone.
- **One PR per repository per sweep**, carrying every fix at once.
- **Every claim cites the provider.** The body is built from the findings,
  each with its evidence URL, same voice as the workflow's.
- **`.github/workflows/` is never touched.** The App does not hold
  `workflows: write`, on purpose; if the only fixable lines sit in a workflow
  file, the sweep refuses them out loud rather than asking for a scope that
  costs installs.

## Running it

```console
export DRIFTCITE_APP_ID=…            # the App's numeric id
export DRIFTCITE_APP_KEY_FILE=…      # path to the App's private key PEM
node ee/watch/watch.mjs --state ~/.driftcite/watch-state.json          # dry run
node ee/watch/watch.mjs --state ~/.driftcite/watch-state.json --live   # act
```

Dry run is the default and prints exactly what a live run would have done:
which repositories were scanned and why, which PRs would open, what was
refused. `--live` pushes branches and opens the PRs. The App needs exactly
two repository permissions: **Contents: read & write** and **Pull requests:
read & write**. Nothing else, ever.

## Files

| file | job |
|:--|:--|
| `github.mjs` | App JWT, installation tokens, paginated REST, backoff |
| `state.mjs` | the fingerprint store, and the allowlist that keeps it honest |
| `plan.mjs` | feed snapshots, deltas, and the decision to clone or skip |
| `pr.mjs` | branch names, PR bodies, the workflows guard |
| `sweep.mjs` | one repository end to end: clone, scan, fix, push, PR |
| `watch.mjs` | the entry point: wire the real world in, loop serially |

Every module takes its effects (fetch, git, clock) as arguments, so the tests
in `test/watch.mjs` run a full sweep against a local bare repository and a
fake API, with no network and no real App.
