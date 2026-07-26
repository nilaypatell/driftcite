#!/usr/bin/env python3
"""Scan a repository for API drift against the drift manifests.

Detection is deterministic: a finding exists only when a manifest literal
appears in the source. Nothing is inferred, nothing is guessed. The manifest
asserts the fact and carries the evidence URL; this only locates it.

    python3 scanner/scan.py ~/Desktop/quickcruit-backend
    python3 scanner/scan.py ~/code/repo --json
"""

import argparse
import json
import os
import sys

import yaml

MANIFEST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "manifests")

SKIP_DIRS = {
    ".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv",
    "venv", ".mypy_cache", ".pytest_cache", "coverage", ".turbo", "vendor",
    ".vercel", "out", ".cache",
}

SCAN_EXTS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rb", ".java",
    ".kt", ".cs", ".php", ".rs", ".sh", ".yaml", ".yml", ".json", ".toml", ".env",
}

MAX_BYTES = 2_000_000
SEVERITY_ORDER = {"breaking": 0, "warning": 1, "info": 2}

# Kinds that are only meaningful inside a file that already talks to the
# provider. A bare "output_format" in unrelated code is not drift.
CONTEXT_REQUIRED_KINDS = {"request_param", "sdk_symbol", "tool_type", "endpoint"}


def load_manifests(path=MANIFEST_DIR):
    manifests = []
    for name in sorted(os.listdir(path)):
        if not name.endswith((".yaml", ".yml")):
            continue
        with open(os.path.join(path, name)) as fh:
            manifests.append(yaml.safe_load(fh))
    return manifests


def build_index(manifests):
    """Flatten manifests into (literal, artifact, provider, markers) tuples."""
    index = []
    for m in manifests:
        markers = (m.get("context") or {}).get("file_markers") or []
        for art in m.get("artifacts", []):
            if art.get("status") == "active":
                continue
            for literal in art.get("match", {}).get("literals", []):
                index.append((literal, art, m["provider"], markers))
    # Longest literal first so claude-opus-4-1-20250805 wins over claude-opus-4-1.
    index.sort(key=lambda row: len(row[0]), reverse=True)
    return index


def walk(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in SCAN_EXTS:
                full = os.path.join(dirpath, fn)
                try:
                    if os.path.getsize(full) <= MAX_BYTES:
                        yield full
                except OSError:
                    continue


def scan_file(path, index, root):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        return []

    lowered = text.lower()
    findings = []
    lines = None

    for literal, art, provider, markers in index:
        if literal not in text:
            continue
        if art["kind"] in CONTEXT_REQUIRED_KINDS:
            if markers and not any(mk.lower() in lowered for mk in markers):
                continue
        if lines is None:
            lines = text.splitlines()
        claimed = set()
        for lineno, line in enumerate(lines, 1):
            if literal not in line:
                continue
            # One hit per line per literal, even if it appears twice.
            if lineno in claimed:
                continue
            claimed.add(lineno)
            findings.append({
                "file": os.path.relpath(path, root),
                "line": lineno,
                "literal": literal,
                "provider": provider,
                "artifact": art["id"],
                "kind": art["kind"],
                "status": art["status"],
                "severity": art.get("severity", "info"),
                "replacement": art.get("replacement"),
                "retires_on": str(art["retires_on"]) if art.get("retires_on") else None,
                "note": art.get("note", ""),
                "evidence": art.get("evidence"),
                "excerpt": line.strip()[:160],
            })
    return findings


def dedupe(findings):
    """One finding per (file, line, artifact) -- keep the longest literal."""
    best = {}
    for f in findings:
        key = (f["file"], f["line"], f["artifact"])
        if key not in best or len(f["literal"]) > len(best[key]["literal"]):
            best[key] = f
    return list(best.values())


def report(findings, root):
    if not findings:
        print(f"No drift found in {root}")
        return 0

    findings.sort(key=lambda f: (SEVERITY_ORDER.get(f["severity"], 3), f["file"], f["line"]))

    counts = {}
    for f in findings:
        counts[f["severity"]] = counts.get(f["severity"], 0) + 1
    summary = ", ".join(f"{counts[s]} {s}" for s in ("breaking", "warning", "info") if s in counts)
    print(f"\n{root}\n{len(findings)} findings ({summary})\n")

    current = None
    for f in findings:
        if f["artifact"] != current:
            current = f["artifact"]
            when = f" (retires {f['retires_on']})" if f["retires_on"] else ""
            print(f"[{f['severity'].upper()}] {f['artifact']} -- {f['status']}{when}")
            print(f"  {f['note']}")
            if f["replacement"]:
                print(f"  use instead: {f['replacement']}")
            print(f"  evidence: {f['evidence']}")
        print(f"    {f['file']}:{f['line']}  {f['excerpt']}")
    print()
    return 1 if counts.get("breaking") else 0


def main():
    ap = argparse.ArgumentParser(description="Scan a repo for API drift.")
    ap.add_argument("root", help="repository to scan")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of a report")
    args = ap.parse_args()

    root = os.path.abspath(os.path.expanduser(args.root))
    if not os.path.isdir(root):
        sys.exit(f"not a directory: {root}")

    index = build_index(load_manifests())
    findings = []
    for path in walk(root):
        findings.extend(scan_file(path, index, root))
    findings = dedupe(findings)

    if args.json:
        json.dump({"root": root, "findings": findings}, sys.stdout, indent=2)
        print()
        return 0
    return report(findings, root)


if __name__ == "__main__":
    sys.exit(main())
