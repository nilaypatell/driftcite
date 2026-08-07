#!/usr/bin/env python3
"""Compile the manifests into a single JSON feed.

The manifests are YAML because humans and providers author them. The feed is
JSON because the clients that consume it should need no dependencies at all:
Node reads it with JSON.parse, and so does everything else.

    python3 scanner/build_feed.py
    python3 scanner/build_feed.py --self-test  # check the feed already shipped
"""

import argparse
import datetime
import json
import os
import sys

import yaml

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MANIFEST_DIR = os.path.join(ROOT, "manifests")
OUT = os.path.join(ROOT, "feed", "feed.json")

# The vocabulary the CLI actually branches on. `active` never reaches the feed;
# it is how a manifest records a model that is still fine, so that adding the
# retirement later is an edit rather than a new entry.
FEED_STATUS = {"removed", "retired", "deprecated"}
FEED_SEVERITY = {"breaking", "warning", "info"}


def contradicted_notes(artifacts, today=None):
    """Artifacts whose note reads as contradicting their own header.

    status and severity are computed by the CLI against the day it runs: a
    retires_on already past makes a finding print as retired, breaking, and
    "DIED n days ago". The note printed underneath is prose frozen on the day
    the manifest was written. anthropic.yaml carried four models with
    status: deprecated and a note reading "Deprecated, retires <date>" for a
    date that had already gone by, so the same finding said the model died n
    days ago and, on the next line, that it was still scheduled to die.

    Nothing generated can land here: openapi_diff pins every note to the two
    refs it compared and the day it compared them, and a note about a
    comparison that already happened cannot come untrue. Curated notes need the
    same discipline — state the announcement and its date, not a countdown —
    and until they have it, the build names them rather than shipping the
    contradiction quietly.
    """
    today = today or datetime.date.today()
    stale = []
    for art in artifacts:
        # `removed` is as terminal as `retired` — a parameter or header the
        # provider stopped accepting is not counting down to anything. Only
        # the statuses that still imply a future event can be overtaken.
        if not art.get("retires_on") or art.get("status") in ("retired", "removed"):
            continue
        try:
            when = datetime.date.fromisoformat(str(art["retires_on"]))
        except ValueError:
            continue
        if when < today:
            stale.append(art)
    return stale


def build():
    # One entry per provider. A provider can have several manifest files (a
    # generated spec diff plus a curated model list), and counting files as
    # providers overstated coverage.
    providers = {}
    artifacts = []
    # Which file each id arrived in, so a complaint about an artifact can name
    # the file to open rather than leaving the reader to grep twenty manifests.
    origin = {}

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
            origin.setdefault(art.get("id"), []).append(name)
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

    # A replacement must not be something this feed already knows is dying.
    # The page sent text-davinci-003 to gpt-3.5-turbo-instruct, which the same
    # page shuts down on 2026-09-28, and the autofix bot rewrote real
    # repositories from a model that was dead to one with seven weeks left.
    # Worse, no artifact covered the destination, so the next scan saw nothing
    # and driftcite could not flag its own output. A manifest must follow the
    # chain to the end of the line; the hops are all on the provider's page.
    # Scoped to one provider, because a reseller's clock is not the vendor's.
    # Azure retires gpt-4.1 on 2027-04-14 and OpenAI does not retire it at all,
    # so OpenAI recommending gpt-4.1 is sound advice for an OpenAI caller and
    # only looks like a chain if the two catalogues are read as one. That
    # confusion is the same one require_context exists to prevent, and reading
    # it back into the build would refuse a feed over a conflict nobody has.
    dying = {}
    for art in artifacts:
        for lit in (art.get("match") or {}).get("literals") or []:
            dying[(art["provider"], lit)] = art["id"]
    onward = []
    for art in artifacts:
        rep = art.get("replacement")
        key = (art["provider"], rep)
        if rep and key in dying and dying[key] != art["id"]:
            onward.append((art["id"], rep, dying[key]))
    if onward:
        print("refusing to build: a replacement is itself scheduled to die")
        for who, rep, target in sorted(onward):
            print(f"  {who}\n    recommends {rep!r}, which this feed carries as {target}")
        print("Follow the provider's chain to a model it is not also retiring.")
        return 1

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

    # A generated manifest can now exist while publishing nothing, because a
    # refresh that withheld every observation still writes the observation
    # down. That record is worth keeping and is not coverage: listing such a
    # provider would put a number in the README no user can ever see a finding
    # from. It is dropped from the count and said out loud.
    empty = sorted(p for p, e in providers.items() if e["artifact_count"] == 0)
    if empty:
        print(f"not counted as covered, manifest present but nothing publishable: "
              f"{', '.join(empty)}")
        providers = {k: v for k, v in providers.items() if v["artifact_count"] > 0}

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

    # Warned rather than refused. The contradiction is in one field of a hand
    # written manifest and the feed around it is correct, so blocking every
    # provider's drift over somebody's wording would cost more than it saves.
    # It is printed on every build so it cannot quietly become permanent.
    stale = contradicted_notes(artifacts)
    if stale:
        print(f"\n{len(stale)} note(s) the calendar has overtaken:")
        for art in stale:
            where = sorted(set(origin.get(art["id"]) or ["?"]))[0]
            print(f"  {where}: {art['id']} retires_on {art['retires_on']} is past,")
            print(f"    status says {art['status']!r}, note says {art['note']!r}")
        print("  The CLI will print these as retired and DIED n days ago while the")
        print("  note beside them still counts down. Restate the note as the")
        print("  announcement and its date, the way generated notes are written.")
    return 0


def self_test():
    """Check the feed this repository actually ships.

    Every other self-test here proves a filter behaves on a fixture. None of
    them opens feed/feed.json, so nothing has ever checked the one file every
    `npx driftcite` run downloads. A finding with no evidence URL cannot be
    cited, one with no literal can never match, one with a status the CLI does
    not know silently sorts as info, and a retires_on that Date cannot parse
    turns into NaN and quietly loses its deadline. All four ship fine and fail
    at the user.
    """
    # The contradiction check is pinned on a fixture as well as run over the
    # feed, because the day it finds nothing is the day nobody can tell it
    # apart from a check that stopped working.
    day = datetime.date(2026, 8, 6)
    overtaken = {"id": "p/model_id/m", "status": "deprecated", "retires_on": "2026-08-05",
                 "note": "Deprecated, retires 2026-08-05."}
    assert contradicted_notes([overtaken], day) == [overtaken]
    assert contradicted_notes([dict(overtaken, status="retired",
                                    note="Retired. Calls return 404.")], day) == []
    assert contradicted_notes([dict(overtaken, retires_on="2026-08-07")], day) == []
    assert contradicted_notes([{"id": "p/endpoint//v1/x", "status": "removed"}], day) == []

    if not os.path.exists(OUT):
        print(f"no feed at {OUT}; run scanner/build_feed.py first")
        return 1
    with open(OUT) as fh:
        feed = json.load(fh)

    artifacts = feed.get("artifacts") or []
    problems = []
    seen = set()
    for i, art in enumerate(artifacts):
        art_id = art.get("id")
        where = art_id or f"artifacts[{i}]"
        if not art_id:
            problems.append(f"{where}: no id")
        elif art_id in seen:
            problems.append(f"{where}: id appears more than once")
        else:
            seen.add(art_id)
        if not art.get("kind"):
            problems.append(f"{where}: no kind")
        if not art.get("evidence"):
            problems.append(f"{where}: no evidence URL; every fact cites the provider")
        elif not str(art["evidence"]).startswith("http"):
            problems.append(f"{where}: evidence {art['evidence']!r} is not a URL")
        if not (art.get("match") or {}).get("literals"):
            problems.append(f"{where}: no literals, so it can never match anything")
        if art.get("status") not in FEED_STATUS:
            problems.append(f"{where}: status {art.get('status')!r} is not one of "
                            f"{sorted(FEED_STATUS)}")
        if art.get("severity") not in FEED_SEVERITY:
            problems.append(f"{where}: severity {art.get('severity')!r} is not one of "
                            f"{sorted(FEED_SEVERITY)}")
        if not art.get("provider"):
            problems.append(f"{where}: no provider")
        for key in ("retires_on", "announced_on"):
            if art.get(key) is None:
                continue
            try:
                datetime.date.fromisoformat(str(art[key]))
            except ValueError:
                problems.append(f"{where}: {key} {art[key]!r} is not a date")

    if problems:
        print(f"feed self-test: {len(problems)} problem(s) in {len(artifacts)} artifacts")
        for line in problems[:40]:
            print(f"  {line}")
        if len(problems) > 40:
            print(f"  ... +{len(problems) - 40} more")
        return 1

    # Named, not fatal, for the reason given in build(): the contradiction is a
    # wording defect in a curated manifest, and the feed around it is sound.
    stale = contradicted_notes(artifacts)
    print(f"build_feed self-test: ok, {len(artifacts)} artifacts, "
          f"{len(feed.get('providers') or [])} providers")
    if stale:
        print(f"  {len(stale)} note(s) the calendar has overtaken, listed on build:")
        for art in stale:
            print(f"    {art['id']}: retires_on {art['retires_on']}, "
                  f"status {art['status']!r}, note {art['note']!r}")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Compile the manifests into feed/feed.json.")
    ap.add_argument("--self-test", action="store_true",
                    help="validate the feed already in feed/, no network")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    return build()


if __name__ == "__main__":
    sys.exit(main())
