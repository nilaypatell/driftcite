#!/usr/bin/env python3
"""Scan the discovered corpus and count what is actually broken.

Each repository is shallow-cloned, scanned with the ordinary driftcite CLI,
and deleted. Nothing is kept except the findings. No repository is modified,
no pull request is opened, and no contact is made with any maintainer.

Two rules, fixed before any results were seen:

  * results are reported in aggregate; a repository is named publicly only if
    someone is showing up with a fix
  * every repository attempted is recorded, including failures and clean
    results, so the denominator is honest

Resumable: progress is written after each repository, so a long run can be
stopped and restarted without losing or double-counting work.

    python3 scripts/corpus_scan.py --repos corpus/repos.json --out corpus/results.json
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CLI = os.path.join(ROOT, "bin", "driftcite.mjs")


def clone(full_name, dest):
    url = f"https://github.com/{full_name}.git"
    r = subprocess.run(
        ["git", "clone", "--depth", "1", "--quiet", "--filter=blob:none", url, dest],
        capture_output=True, text=True, timeout=300,
    )
    return r.returncode == 0


def scan(path):
    """Provider drift only. --no-deps keeps this off the npm and PyPI
    registries entirely: scanning thousands of repositories against them would
    be a burst of traffic those services never asked for, and the novel claim
    here is about hosted API drift anyway."""
    try:
        r = subprocess.run(
            ["node", CLI, path, "--json", "--no-deps", "--offline"],
            capture_output=True, text=True, timeout=1800,
        )
    except subprocess.TimeoutExpired:
        return "timeout"
    if not r.stdout.strip():
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


def load(path, default):
    if os.path.exists(path):
        with open(path) as fh:
            return json.load(fh)
    return default


def main():
    ap = argparse.ArgumentParser(description="Scan a corpus of public repositories.")
    ap.add_argument("--repos", default="corpus/repos.json")
    ap.add_argument("--out", default="corpus/results.json")
    ap.add_argument("--limit", type=int, default=0, help="stop after N repos")
    args = ap.parse_args()

    corpus = load(args.repos, None)
    if not corpus:
        sys.exit(f"no corpus at {args.repos}; run corpus_discover.py first")
    repos = corpus["repos"]
    if args.limit:
        repos = repos[: args.limit]

    state = load(args.out, {"scanned": {}, "started": time.strftime("%Y-%m-%d")})
    done = state["scanned"]

    for i, repo in enumerate(repos, 1):
        full = repo["full_name"]
        if full in done:
            continue

        tmp = tempfile.mkdtemp(prefix="driftcite-corpus-")
        try:
            if not clone(full, tmp):
                done[full] = {"status": "clone_failed"}
            else:
                result = scan(tmp)
                if result == "timeout":
                    done[full] = {"status": "timeout"}
                elif result is None:
                    done[full] = {"status": "scan_failed"}
                else:
                    findings = result.get("findings", [])
                    breaking = [f for f in findings if f.get("severity") == "breaking"]
                    done[full] = {
                        "status": "ok",
                        "stars": repo["stars"],
                        "language": repo.get("language"),
                        "findings": len(findings),
                        "breaking": len(breaking),
                        # artifact ids only, never file contents
                        "artifacts": sorted({f["artifact"] for f in findings}),
                    }
        except Exception as exc:
            done[full] = {"status": f"error: {type(exc).__name__}"}
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        with open(args.out, "w") as fh:
            json.dump(state, fh, indent=1)

        entry = done[full]
        mark = ""
        if entry.get("status") == "ok" and entry["breaking"]:
            mark = f"  <-- {entry['breaking']} breaking"
        print(f"[{i}/{len(repos)}] {full[:52]:52} {entry['status']}{mark}", flush=True)

    ok = [v for v in done.values() if v.get("status") == "ok"]
    affected = [v for v in ok if v["breaking"]]
    print(f"\nscanned {len(ok)} repos, {len(affected)} carry breaking drift")
    return 0


if __name__ == "__main__":
    sys.exit(main())
