# Security

## Reporting a vulnerability

Open a [private security advisory](https://github.com/nilaypatell/driftcite/security/advisories/new).
Please do not open a public issue for a vulnerability.

Expect a first response within 72 hours.

## What this tool does with your code

Worth stating plainly, because you are being asked to run a scanner over a
private codebase.

**Your source code is never transmitted anywhere.** The scan runs entirely on
your machine. There is no account, no upload, and no telemetry.

The CLI makes exactly three kinds of network request, all of them optional:

| Request | Why | How to disable |
|:--|:--|:--|
| Fetch `feed/feed.json` from this repository | the drift facts to match against | `--offline` uses the bundled copy |
| `registry.npmjs.org/<package>` | ask npm whether a version you installed was deprecated | `--no-deps` |
| `pypi.org/pypi/<package>/json` | ask PyPI whether a release you pinned was yanked | `--no-deps` |

The registry requests send **package names only**, which are public
identifiers, and never file contents, paths, or repository names.

`npx driftcite . --offline --no-deps` performs a complete drift scan with no
network access at all.

## Dependencies

The CLI has **zero runtime dependencies** by design. It runs on a stranger's
machine and reads their source, so it should be auditable in one sitting and
pull nothing in. The entire scanner is a single file: `bin/driftcite.mjs`.

## Writes to your files

`--fix` modifies files only when you pass `--write`, and then only:

- on lines the scan already reported
- inside the existing quoting, swapping one literal for the replacement the
  provider itself named
- never on comment lines

If an edit would change any line other than the ones reported, the file is left
untouched rather than partially written. Replacements that are prose rather
than a drop-in token are refused and reported as needing a human.

Run without `--write` first to see the exact diff.

## Supported versions

Fixes land on the latest release. Please upgrade before reporting.
