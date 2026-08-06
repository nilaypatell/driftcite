#!/usr/bin/env python3
"""Ask the APIs themselves whether they are dying, and write down the answer.

RFC 8594 defines a `Sunset` response header carrying the date an endpoint
stops working, and RFC 9745 defines `Deprecation` for the date it was
deprecated. A provider sending either is announcing a retirement in band, on
the endpoint itself, months before anybody writes a blog post about it.
GitHub exposes `Deprecation, Sunset, Warning` in its CORS policy, so this is
a live mechanism and not a specification curiosity.

This is the endpoint twin of probe_models: it turns a claim into an
observation. Two things get recorded, both worth having:

  - An endpoint a manifest says was removed, answering 404 or 410. That is
    witnessed confirmation of a fact we currently only cite.
  - A live endpoint that has started sending Sunset. That is drift nobody has
    announced yet, and it becomes a work order to curate.

Only HEAD is ever sent, and only to paths with no template segment. A prober
that guesses at path parameters or sends anything mutating would be a tool
that changes the systems it is measuring, so it does not do either. No API
key is needed: an unauthenticated 401 still carries the response headers,
which is the whole point.

    python3 scanner/probe_sunset.py             # probe and write
    python3 scanner/probe_sunset.py --dry-run   # report without writing
    python3 scanner/probe_sunset.py --self-test # logic only, no network

Bases live under sunset_probes: in providers.yaml.
"""

import argparse
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request

import yaml

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PROVIDERS_PATH = os.path.join(ROOT, "providers.yaml")
MANIFEST_DIR = os.path.join(ROOT, "manifests")
STATE_PATH = os.path.join(MANIFEST_DIR, "observed-sunset.json")

# Politeness, not a rate limit we are near. One request every 300ms against a
# handful of paths per provider is a rounding error to anyone we probe.
DELAY_S = 0.3
# Per provider, per run. Named in the output when it bites: a cap nobody is
# told about reads as "we checked everything" when we did not.
MAX_PATHS = 40


def load_config():
    with open(PROVIDERS_PATH) as fh:
        doc = yaml.safe_load(fh) or {}
    return doc.get("sunset_probes") or {}


def probeable_paths(provider, extra):
    """Endpoint paths worth a HEAD, newest manifests first.

    Templated paths are dropped: filling in {owner} or {client_id} means
    inventing an identifier, and a probe that invents its input is measuring
    something other than the API.
    """
    paths = []
    for name in sorted(os.listdir(MANIFEST_DIR)):
        if not name.endswith((".yaml", ".yml")):
            continue
        with open(os.path.join(MANIFEST_DIR, name)) as fh:
            doc = yaml.safe_load(fh) or {}
        if doc.get("provider") != provider:
            continue
        for art in doc.get("artifacts") or []:
            if art.get("kind") != "endpoint":
                continue
            for lit in (art.get("match") or {}).get("literals") or []:
                if lit.startswith("/") and "{" not in lit:
                    paths.append((lit, art.get("id")))
    for p in extra or []:
        paths.append((p, None))
    seen, out = set(), []
    for path, art in paths:
        if path in seen:
            continue
        seen.add(path)
        out.append((path, art))
    return out


def head(url):
    """Status and the headers that matter. Never anything but HEAD."""
    req = urllib.request.Request(url, method="HEAD", headers={
        "User-Agent": "driftcite-sunset-probe",
        "Accept": "*/*",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status, headers = resp.status, resp.headers
    except urllib.error.HTTPError as exc:
        # A 401 or 404 is a perfectly good observation, and carries headers.
        status, headers = exc.code, exc.headers
    except (urllib.error.URLError, TimeoutError) as exc:
        return None, {}, str(exc)

    picked = {}
    for key in ("sunset", "deprecation", "link", "warning"):
        val = headers.get(key)
        if val:
            picked[key] = val
    # A Link header is only interesting when it points at a sunset policy.
    if "link" in picked and "sunset" not in picked["link"].lower():
        picked.pop("link")
    return status, picked, None


def observe(entry, path, artifact, status, headers, today):
    """Fold one probe into the record. Returns an event worth printing."""
    rec = entry.setdefault("paths", {}).setdefault(path, {"first_probed": today})
    if artifact:
        rec["artifact"] = artifact
    rec["last_probed"] = today
    previous_status = rec.get("status")
    previous_headers = rec.get("headers") or {}
    rec["status"] = status
    rec["headers"] = headers

    events = []
    if previous_status is None:
        rec["first_status"] = status
        if headers:
            events.append(f"announces {', '.join(sorted(headers))} on first sight")
    elif previous_status != status:
        events.append(f"status {previous_status} -> {status}")

    new_headers = set(headers) - set(previous_headers)
    if previous_status is not None and new_headers:
        events.append(f"now sends {', '.join(sorted(new_headers))}")
    gone_headers = set(previous_headers) - set(headers)
    if gone_headers:
        events.append(f"stopped sending {', '.join(sorted(gone_headers))}")

    if events:
        rec.setdefault("events", []).append({"on": today, "what": events})
    return events


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


def probe(dry_run=False):
    config = load_config()
    if not config:
        print("no sunset_probes configured in providers.yaml")
        return 1

    state = load_state()
    today = datetime.date.today().isoformat()
    announcements, confirmations, probed = [], [], 0

    for provider in sorted(config):
        cfg = config[provider]
        base = cfg["base"].rstrip("/")
        paths = probeable_paths(provider, cfg.get("watch_paths"))
        print(f"\n{provider}  ({len(paths)} probeable path(s))")
        if len(paths) > MAX_PATHS:
            print(f"  capped at {MAX_PATHS}; {len(paths) - MAX_PATHS} not probed this run")
            paths = paths[:MAX_PATHS]
        if not paths:
            print("  nothing to probe: no endpoint artifacts, no watch_paths")
            continue

        entry = state["providers"].setdefault(provider, {"base": base,
                                                         "first_probed": today})
        if dry_run:
            import copy
            entry = copy.deepcopy(entry)

        for path, artifact in paths:
            status, headers, err = head(base + path)
            time.sleep(DELAY_S)
            if status is None:
                print(f"  ! {path}: {err}")
                continue
            probed += 1
            events = observe(entry, path, artifact, status, headers, today)
            flag = " ".join(sorted(headers)) or "-"
            print(f"  {status:>3}  {path}  [{flag}]")
            for ev in events:
                print(f"       {ev}")
            if headers.get("sunset") or headers.get("deprecation"):
                announcements.append((provider, path, headers))
            elif artifact and status in (404, 410):
                confirmations.append((provider, path, status, artifact))

    if not dry_run and probed:
        save_state(state)

    print()
    if announcements:
        print("ANNOUNCED IN BAND — the endpoint says it is dying:")
        for provider, path, headers in announcements:
            detail = "; ".join(f"{k}: {v}" for k, v in sorted(headers.items()))
            print(f"  {provider}{path}\n    {detail}")
    if confirmations:
        print("CONFIRMED GONE — a cited removal, now witnessed:")
        for provider, path, status, artifact in confirmations:
            print(f"  {artifact} -> {status}")
    if not announcements and not confirmations:
        print("no endpoint announced a sunset and none newly confirmed")
    print(f"{probed} path(s) probed")
    return 0


def self_test():
    today, tomorrow = "2026-08-06", "2026-08-07"
    entry = {}
    ev = observe(entry, "/v1/old", "p/endpoint//v1/old", 200, {}, today)
    assert ev == [], ev
    ev = observe(entry, "/v1/old", None, 200, {"sunset": "Wed, 11 Nov 2026 00:00:00 GMT"}, tomorrow)
    assert ev == ["now sends sunset"], ev
    ev = observe(entry, "/v1/old", None, 410, {"sunset": "x"}, tomorrow)
    assert ev == ["status 200 -> 410"], ev
    ev = observe(entry, "/v1/old", None, 410, {}, tomorrow)
    assert ev == ["stopped sending sunset"], ev
    assert entry["paths"]["/v1/old"]["first_status"] == 200
    assert entry["paths"]["/v1/old"]["artifact"] == "p/endpoint//v1/old"

    fresh = {}
    ev = observe(fresh, "/v1/new", None, 200, {"deprecation": "true"}, today)
    assert ev == ["announces deprecation on first sight"], ev
    print("self-test: ok")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Probe endpoints for RFC 8594 Sunset headers.")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    return probe(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
