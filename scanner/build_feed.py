#!/usr/bin/env python3
"""Compile the manifests into a single JSON feed.

The manifests are YAML because humans and providers author them. The feed is
JSON because the clients that consume it should need no dependencies at all:
Node reads it with JSON.parse, and so does everything else.

    python3 scanner/build_feed.py
"""

import datetime
import json
import os
import sys

import yaml

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MANIFEST_DIR = os.path.join(ROOT, "manifests")
OUT = os.path.join(ROOT, "feed", "feed.json")


def build():
    providers = []
    artifacts = []

    for name in sorted(os.listdir(MANIFEST_DIR)):
        if not name.endswith((".yaml", ".yml")):
            continue
        with open(os.path.join(MANIFEST_DIR, name)) as fh:
            doc = yaml.safe_load(fh)
        if not doc or "artifacts" not in doc:
            continue

        provider = doc["provider"]
        providers.append({
            "provider": provider,
            "manifest": name,
            "source_license": doc.get("source_license"),
            "source_notice": doc.get("source_notice"),
            "sources": doc.get("sources", []),
            "artifact_count": len(doc.get("artifacts") or []),
        })
        markers = (doc.get("context") or {}).get("file_markers") or []
        for art in doc.get("artifacts") or []:
            if art.get("status") == "active":
                continue
            entry = dict(art)
            entry["provider"] = provider
            entry["file_markers"] = markers
            # Dates round-trip through YAML as date objects.
            for key in ("retires_on", "announced_on"):
                if entry.get(key) is not None:
                    entry[key] = str(entry[key])
            artifacts.append(entry)

    feed = {
        "feed_version": 1,
        "generated_on": datetime.date.today().isoformat(),
        "providers": providers,
        "artifacts": artifacts,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(feed, fh, indent=1, sort_keys=False)
        fh.write("\n")

    size = os.path.getsize(OUT)
    print(f"{OUT}")
    print(f"{len(providers)} providers, {len(artifacts)} artifacts, {size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(build())
