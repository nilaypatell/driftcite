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

    # ---- held back until the client that can read them safely is published ----
    #
    # require_context is what stops an Azure retirement date being reported to
    # somebody calling Anthropic directly. It landed in bin/driftcite.mjs and in
    # the manifests on the same day, but npm still serves 0.2.0, which predates
    # the field and ignores it. The published CLI fetches THIS file at runtime,
    # so shipping these artifacts told every `npx driftcite` user that
    # claude-sonnet-4-5 and gpt-4.1 were breaking, citing Microsoft, in code
    # that never touched Azure. A false finding costs more than a missing one,
    # and data must never arrive ahead of the gate that makes it safe.
    #
    # DELETE THIS BLOCK once a release carrying require_context is the version
    # on npm. The manifests keep the artifacts eitherhow; only the published
    # feed withholds them.
    gated = [a for a in artifacts if a.get("require_context")]
    if gated:
        artifacts = [a for a in artifacts if not a.get("require_context")]
        held = {}
        for a in gated:
            held[a["provider"]] = held.get(a["provider"], 0) + 1
        for name, entry in providers.items():
            entry["artifact_count"] -= held.get(name, 0)
        providers = {k: v for k, v in providers.items() if v["artifact_count"] > 0}
        summary = ", ".join(f"{n} from {p}" for p, n in sorted(held.items()))
        print(f"held back {len(gated)} artifact(s) needing require_context: {summary}")
        print("  the published CLI predates that field and would report them")
        print("  everywhere; publish a release carrying it, then delete the")
        print("  hold-back block in scanner/build_feed.py.")

    # Two providers claiming the same literal put two different death dates on
    # one line of somebody's code. Azure shipped o1-pro retiring 2026-10-21
    # while OpenAI's manifest already had it retiring 2026-10-23, and because
    # the Azure SDK is imported from the `openai` package, a single file
    # satisfies both marker sets and both fire. Resold models belong to the
    # vendor that published the ID; the reseller's manifest leaves them out.
    owners = {}
    for art in artifacts:
        for lit in (art.get("match") or {}).get("literals") or []:
            owners.setdefault(lit, set()).add(art["provider"])
    collisions = {lit: sorted(who) for lit, who in owners.items() if len(who) > 1}
    if collisions:
        print("refusing to build: one literal, two providers, two death dates")
        for lit, who in sorted(collisions.items()):
            print(f"  {lit!r} claimed by {', '.join(who)}")
        print("Drop it from the reseller's manifest; the vendor that published")
        print("the ID owns it.")
        return 1

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
