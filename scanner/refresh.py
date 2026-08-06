#!/usr/bin/env python3
"""Poll every tracked provider, diff anything that moved, and record it.

This is the clock. It is meant to run unattended on a schedule, commit whatever
changed back to the repository, and never be interesting. The manifest history
that accumulates is the only asset in this project that cannot be reproduced by
writing code faster, because it accrues at exactly one day per day.

State lives in state.json next to the manifests, so the repository is the
database and there is nothing else to deploy.

    python3 scanner/refresh.py            # poll and write
    python3 scanner/refresh.py --dry-run  # report without writing
"""

import argparse
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import openapi_diff  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MANIFEST_DIR = os.path.join(ROOT, "manifests")
STATE_PATH = os.path.join(MANIFEST_DIR, "state.json")

# A conditional GET against releases.atom returns 304 with no rate-limit
# headers, which puts it outside the REST quota entirely. That is why polling
# every provider frequently is affordable.
ATOM = "https://github.com/{repo}/releases.atom"
TAGS_API = "https://api.github.com/repos/{repo}/tags?per_page=1"
TAGS_LIST_API = "https://api.github.com/repos/{repo}/tags?per_page=100"
COMMITS_API = "https://api.github.com/repos/{repo}/commits?path={path}&per_page=1"
COMMITS_LIST_API = "https://api.github.com/repos/{repo}/commits?path={path}&per_page=100"


def http_json(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "driftcite-refresh",
        "Accept": "application/vnd.github+json",
    })
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        print(f"  ! fetch failed: {exc}")
        return None


def latest_ref(provider):
    """The newest published ref for a provider, or None if unreachable.

    Tags are preferred because they are readable, but a provider whose tags
    are stale (Box's only tag is legacy-swagger-2.0, years behind main) can
    set track: commits in providers.yaml to follow the spec's commit history
    instead.
    """
    cfg = openapi_diff.PROVIDERS[provider]
    repo = cfg["repo"]
    if cfg.get("track") != "commits":
        tags = http_json(TAGS_API.format(repo=repo))
        if tags:
            return tags[0]["name"]
    commits = http_json(COMMITS_API.format(repo=repo, path=cfg["path"]))
    if commits:
        return commits[0]["sha"][:12]
    return None


def historical_ref(provider, back=25):
    """A ref far enough back to be worth diffing against.

    A provider seen for the first time has no previous observation, so waiting
    for its next release would leave it with an empty manifest indefinitely.
    Reaching back a fixed number of releases seeds real history on day one.
    """
    cfg = openapi_diff.PROVIDERS[provider]
    names = []
    if cfg.get("track") != "commits":
        tags = http_json(TAGS_LIST_API.format(repo=cfg["repo"]))
        names = [t["name"] for t in (tags or [])]
    if len(names) >= 2:
        return names[min(back, len(names) - 1)]

    # Plenty of providers publish continuously and never tag (Cloudflare and
    # DigitalOcean among them). Their history is still there, just addressed by
    # commit, so reach back through the commits that touched the spec itself.
    commits = http_json(COMMITS_LIST_API.format(repo=cfg["repo"], path=cfg["path"]))
    shas = [c["sha"] for c in (commits or [])]
    if len(shas) >= 2:
        return shas[min(back, len(shas) - 1)][:12]
    return None


def merge_generated(provider, new_artifacts, observation, evidence, newest):
    """Accumulate artifacts across refreshes instead of overwriting.

    The first version of this job wrote only the newest increment, which would
    have discarded every previously observed artifact the next time a provider
    moved. The manifest history is the asset, so a generated manifest may only
    grow, with one exception: a removal the provider later reversed is dropped
    rather than left to mislead.
    """
    import yaml

    out = os.path.join(MANIFEST_DIR, f"{provider}.generated.yaml")
    existing = {}
    if os.path.exists(out):
        with open(out) as fh:
            existing = yaml.safe_load(fh) or {}

    merged = {a["id"]: a for a in existing.get("artifacts") or []}
    for art in new_artifacts:
        merged[art["id"]] = art

    healed = 0
    try:
        spec = openapi_diff.load_spec(provider, newest)
        ops = openapi_diff.operations(spec)
        inv = openapi_diff.enum_inventory(spec)
        paths_alive = {op.split(" ", 1)[1] for op in ops}
        params_alive = set()
        for meta in ops.values():
            params_alive |= meta["params"]

        def still_true(art):
            # Only artifacts asserting a removal can be contradicted by the
            # spec growing the thing back. Deprecations and curated facts stay.
            if art.get("status") != "removed":
                return True
            literals = (art.get("match") or {}).get("literals") or []
            lit = literals[0] if literals else None
            kind = art.get("kind")
            if kind == "endpoint":
                return lit not in paths_alive
            if kind == "enum_value":
                return lit not in inv
            if kind == "request_param":
                # Coarse on purpose: alive on any operation counts as alive.
                # Wrongly dropping a real removal costs one finding; wrongly
                # keeping a false one costs trust.
                return lit not in params_alive
            return True

        kept = {k: a for k, a in merged.items() if still_true(a)}
        healed = len(merged) - len(kept)
        if healed:
            print(f"  self-heal: {healed} removal(s) reversed upstream, dropped")
        merged = kept
    except Exception as exc:
        print(f"  ! self-heal skipped: {exc}")

    # A refresh that published nothing is still worth writing down when it
    # withheld something. Twilio's 2.3.2 -> 2.6.9 diff produced no artifacts and
    # 637 withheld enum values; with nothing recorded, the repository's memory
    # of that release is identical to a release where Twilio changed nothing.
    if not new_artifacts and not healed and not observation.get("withheld"):
        return len(merged), False

    observations = existing.get("observations") or []
    legacy = existing.get("generated_from")
    if legacy:
        observations = [legacy] + observations
    observations = observations + [observation]

    sources = list(dict.fromkeys((existing.get("sources") or []) + [evidence]))

    spdx = existing.get("source_license")
    notice = existing.get("source_notice")
    # "undetermined" means GitHub did not answer, so ask again. "none published"
    # is an answer — plaid/plaid-openapi has no LICENSE file — and re-asking
    # every day would spend a request to learn the same thing.
    if not spdx or spdx == openapi_diff.UNDETERMINED:
        spdx, notice = openapi_diff.source_license(openapi_diff.PROVIDERS[provider]["repo"])

    doc = {
        "provider": provider,
        "spec_version": 1,
        "source_license": spdx,
        "source_notice": notice,
        "observations": observations,
        "sources": sources,
        "context": {"file_markers": openapi_diff.PROVIDERS[provider]["markers"]},
        "artifacts": sorted(merged.values(), key=lambda a: a["id"]),
    }
    with open(out, "w") as fh:
        yaml.safe_dump(doc, fh, sort_keys=False, default_flow_style=False)
    return len(merged), True


def load_state():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as fh:
            return json.load(fh)
    return {"providers": {}}


def save_state(state):
    state["updated"] = datetime.date.today().isoformat()
    with open(STATE_PATH, "w") as fh:
        json.dump(state, fh, indent=2, sort_keys=True)
        fh.write("\n")


def refresh(dry_run=False, bootstrap=False):
    import yaml

    state = load_state()
    today = datetime.date.today().isoformat()
    changed = []

    for provider in sorted(openapi_diff.PROVIDERS):
        print(f"\n{provider}")
        newest = latest_ref(provider)
        if not newest:
            print("  unreachable, skipping")
            continue

        seen = state["providers"].get(provider, {})
        previous = seen.get("ref")
        first_sight = not previous
        print(f"  latest={newest} last_seen={previous or 'never'}")

        if previous == newest:
            print("  no change")
            continue

        if not previous:
            # First sight of a provider. Reach back for something to diff
            # against so it arrives with real history rather than an empty
            # manifest that only fills in whenever the provider next ships.
            previous = historical_ref(provider) if bootstrap else None
            if not previous:
                print("  first observation, baseline recorded")
                if not dry_run:
                    state["providers"][provider] = {"ref": newest, "first_seen": today,
                                                    "last_change": today}
                continue
            print(f"  bootstrapping from {previous}")

        try:
            artifacts, ver_a, ver_b, evidence, withheld = openapi_diff.diff(
                provider, previous, newest, observed_on=today)
        except openapi_diff.SpecUnavailable as exc:
            print(f"  ! spec unavailable: {exc}")
            if first_sight and not dry_run:
                print("  baseline recorded despite failed bootstrap diff")
                state["providers"][provider] = {"ref": newest, "first_seen": today,
                                                "last_change": today}
            continue
        except Exception as exc:  # a provider can rename or restructure a spec
            print(f"  ! diff failed: {type(exc).__name__}: {exc}")
            if first_sight and not dry_run:
                print("  baseline recorded despite failed bootstrap diff")
                state["providers"][provider] = {"ref": newest, "first_seen": today,
                                                "last_change": today}
            continue

        print(f"  {ver_a} -> {ver_b}: {len(artifacts)} artifacts")
        breaking = [a for a in artifacts if a.get("severity") == "breaking"]
        if breaking:
            print(f"  {len(breaking)} breaking")
        # Twilio moved 637 enum values in one release and this loop printed
        # "0 artifacts", which is what a provider that did not move looks like.
        # The count of what was withheld, and why, goes in the log and in the
        # observation, so a quiet day is distinguishable from a filtered one.
        if withheld.total():
            print(f"  {withheld.total()} withheld:")
            for row in withheld.records():
                print(f"    {row['count']:>5}  {row['reason']}")

        if dry_run:
            continue

        out_path = os.path.join(MANIFEST_DIR, f"{provider}.generated.yaml")
        if artifacts or withheld.total() or os.path.exists(out_path):
            observation = {
                "repo": openapi_diff.PROVIDERS[provider]["repo"],
                "from": previous, "to": newest,
                "from_api_version": ver_a, "to_api_version": ver_b,
                "observed_on": today,
                "withheld": withheld.records(),
            }
            total, wrote = merge_generated(provider, artifacts, observation, evidence, newest)
            if wrote:
                changed.append(f"{provider} {ver_a} -> {ver_b} (+{len(artifacts)} new, {total} total)")

        state["providers"][provider] = {"ref": newest, "last_change": today,
                                        "first_seen": seen.get("first_seen", today)}

    if not dry_run:
        save_state(state)

    print()
    if changed:
        print("CHANGED:")
        for line in changed:
            print(f"  {line}")
    else:
        print("nothing moved today")
    return changed


def main():
    ap = argparse.ArgumentParser(description="Poll providers and record drift.")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--bootstrap", action="store_true",
                    help="seed history for providers never seen before")
    args = ap.parse_args()
    refresh(dry_run=args.dry_run, bootstrap=args.bootstrap)
    return 0


if __name__ == "__main__":
    sys.exit(main())
