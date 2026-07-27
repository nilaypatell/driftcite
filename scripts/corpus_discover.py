#!/usr/bin/env python3
"""Build a corpus of public repositories that call the providers we track.

The sample has to be defensible, so the rules are fixed in advance and applied
uniformly rather than chosen after seeing results:

  * one query per provider signal, taken from what real integration code
    literally contains (an import, an env var, a base URL)
  * every repository the query surfaces is kept, in the order GitHub returns
    it, with no manual curation
  * filters are mechanical: a star floor to exclude abandoned scratch repos,
    a recency floor so we measure live code, a size ceiling so one monorepo
    cannot dominate the clone budget

Discovery and scanning are separate steps on purpose. The repo list is written
out and published alongside the results, so anyone can rerun the scan against
the identical sample and check our arithmetic.

    python3 scripts/corpus_discover.py --out corpus/repos.json
"""

import argparse
import json
import os
import subprocess
import sys
import time

# One query per provider signal. These are the strings that actually appear in
# code that talks to each provider, not guesses about repository topics.
QUERIES = [
    ("openai",     '"from openai import" language:python'),
    ("openai",     '"from \'openai\'" language:javascript'),
    ("openai",     '"OPENAI_API_KEY" language:typescript'),
    ("google",     '"generativelanguage.googleapis.com"'),
    ("google",     '"GEMINI_API_KEY"'),
    ("groq",       '"from groq import" language:python'),
    ("groq",       '"GROQ_API_KEY"'),
    ("stripe",     '"STRIPE_SECRET_KEY" language:javascript'),
    ("stripe",     '"import stripe" language:python'),
    ("cloudflare", '"api.cloudflare.com/client/v4"'),
    ("github",     '"api.github.com/repos" language:python'),
    ("twilio",     '"TWILIO_ACCOUNT_SID"'),
]

MIN_STARS = 5           # below this is mostly tutorials and abandoned forks
MAX_KB = 400_000        # skip monoliths; the clone budget is finite
PUSHED_AFTER = "2025-01-01"   # measure code that is still alive
PER_PAGE = 100
PAGES = 3               # code search caps at 1000 results per query anyway


def gh(args):
    out = subprocess.run(["gh"] + args, capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        return None
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return None


def search(query, page):
    """One page of code search. Rate limit is 10 requests/minute, so callers
    must pace themselves; this only reports what it got."""
    endpoint = f"search/code?q={query}&per_page={PER_PAGE}&page={page}"
    return gh(["api", "-H", "Accept: application/vnd.github+json", endpoint])


def batch_meta(full_names):
    """Metadata for up to 100 repositories in one GraphQL call.

    Asking REST for each repository separately meant one HTTP request per
    search hit, which is thousands of calls for a corpus of a few hundred. The
    unique repository names are collected first and enriched in batches.
    """
    out = {}
    for i in range(0, len(full_names), 100):
        chunk = full_names[i:i + 100]
        parts = []
        for n, full in enumerate(chunk):
            owner, _, name = full.partition("/")
            parts.append(
                f'r{n}: repository(owner: "{owner}", name: "{name}") '
                '{ nameWithOwner stargazerCount diskUsage pushedAt isFork isArchived '
                'primaryLanguage { name } licenseInfo { spdxId } }'
            )
        query = "query { " + " ".join(parts) + " }"
        data = gh(["api", "graphql", "-f", f"query={query}"])
        if not data:
            continue
        for node in (data.get("data") or {}).values():
            if not node:
                continue
            out[node["nameWithOwner"]] = {
                "full_name": node["nameWithOwner"],
                "stars": node.get("stargazerCount", 0),
                "size_kb": node.get("diskUsage") or 0,
                "pushed_at": (node.get("pushedAt") or "")[:10],
                "language": (node.get("primaryLanguage") or {}).get("name"),
                "license": (node.get("licenseInfo") or {}).get("spdxId"),
                "fork": node.get("isFork", False),
                "archived": node.get("isArchived", False),
            }
        print(f"  metadata: {len(out)}/{len(full_names)}", flush=True)
    return out


def keep(meta):
    """Mechanical filters, applied to every candidate identically."""
    if not meta:
        return False, "unreadable"
    if meta["fork"]:
        return False, "fork"
    if meta["archived"]:
        return False, "archived"
    if meta["stars"] < MIN_STARS:
        return False, f"stars<{MIN_STARS}"
    if meta["size_kb"] > MAX_KB:
        return False, "too large"
    if meta["pushed_at"] < PUSHED_AFTER:
        return False, f"stale (pushed {meta['pushed_at']})"
    return True, "kept"


def main():
    ap = argparse.ArgumentParser(description="Discover a corpus of repos to scan.")
    ap.add_argument("--out", default="corpus/repos.json")
    ap.add_argument("--pages", type=int, default=PAGES)
    ap.add_argument("--pause", type=float, default=7.0,
                    help="seconds between code searches; the limit is 10/min")
    args = ap.parse_args()

    # Phase 1: collect unique repository names. No per-repo calls here.
    candidates = {}
    for provider, query in QUERIES:
        for page in range(1, args.pages + 1):
            encoded = query.replace(" ", "+").replace('"', "%22").replace("'", "%27")
            result = search(encoded, page)
            time.sleep(args.pause)
            if not result or not result.get("items"):
                break
            for item in result["items"]:
                candidates.setdefault(item["repository"]["full_name"], provider)
            print(f"  {provider:11} page {page}: {len(result['items'])} files, "
                  f"{len(candidates)} unique repos (of {result.get('total_count', 0):,})",
                  flush=True)
            if len(result["items"]) < PER_PAGE:
                break

    # Phase 2: enrich in batches, then filter.
    print(f"\nfetching metadata for {len(candidates)} repos", flush=True)
    metas = batch_meta(sorted(candidates))

    seen, rejected = {}, {}
    for full, provider in candidates.items():
        meta = metas.get(full)
        ok, why = keep(meta)
        if ok:
            meta["found_via"] = provider
            seen[full] = meta
        else:
            rejected[full] = why

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump({
            "generated_on": time.strftime("%Y-%m-%d"),
            "filters": {
                "min_stars": MIN_STARS, "max_kb": MAX_KB,
                "pushed_after": PUSHED_AFTER, "no_forks": True, "no_archived": True,
            },
            "queries": [{"provider": p, "query": q} for p, q in QUERIES],
            "rejected_count": len(rejected),
            "repos": sorted(seen.values(), key=lambda r: -r["stars"]),
        }, fh, indent=1)

    print(f"\n{len(seen)} repos kept, {len(rejected)} rejected -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
