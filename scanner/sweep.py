#!/usr/bin/env python3
"""Sweep every repository you own and report drift in one place.

Two sources, both deterministic:
  1. Provider drift  -- retired model IDs, removed endpoints, dropped params
                        and enum values, matched against manifests whose facts
                        each carry an evidence URL.
  2. Registry drift  -- dependencies whose exact installed version the
                        maintainer deprecated (npm) or yanked (PyPI), quoted in
                        the maintainer's own words.

    python3 scanner/sweep.py ~/Desktop/quickcruit-*
    python3 scanner/sweep.py --parent ~/Desktop --match 'quickcruit-*'
    python3 scanner/sweep.py ~/code/repo --json
"""

import argparse
import fnmatch
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import registry  # noqa: E402
import scan  # noqa: E402

SEV = {"breaking": 0, "warning": 1, "info": 2}


def discover(parent, pattern):
    out = []
    for name in sorted(os.listdir(parent)):
        path = os.path.join(parent, name)
        if os.path.isdir(os.path.join(path, ".git")) and fnmatch.fnmatch(name, pattern):
            out.append(path)
    return out


def sweep(roots):
    index = scan.build_index(scan.load_manifests())
    results = []
    for root in roots:
        provider = []
        for path in scan.walk(root):
            provider.extend(scan.scan_file(path, index, root))
        provider = scan.dedupe(provider)
        deps, n_npm, n_pypi = registry.scan(root)
        results.append({
            "repo": os.path.basename(root),
            "path": root,
            "provider_findings": provider,
            "registry_findings": deps,
            "deps_checked": {"npm": n_npm, "pypi": n_pypi},
        })
    return results


def report(results):
    total_provider = sum(len(r["provider_findings"]) for r in results)
    total_registry = sum(len(r["registry_findings"]) for r in results)
    total_deps = sum(sum(r["deps_checked"].values()) for r in results)
    breaking = sum(
        1 for r in results for f in r["provider_findings"] if f["severity"] == "breaking"
    )

    print()
    print("=" * 72)
    print(f"  {len(results)} repositories | {total_deps:,} dependencies resolved")
    print(f"  {total_provider} provider findings ({breaking} breaking) | "
          f"{total_registry} maintainer-flagged dependency versions")
    print("=" * 72)

    clean = []
    for r in sorted(results, key=lambda x: -(len(x["provider_findings"]) + len(x["registry_findings"]))):
        n = len(r["provider_findings"]) + len(r["registry_findings"])
        if not n:
            clean.append(r["repo"])
            continue

        print(f"\n\n### {r['repo']}")
        print(f"    {r['deps_checked']['npm']} npm, {r['deps_checked']['pypi']} pypi resolved")

        if r["provider_findings"]:
            print("\n  PROVIDER DRIFT")
            current = None
            for f in sorted(r["provider_findings"], key=lambda f: scan.urgency(f) + (f["artifact"], f["file"], f["line"])):
                if f["artifact"] != current:
                    current = f["artifact"]
                    print(f"\n  [{f['severity'].upper()}] {f['artifact']} -- "
                          f"{f['status']}{scan.deadline_phrase(f)}")
                    print(f"      {f['note']}")
                    if f.get("replacement"):
                        print(f"      use instead: {f['replacement']}")
                    print(f"      evidence: {f['evidence']}")
                print(f"        {f['file']}:{f['line']}  {f['excerpt'][:100]}")

        if r["registry_findings"]:
            groups = {}
            for f in r["registry_findings"]:
                groups.setdefault((f["ecosystem"], f["message"]), []).append(f)
            print(f"\n  MAINTAINER-FLAGGED VERSIONS ({len(r['registry_findings'])})")
            for (eco, msg), items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
                pkgs = sorted({i["package"] for i in items})
                head = f"{items[0]['package']}@{items[0]['version']}" if len(items) == 1 \
                    else f"{len(pkgs)} packages"
                print(f"\n  [{eco}] {head}")
                print(f"      \"{msg[:170]}\"")
                if len(items) > 1:
                    more = f", +{len(pkgs) - 5} more" if len(pkgs) > 5 else ""
                    print(f"      {', '.join(pkgs[:5])}{more}")

    if clean:
        print(f"\n\n### clean: {', '.join(clean)}")
    print()
    return 1 if breaking else 0


def main():
    ap = argparse.ArgumentParser(description="Sweep repositories for API and dependency drift.")
    ap.add_argument("roots", nargs="*", help="repository paths")
    ap.add_argument("--parent", help="discover git repos under this directory")
    ap.add_argument("--match", default="*", help="glob for --parent discovery")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    roots = [os.path.abspath(os.path.expanduser(r)) for r in args.roots]
    if args.parent:
        roots += discover(os.path.abspath(os.path.expanduser(args.parent)), args.match)
    roots = [r for r in dict.fromkeys(roots) if os.path.isdir(r)]
    if not roots:
        sys.exit("no repositories found")

    results = sweep(roots)
    if args.json:
        json.dump(results, sys.stdout, indent=2)
        print()
        return 0
    return report(results)


if __name__ == "__main__":
    sys.exit(main())
