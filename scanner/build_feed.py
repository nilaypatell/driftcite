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
    # One entry per provider. A provider can have several manifest files (a
    # generated spec diff plus a curated model list), and counting files as
    # providers overstated coverage.
    providers = {}
    artifacts = []

    for name in sorted(os.listdir(MANIFEST_DIR)):
        if not name.endswith((".yaml", ".yml")):
            continue
        with open(os.path.join(MANIFEST_DIR, name)) as fh:
            doc = yaml.safe_load(fh)
        if not doc or "artifacts" not in doc:
            continue

        provider = doc["provider"]
        entry = providers.setdefault(provider, {
            "provider": provider,
            "manifests": [],
            "source_license": None,
            "source_notice": None,
            "sources": [],
            "artifact_count": 0,
        })
        entry["manifests"].append(name)
        entry["source_license"] = entry["source_license"] or doc.get("source_license")
        entry["source_notice"] = entry["source_notice"] or doc.get("source_notice")
        entry["sources"] = list(dict.fromkeys(entry["sources"] + (doc.get("sources") or [])))
        entry["artifact_count"] += len(doc.get("artifacts") or [])
        markers = (doc.get("context") or {}).get("file_markers") or []
        for art in doc.get("artifacts") or []:
            if art.get("status") == "active":
                continue
            record = dict(art)
            record["provider"] = provider
            record["file_markers"] = markers
            # Dates round-trip through YAML as date objects.
            for key in ("retires_on", "announced_on"):
                if record.get(key) is not None:
                    record[key] = str(record[key])
            artifacts.append(record)

    feed = {
        "feed_version": 1,
        "generated_on": datetime.date.today().isoformat(),
        "providers": sorted(providers.values(), key=lambda p: p["provider"]),
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
