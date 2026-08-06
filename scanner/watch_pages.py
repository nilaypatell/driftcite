#!/usr/bin/env python3
"""Watch the prose pages the curated manifests cite, and say when one moves.

The generated manifests refresh themselves from spec diffs. The curated ones
(model retirements, mostly) are transcribed from documentation pages by hand,
which means they rot silently the day a provider edits a page and nobody is
looking. This closes that hole with no API keys at all: fetch every URL the
manifests already cite as a source, hash the readable text, and report which
pages changed since last observed.

A changed page is not a finding. It is a work order: go read the page and
update the manifest it feeds. The output names the manifest files so the
curator does not have to remember which page belongs to what.

State lives in manifests/watched-pages.json. History only grows.

    python3 scanner/watch_pages.py             # fetch, compare, record
    python3 scanner/watch_pages.py --dry-run   # fetch and compare only
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request

import yaml

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MANIFEST_DIR = os.path.join(ROOT, "manifests")
STATE_PATH = os.path.join(MANIFEST_DIR, "watched-pages.json")

# Curated manifests only. Generated ones cite git compares, which are
# immutable by construction and pointless to watch.
GENERATED_SUFFIX = ".generated.yaml"


def watched_sources():
    """{url: [manifest files citing it]} across the hand-curated manifests."""
    out = {}
    for name in sorted(os.listdir(MANIFEST_DIR)):
        if not name.endswith((".yaml", ".yml")) or name.endswith(GENERATED_SUFFIX):
            continue
        with open(os.path.join(MANIFEST_DIR, name)) as fh:
            doc = yaml.safe_load(fh) or {}
        for url in doc.get("sources") or []:
            if url.startswith("http"):
                out.setdefault(url, []).append(name)
    return out


def normalize(body, content_type):
    """Readable text only, so a rotated nonce or timestamp in the page
    chrome does not read as the provider changing their deprecation policy."""
    text = body.decode("utf-8", errors="replace")
    if "html" in (content_type or ""):
        text = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", text)
        text = re.sub(r"(?s)<!--.*?-->", " ", text)
        text = re.sub(r"(?s)<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "driftcite-watch-pages",
        "Accept": "text/html, text/markdown, text/plain, */*",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read(), resp.headers.get("Content-Type", "")


def load_state():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as fh:
            return json.load(fh)
    return {"pages": {}}


def save_state(state):
    state["updated"] = datetime.date.today().isoformat()
    with open(STATE_PATH, "w") as fh:
        json.dump(state, fh, indent=2, sort_keys=True)
        fh.write("\n")


def watch(dry_run=False):
    sources = watched_sources()
    if not sources:
        print("no curated manifest cites any http source")
        return 1

    state = load_state()
    today = datetime.date.today().isoformat()
    changed, unreachable = [], []

    for url in sorted(sources):
        manifests = ", ".join(sources[url])
        try:
            body, ctype = fetch(url)
        except (urllib.error.URLError, TimeoutError) as exc:
            unreachable.append((url, str(exc)))
            print(f"! unreachable {url}\n    {exc}")
            continue

        digest = hashlib.sha256(normalize(body, ctype).encode()).hexdigest()
        rec = state["pages"].setdefault(url, {"first_seen": today, "manifests": []})
        rec["manifests"] = sources[url]
        rec["last_checked"] = today
        previous = rec.get("sha256")

        if previous is None:
            rec["sha256"] = digest
            rec["last_changed"] = today
            print(f"  baseline   {url}")
        elif previous != digest:
            rec["sha256"] = digest
            since = rec.get("last_changed", "?")
            rec["last_changed"] = today
            rec.setdefault("changes", []).append({"on": today})
            changed.append((url, since, manifests))
            print(f"  CHANGED    {url}")
        else:
            print(f"  unchanged  {url}")

    if not dry_run:
        save_state(state)

    print()
    if changed:
        print("CHANGED — the page moved, the manifest may not have:")
        for url, since, manifests in changed:
            print(f"  {url}")
            print(f"    unchanged since {since}, feeds: {manifests}")
    else:
        print("no watched page changed")
    if unreachable:
        print(f"{len(unreachable)} page(s) unreachable, named above, not recorded")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Watch cited documentation pages for edits.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    return watch(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
