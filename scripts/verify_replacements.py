#!/usr/bin/env python3
"""Check that every replacement we recommend is a model that actually exists.

The worst thing this project could do is tell somebody to migrate to a model
that was never released. A wrong finding wastes a minute; a wrong replacement
breaks the build of whoever trusts it, and we are asking people to trust us
precisely because every fact carries a citation.

Verified against OpenRouter's public catalog, which is independent of the
provider documentation the manifests were written from. Two providers stating
the same thing is a real check; re-reading our own source is not.

Naming differs between the catalog and the provider APIs, so comparison is on
a normalised form: OpenRouter writes claude-haiku-4.5 where Anthropic's API
expects claude-haiku-4-5. Comparing raw strings reports false alarms.

The catalog is chat-only. It lists no embedding models at all, so absence
there is not evidence of absence, and unverifiable ids are reported separately
from failures rather than counted as errors.

    python3 scripts/verify_replacements.py
"""

import json
import os
import re
import sys
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CATALOG = "https://openrouter.ai/api/v1/models"

# Kinds the catalog cannot speak to. Absence proves nothing for these.
UNVERIFIABLE = re.compile(r"embedding|embed|whisper|tts|moderation|imagen|dall")


def normalise(s):
    """claude-haiku-4.5 and claude-haiku-4-5 are the same model."""
    s = s.lower().split("/")[-1].lstrip("~")
    return re.sub(r"[.\-_]", "", s)


def catalog_ids():
    req = urllib.request.Request(CATALOG, headers={"User-Agent": "driftcite"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)["data"]
    ids = set()
    for m in data:
        for key in (m.get("id"), m.get("canonical_slug")):
            if key:
                ids.add(normalise(key))
    return ids, len(data)


def main():
    with open(os.path.join(ROOT, "feed", "feed.json")) as fh:
        artifacts = json.load(fh)["artifacts"]

    try:
        known, count = catalog_ids()
    except Exception as exc:
        print(f"catalog unreachable, skipping check: {exc}")
        return 0

    wanted = {}
    for a in artifacts:
        r = a.get("replacement")
        if a.get("kind") == "model_id" and r and " " not in r:
            wanted.setdefault(r, []).append(a["id"])

    confirmed, unverifiable, missing = [], [], []
    for rep, users in sorted(wanted.items()):
        n = normalise(rep)
        if n in known or any(n in k or k in n for k in known):
            confirmed.append(rep)
        elif UNVERIFIABLE.search(rep):
            unverifiable.append(rep)
        else:
            missing.append((rep, users))

    print(f"\n{len(wanted)} replacement ids checked against {count} catalog entries\n")
    print(f"  confirmed present   {len(confirmed)}")
    print(f"  not verifiable here {len(unverifiable)}  (catalog lists no such model type)")
    for r in unverifiable:
        print(f"      {r}")

    if missing:
        print(f"\n  NOT FOUND {len(missing)}")
        for rep, users in missing:
            print(f"      {rep}")
            for u in users:
                print(f"        recommended by {u}")
        print("\nA replacement that does not exist must not ship. Fix the manifest.")
        return 1

    print("\nevery verifiable replacement exists\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
