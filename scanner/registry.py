#!/usr/bin/env python3
"""Find dependencies whose exact installed version the maintainer deprecated.

Dependabot tells you a newer version exists. It does not tell you the
maintainer marked the version you are running as deprecated, or what they said
about it. npm carries a per-version `deprecated` string and PyPI carries
`yanked` plus a reason -- both public, free, and written by the maintainer.

Every finding here is the maintainer's own words. Nothing is inferred.

    python3 scanner/registry.py ~/path/to/repo
    python3 scanner/registry.py ~/path/to/repo --json
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

NPM_REGISTRY = "https://registry.npmjs.org/{}"
# Abbreviated metadata: same `deprecated` field, a fraction of the bytes.
NPM_ACCEPT = "application/vnd.npm.install-v1+json"
PYPI_REGISTRY = "https://pypi.org/pypi/{}/json"

CACHE_DIR = os.path.expanduser("~/.cache/apidrift")
SKIP_DIRS = {".git", "node_modules", ".next", "dist", "build", "__pycache__",
             ".venv", "venv", ".turbo", "vendor", ".vercel", "out", ".cache"}
TIMEOUT = 20
WORKERS = 16


# ---------------------------------------------------------------- dependencies

def find_files(root, names, globs=()):
    hits = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            if fn in names or any(re.fullmatch(g, fn) for g in globs):
                hits.append(os.path.join(dirpath, fn))
    return hits


def npm_deps(root):
    """Exact installed versions from lockfiles. Ranges in package.json are not
    versions, so an unlocked repo yields nothing rather than a guess."""
    found = {}
    for lock in find_files(root, {"package-lock.json"}):
        try:
            with open(lock) as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError):
            continue
        # lockfile v2/v3
        for path, meta in (data.get("packages") or {}).items():
            if not path.startswith("node_modules/"):
                continue
            name = path.split("node_modules/")[-1]
            version = meta.get("version")
            if name and version:
                found.setdefault((name, version), os.path.relpath(lock, root))
        # lockfile v1
        def walk_v1(deps, src):
            for name, meta in (deps or {}).items():
                if meta.get("version"):
                    found.setdefault((name, meta["version"]), src)
                walk_v1(meta.get("dependencies"), src)
        walk_v1(data.get("dependencies"), os.path.relpath(lock, root))
    return found


def normalize(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def installed_python():
    """normalized name -> version, read from installed *.dist-info directories.

    Most real requirements files use >= rather than ==, so the file alone does
    not say which version is running. The dist-info on disk does.
    """
    import site
    found = {}
    roots = []
    try:
        roots.extend(site.getsitepackages())
    except AttributeError:
        pass
    try:
        roots.append(site.getusersitepackages())
    except AttributeError:
        pass
    for d in roots:
        if not d or not os.path.isdir(d):
            continue
        try:
            entries = os.listdir(d)
        except OSError:
            continue
        for entry in entries:
            if not entry.endswith(".dist-info"):
                continue
            stem = entry[: -len(".dist-info")]
            if "-" not in stem:
                continue
            name, _, version = stem.rpartition("-")
            found.setdefault(normalize(name), version)
    return found


def pypi_deps(root):
    """Requirements of any pin style. `==` is taken at face value; everything
    else is resolved against what is actually installed."""
    installed = installed_python()
    found = {}
    pinned = re.compile(r"^\s*([A-Za-z0-9._-]+)\s*==\s*([A-Za-z0-9._+!-]+)")
    named = re.compile(r"^\s*([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*(?:[<>=!~]|$)")
    for req in find_files(root, {"requirements.txt"}, globs=(r"requirements-.+\.txt",)):
        try:
            with open(req, encoding="utf-8", errors="replace") as fh:
                lines = fh.readlines()
        except OSError:
            continue
        rel = os.path.relpath(req, root)
        for line in lines:
            stripped = line.lstrip()
            if not stripped or stripped.startswith(("#", "-")):
                continue
            m = pinned.match(line)
            if m:
                found.setdefault((m.group(1), m.group(2)), rel)
                continue
            m = named.match(line)
            if m:
                version = installed.get(normalize(m.group(1)))
                if version:
                    found.setdefault((m.group(1), version), f"{rel} (installed)")
    return found


# ------------------------------------------------------------------- registries

def fetch(url, accept=None):
    key = os.path.join(CACHE_DIR, re.sub(r"[^A-Za-z0-9]+", "_", url)[:180] + ".json")
    if os.path.exists(key):
        try:
            with open(key) as fh:
                return json.load(fh)
        except (OSError, json.JSONDecodeError):
            pass
    req = urllib.request.Request(url, headers={"User-Agent": "apidrift"})
    if accept:
        req.add_header("Accept", accept)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.load(resp)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return None
    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        with open(key, "w") as fh:
            json.dump(data, fh)
    except OSError:
        pass
    return data


def check_npm(name):
    doc = fetch(NPM_REGISTRY.format(name.replace("/", "%2f")), NPM_ACCEPT)
    if not doc:
        return {}
    out = {}
    for version, meta in (doc.get("versions") or {}).items():
        msg = meta.get("deprecated")
        if msg:
            out[version] = str(msg).strip()
    return out


def check_pypi(name):
    doc = fetch(PYPI_REGISTRY.format(name))
    if not doc:
        return {}
    out = {}
    for version, files in (doc.get("releases") or {}).items():
        if files and files[0].get("yanked"):
            out[version] = (files[0].get("yanked_reason") or "").strip() or "yanked, no reason given"
    return out


def scan(root):
    npm = npm_deps(root)
    pypi = pypi_deps(root)

    jobs = [("npm", n) for n in {n for n, _ in npm}] + [("pypi", n) for n in {n for n, _ in pypi}]
    results = {}
    if jobs:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            fetched = pool.map(lambda j: check_npm(j[1]) if j[0] == "npm" else check_pypi(j[1]), jobs)
            results = dict(zip(jobs, fetched))

    findings = []
    for ecosystem, deps in (("npm", npm), ("pypi", pypi)):
        for (name, version), source in deps.items():
            flagged = results.get((ecosystem, name)) or {}
            if version in flagged:
                findings.append({
                    "ecosystem": ecosystem,
                    "package": name,
                    "version": version,
                    "source": source,
                    "message": flagged[version],
                    "evidence": (NPM_REGISTRY if ecosystem == "npm" else PYPI_REGISTRY).format(name),
                })
    findings.sort(key=lambda f: (f["ecosystem"], f["package"]))
    return findings, len(npm), len(pypi)


def report(findings, root, n_npm, n_pypi):
    total = n_npm + n_pypi
    if not findings:
        print(f"\n{root}\n{total} pinned dependencies checked ({n_npm} npm, {n_pypi} pypi)")
        print("No deprecated or yanked versions in use.\n")
        return 0

    # Maintainers deprecate whole families in one go (a package split, a rename).
    # Group by the message so 40 packages from one migration read as one item.
    groups = {}
    for f in findings:
        groups.setdefault((f["ecosystem"], f["message"]), []).append(f)
    ordered = sorted(groups.items(), key=lambda kv: -len(kv[1]))

    print(f"\n{root}")
    print(f"{total} pinned dependencies checked ({n_npm} npm, {n_pypi} pypi)")
    print(f"{len(findings)} on a maintainer-flagged version, in {len(ordered)} groups\n")

    for (ecosystem, message), items in ordered:
        verb = "deprecated" if ecosystem == "npm" else "yanked"
        pkgs = sorted({f["package"] for f in items})
        if len(items) == 1:
            head = f"{items[0]['package']}@{items[0]['version']}"
        else:
            noun = "package" if len(pkgs) == 1 else "packages"
            head = f"{len(pkgs)} {noun} ({len(items)} pinned versions)"
        print(f"[{ecosystem}] {head} -- {verb} by the maintainer")
        print(f"  \"{message[:220]}\"")
        if len(items) > 1:
            more = f", +{len(pkgs) - 6} more" if len(pkgs) > 6 else ""
            print(f"  {', '.join(pkgs[:6])}{more}")
        print(f"  declared in: {items[0]['source']}")
        print(f"  evidence: {items[0]['evidence']}")
        print()
    return 1


def main():
    ap = argparse.ArgumentParser(description="Find deps on a maintainer-flagged version.")
    ap.add_argument("root")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    root = os.path.abspath(os.path.expanduser(args.root))
    if not os.path.isdir(root):
        sys.exit(f"not a directory: {root}")

    findings, n_npm, n_pypi = scan(root)
    if args.json:
        json.dump({"root": root, "checked": {"npm": n_npm, "pypi": n_pypi},
                   "findings": findings}, sys.stdout, indent=2)
        print()
        return 0
    return report(findings, root, n_npm, n_pypi)


if __name__ == "__main__":
    sys.exit(main())
