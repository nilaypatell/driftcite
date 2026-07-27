#!/usr/bin/env python3
"""Turn corpus results into the numbers we would publish.

Deliberately conservative. Every rate is reported against the number of
repositories actually scanned, never against the number that happened to
produce a finding, and repositories that failed to clone or scan are counted
and disclosed rather than dropped to flatter the denominator.

    python3 scripts/corpus_report.py --results corpus/results.json
"""

import argparse
import json
import sys
from collections import Counter


def main():
    ap = argparse.ArgumentParser(description="Summarise a corpus scan.")
    ap.add_argument("--results", default="corpus/results.json")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    with open(args.results) as fh:
        scanned = json.load(fh)["scanned"]

    ok = {k: v for k, v in scanned.items() if v.get("status") == "ok"}
    failed = {k: v for k, v in scanned.items() if v.get("status") != "ok"}
    affected = {k: v for k, v in ok.items() if v.get("breaking")}

    total_findings = sum(v["findings"] for v in ok.values())
    total_breaking = sum(v["breaking"] for v in ok.values())

    artifacts = Counter()
    providers = Counter()
    for v in ok.values():
        for a in v.get("artifacts", []):
            artifacts[a] += 1
            providers[a.split("/")[0]] += 1

    # How concentrated is the problem? If a handful of dead identifiers explain
    # most of it, that is a more useful finding than a long tail would be.
    top = artifacts.most_common(15)

    by_pop = {"under 100 stars": [], "100 to 1k": [], "1k to 10k": [], "over 10k": []}
    for v in ok.values():
        s = v.get("stars", 0)
        bucket = ("under 100 stars" if s < 100 else
                  "100 to 1k" if s < 1000 else
                  "1k to 10k" if s < 10000 else "over 10k")
        by_pop[bucket].append(1 if v.get("breaking") else 0)

    report = {
        "attempted": len(scanned),
        "scanned": len(ok),
        "failed": len(failed),
        "failure_reasons": dict(Counter(v.get("status") for v in failed.values())),
        "repos_with_breaking_drift": len(affected),
        "share_with_breaking_drift": round(100 * len(affected) / max(len(ok), 1), 1),
        "total_findings": total_findings,
        "total_breaking": total_breaking,
        "median_breaking_when_affected": (
            sorted(v["breaking"] for v in affected.values())[len(affected) // 2]
            if affected else 0
        ),
        "worst_repo_breaking_count": max((v["breaking"] for v in ok.values()), default=0),
        "by_provider": dict(providers.most_common()),
        "most_common_dead_identifiers": [{"artifact": a, "repos": n} for a, n in top],
        "by_popularity": {
            k: {"repos": len(v), "share_affected": round(100 * sum(v) / len(v), 1)}
            for k, v in by_pop.items() if v
        },
    }

    if args.json:
        json.dump(report, sys.stdout, indent=1)
        print()
        return 0

    r = report
    print(f"\n{'=' * 66}")
    print(f"  {r['scanned']} public repositories scanned "
          f"({r['failed']} failed, disclosed below)")
    print(f"  {r['repos_with_breaking_drift']} of them ({r['share_with_breaking_drift']}%) "
          f"call an API that is already dead")
    print(f"{'=' * 66}\n")

    print(f"  total findings          {r['total_findings']:,}")
    print(f"  of which breaking       {r['total_breaking']:,}")
    print(f"  median when affected    {r['median_breaking_when_affected']}")
    print(f"  worst single repo       {r['worst_repo_breaking_count']}\n")

    print("  by provider")
    for p, n in r["by_provider"].items():
        print(f"    {p:14} {n} repos")

    print("\n  most common dead identifiers")
    for row in r["most_common_dead_identifiers"]:
        print(f"    {row['repos']:4}  {row['artifact']}")

    print("\n  by popularity")
    for bucket, d in r["by_popularity"].items():
        print(f"    {bucket:17} {d['repos']:4} repos, {d['share_affected']}% affected")

    if r["failure_reasons"]:
        print("\n  failures (counted, not hidden)")
        for reason, n in r["failure_reasons"].items():
            print(f"    {reason:20} {n}")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
