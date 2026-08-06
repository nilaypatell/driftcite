#!/usr/bin/env python3
"""Probe every provider's live model list and record what appeared and vanished.

The curated manifests say a model retired because the provider's page said so.
This probe says it because we sent the request today and the ID was gone. That
is a different, stronger kind of evidence: a page can be reworded, but nobody
can reconstruct next year which IDs a provider was actually serving today
unless somebody was asking today. One GET per provider per day, well inside
every published rate limit.

State lives in manifests/observed-models.json and only grows. An ID that
vanishes keeps its first_seen and last_seen forever; the observation is the
asset.

The probe also audits the curated manifests both ways:
  - a manifest says retired, the provider still serves the ID  -> contradiction
  - an ID vanished from the live list and no manifest records it -> curate it

    python3 scanner/probe_models.py             # probe and write
    python3 scanner/probe_models.py --dry-run   # report without writing
    python3 scanner/probe_models.py --self-test # exercise the diff logic, no network

Providers are configured under model_lists: in providers.yaml, not here.
A provider whose key is absent from the environment is skipped by name,
never silently.
"""

import argparse
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

import yaml

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PROVIDERS_PATH = os.path.join(ROOT, "providers.yaml")
MANIFEST_DIR = os.path.join(ROOT, "manifests")
STATE_PATH = os.path.join(MANIFEST_DIR, "observed-models.json")


def load_config():
    with open(PROVIDERS_PATH) as fh:
        doc = yaml.safe_load(fh) or {}
    return doc.get("model_lists") or {}


def find_key(cfg):
    for name in cfg.get("key_env") or []:
        val = os.environ.get(name)
        if val:
            return val
    return None


def fetch_ids(cfg, key):
    """The provider's model IDs, right now. Raises on any failure: a probe
    that cannot reach the provider has observed nothing, and recording an
    empty list would read as every model vanishing at once."""
    url = cfg["url"]
    headers = {"User-Agent": "driftcite-probe", "Accept": "application/json"}
    auth = cfg.get("auth", "bearer")
    if auth == "bearer":
        headers["Authorization"] = f"Bearer {key}"
    elif auth == "x-api-key":
        headers["x-api-key"] = key
        headers["anthropic-version"] = "2023-06-01"
    elif auth == "query-key":
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}key={key}"
    else:
        raise ValueError(f"unknown auth style: {auth}")

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.load(resp)

    list_field, id_field = cfg["id_path"].split(".", 1)
    items = body.get(list_field)
    if not isinstance(items, list):
        raise ValueError(f"no list at '{list_field}' in response")
    strip = cfg.get("strip")
    ids = []
    for item in items:
        val = item.get(id_field)
        if not isinstance(val, str):
            continue
        if strip and val.startswith(strip):
            val = val[len(strip):]
        ids.append(val)
    if not ids:
        raise ValueError("response parsed but zero model IDs found")
    return sorted(set(ids))


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


def observe(entry, ids, today):
    """Fold today's live list into a provider's record. Returns the event,
    or None when nothing moved. IDs never leave `models`; a vanished ID
    keeps its dates, that is the entire point."""
    models = entry.setdefault("models", {})
    previously_live = {
        mid for mid, m in models.items()
        if m.get("last_seen") and not m.get("vanished_on")
    }
    now = set(ids)

    appeared = sorted(now - set(models))
    returned = sorted(m for m in now if models.get(m, {}).get("vanished_on"))
    vanished = sorted(previously_live - now)

    for mid in ids:
        rec = models.setdefault(mid, {"first_seen": today})
        rec["last_seen"] = today
        rec.pop("vanished_on", None)
    for mid in vanished:
        models[mid]["vanished_on"] = today

    if not (appeared or vanished or returned):
        return None
    event = {"on": today}
    if appeared:
        event["appeared"] = appeared
    if vanished:
        event["vanished"] = vanished
    if returned:
        event["returned"] = returned
    entry.setdefault("events", []).append(event)
    return event


def manifest_model_ids():
    """Every model_id artifact across every manifest, keyed by provider:
    {provider: {literal: status}}."""
    out = {}
    for name in sorted(os.listdir(MANIFEST_DIR)):
        if not name.endswith((".yaml", ".yml")):
            continue
        with open(os.path.join(MANIFEST_DIR, name)) as fh:
            doc = yaml.safe_load(fh) or {}
        provider = doc.get("provider")
        for art in doc.get("artifacts") or []:
            if art.get("kind") != "model_id":
                continue
            for lit in (art.get("match") or {}).get("literals") or []:
                out.setdefault(provider, {})[lit] = art.get("status")
    return out


def audit(provider, entry, curated):
    """The probe checking the manifests, and the manifests checking the probe."""
    findings = []
    known = curated.get(provider, {})
    live = {
        mid for mid, m in (entry.get("models") or {}).items()
        if not m.get("vanished_on")
    }
    for lit, status in sorted(known.items()):
        if status == "retired" and lit in live:
            findings.append(
                f"contradiction: manifest says {provider}/{lit} is retired, "
                f"the provider served it today")
    for mid, m in sorted((entry.get("models") or {}).items()):
        if m.get("vanished_on") and mid not in known:
            findings.append(
                f"unrecorded: {provider}/{mid} vanished {m['vanished_on']} "
                f"and no manifest records it — curate it")
    return findings


def probe(dry_run=False):
    config = load_config()
    if not config:
        print("no model_lists configured in providers.yaml")
        return 1

    state = load_state()
    today = datetime.date.today().isoformat()
    curated = manifest_model_ids()
    probed = skipped = 0
    all_audit = []

    for provider in sorted(config):
        cfg = config[provider]
        print(f"\n{provider}")
        key = find_key(cfg)
        if not key:
            envs = " or ".join(cfg.get("key_env") or [])
            print(f"  no key ({envs}), skipped")
            skipped += 1
            continue
        try:
            ids = fetch_ids(cfg, key)
        except (urllib.error.URLError, ValueError, TimeoutError, json.JSONDecodeError) as exc:
            print(f"  ! probe failed, nothing recorded: {exc}")
            continue

        probed += 1
        entry = state["providers"].setdefault(provider, {"endpoint": cfg["url"],
                                                         "first_probed": today})
        if dry_run:
            import copy
            entry = copy.deepcopy(entry)
        event = observe(entry, ids, today)
        print(f"  {len(ids)} models served")
        if event:
            for k in ("appeared", "vanished", "returned"):
                if event.get(k):
                    print(f"  {k}: {', '.join(event[k])}")
        else:
            print("  no change")
        all_audit += audit(provider, entry, curated)

    if all_audit:
        print("\nAUDIT")
        for line in all_audit:
            print(f"  {line}")

    if not dry_run and probed:
        save_state(state)

    print(f"\n{probed} probed, {skipped} skipped for missing keys")
    if probed == 0:
        print("nothing was observed today; set at least one key to record history")
    return 0


def self_test():
    """The diff and audit logic against synthetic days, no network."""
    today, tomorrow = "2026-08-06", "2026-08-07"
    entry = {}
    ev1 = observe(entry, ["m-old", "m-stays"], today)
    assert ev1["appeared"] == ["m-old", "m-stays"], ev1
    ev2 = observe(entry, ["m-stays", "m-new"], tomorrow)
    assert ev2["appeared"] == ["m-new"] and ev2["vanished"] == ["m-old"], ev2
    assert entry["models"]["m-old"]["vanished_on"] == tomorrow
    assert entry["models"]["m-old"]["first_seen"] == today
    ev3 = observe(entry, ["m-stays", "m-new"], tomorrow)
    assert ev3 is None
    ev4 = observe(entry, ["m-stays", "m-new", "m-old"], tomorrow)
    assert ev4["returned"] == ["m-old"] and "vanished_on" not in entry["models"]["m-old"]

    curated = {"p": {"m-retired": "retired", "m-old": "deprecated"}}
    entry2 = {}
    observe(entry2, ["m-retired", "m-old"], today)
    observe(entry2, ["m-retired"], tomorrow)
    lines = audit("p", entry2, curated)
    assert any("contradiction" in l and "m-retired" in l for l in lines), lines
    assert not any("m-old" in l for l in lines), lines
    entry3 = {}
    observe(entry3, ["m-mystery"], today)
    observe(entry3, ["m-other"], tomorrow)
    lines = audit("p", entry3, {"p": {}})
    assert any("unrecorded" in l and "m-mystery" in l for l in lines), lines
    print("self-test: ok")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Probe live model lists and record history.")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    return probe(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
