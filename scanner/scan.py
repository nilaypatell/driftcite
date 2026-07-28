#!/usr/bin/env python3
"""Scan a repository for API drift against the drift manifests.

Detection is deterministic: a finding exists only when a manifest literal
appears in the source. Nothing is inferred, nothing is guessed. The manifest
asserts the fact and carries the evidence URL; this only locates it.

    python3 scanner/scan.py ~/Desktop/quickcruit-backend
    python3 scanner/scan.py ~/code/repo --json
"""

import argparse
import datetime
import fnmatch
import json
import os
import re
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

# A manifest states a retirement date. Time then passes. A "deprecated, retires
# 2026-06-15" entry is simply retired once that date is behind us, and one
# retiring next week is not a footnote. Severity is therefore computed against
# today rather than frozen at authoring time. Lead time is the product.
SOON_DAYS = 90


def apply_deadline(artifact, today=None):
    """Return (severity, status, days_left) with the clock taken into account."""
    severity = artifact.get("severity", "info")
    status = artifact.get("status", "unknown")
    raw = artifact.get("retires_on")
    if not raw:
        return severity, status, None
    try:
        when = datetime.date.fromisoformat(str(raw))
    except ValueError:
        return severity, status, None
    days = (when - (today or datetime.date.today())).days
    if days < 0:
        return "breaking", "retired", days
    if days <= SOON_DAYS and severity != "breaking":
        return "breaking", status, days
    return severity, status, days

# Kinds that are only meaningful inside a file that already talks to the
# provider. A bare "output_format" in unrelated code is not drift.
CONTEXT_REQUIRED_KINDS = {"request_param", "sdk_symbol", "tool_type", "endpoint", "enum_value"}

# How each kind is allowed to appear before it counts as a real call site.
# Substring matching is wrong: the parameter "refund" is inside "refunded" and
# inside a sentence about refunds, and neither is a call to the API. A retired
# enum value like "hosted" is an ordinary English word. So each kind only
# matches in the shape it actually takes when sent to a provider.
#
#   quoted : a string literal, 'x' or "x" or `x`
#   key    : an object key or assignment, x: or x =
#   word   : the bare token with word boundaries
MATCH_SHAPES = {
    "enum_value": ("quoted",),
    "request_param": ("quoted", "key"),
    "endpoint": ("quoted", "word"),
    "model_id": ("quoted", "word"),
    "tool_type": ("quoted", "word"),
    "sdk_symbol": ("quoted", "word"),
}
DEFAULT_SHAPES = ("quoted", "word")


def compile_matcher(literal, kind):
    lit = re.escape(literal)
    parts = []
    for shape in MATCH_SHAPES.get(kind, DEFAULT_SHAPES):
        if shape == "quoted":
            parts.append(rf"['\"`]{lit}['\"`]")
        elif shape == "key":
            parts.append(rf"(?<![\w.]){lit}\s*[:=]")
        elif shape == "word":
            parts.append(rf"(?<![\w./-]){lit}(?![\w.-])")
    return re.compile("|".join(parts))


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


# Documentation quotes parameter names constantly, and a comment is never a
# call site. Deliberately conservative: only lines that *begin* with a comment
# marker are skipped, so a trailing comment after real code is still scanned.
COMMENT_START = re.compile(r"^\s*(#|//|\*|<!--|--|;)")


def is_comment(line):
    return bool(COMMENT_START.match(line))


# Where a finding lives changes what it means. A retired model id in
# production source is a call that fails; the same string in a test fixture or
# an example is often deliberate. Source is ranked first and the rest labelled.
TEST_RE = re.compile(r"(^|/)(tests?|__tests__|spec|testdata|fixtures?|mocks?)(/|$)"
                     r"|(^|/)[^/]*[._-](test|spec)\.[a-z]+$"
                     r"|(^|/)(test|spec)_[^/]*\.[a-z]+$")
EXAMPLE_RE = re.compile(r"(^|/)(examples?|samples?|demos?|cookbook|recipes?|notebooks?)(/|$)"
                        r"|\.ipynb$")
DOC_RE = re.compile(r"(^|/)(docs?|documentation|website|site)(/|$)|\.(md|mdx|rst|txt)$")
CONTEXT_RANK = {"source": 0, "example": 1, "test": 2, "doc": 3}


def file_context(rel):
    p = rel.replace("\\", "/").lower()
    if TEST_RE.search(p):
        return "test"
    if EXAMPLE_RE.search(p):
        return "example"
    if DOC_RE.search(p):
        return "doc"
    return "source"


IGNORE_FILE = ".driftciteignore"


def load_ignores(root):
    """Same format the CLI reads: a path glob, an artifact id, or both split
    by ::. A team that cannot suppress one unfixable finding removes the tool
    entirely, so this is not optional."""
    path = os.path.join(root, IGNORE_FILE)
    if not os.path.exists(path):
        return []
    rules = []
    with open(path, encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            line = raw.split("#")[0].strip()
            if not line:
                continue
            left, sep, right = line.partition("::")
            left, right = left.strip(), right.strip()
            if sep and right:
                rules.append((left, right))
            else:
                rules.append((left, None))
    return rules


def suppressed_by(rules, finding, providers):
    for pat, artifact in rules:
        if artifact:
            if fnmatch.fnmatch(finding["file"], pat) and finding["artifact"] == artifact:
                return True
        elif "/" in pat and pat.split("/")[0] in providers:
            if finding["artifact"] == pat:
                return True
        elif fnmatch.fnmatch(finding["file"], pat) or finding["artifact"] == pat:
            return True
    return False


def is_drift_data(text):
    head = text[:4000]
    if '"feed_version"' in head or "feed_version:" in head:
        return True
    return bool(re.search(r"(^|\n)\s*spec_version\s*:", head)) and \
        bool(re.search(r"(^|\n)artifacts\s*:", text[:20000]))


def scan_file(path, index, root):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        return []

    # A drift manifest contains every literal by definition, so scanning one
    # reports the whole feed back as findings. Anyone who vendors the feed into
    # their own repository would hit this too, not just this project.
    if is_drift_data(text):
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
        matcher = compile_matcher(literal, art["kind"])
        if not matcher.search(text):
            continue
        if lines is None:
            lines = text.splitlines()
        claimed = set()
        for lineno, line in enumerate(lines, 1):
            if is_comment(line):
                continue
            if not matcher.search(line):
                continue
            # One hit per line per literal, even if it appears twice.
            if lineno in claimed:
                continue
            claimed.add(lineno)
            severity, status, days_left = apply_deadline(art)
            rel = os.path.relpath(path, root)
            findings.append({
                "context": file_context(rel),
                "file": rel,
                "line": lineno,
                "literal": literal,
                "provider": provider,
                "artifact": art["id"],
                "kind": art["kind"],
                "status": status,
                "severity": severity,
                "days_left": days_left,
                "replacement": art.get("replacement"),
                "retires_on": str(art["retires_on"]) if art.get("retires_on") else None,
                "note": art.get("note", ""),
                "evidence": art.get("evidence"),
                "excerpt": line.strip()[:160],
            })
    return findings


def deadline_phrase(f):
    """Say how long you have, not just what the date is."""
    days = f.get("days_left")
    when = f.get("retires_on")
    if days is None:
        return f" (retires {when})" if when else ""
    if days < 0:
        return f" (DIED {abs(days)} days ago, {when})"
    if days == 0:
        return f" (DIES TODAY, {when})"
    return f" (breaks in {days} days, {when})"


def urgency(f):
    """Most urgent first: breaking before warning, soonest deadline before
    later, dated before undated, and production source before test fixtures."""
    days = f.get("days_left")
    return (SEVERITY_ORDER.get(f["severity"], 3), days is None,
            days if days is not None else 0,
            CONTEXT_RANK.get(f.get("context", "source"), 9))


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

    findings.sort(key=lambda f: urgency(f) + (f["artifact"], f["file"], f["line"]))

    counts = {}
    for f in findings:
        counts[f["severity"]] = counts.get(f["severity"], 0) + 1
    summary = ", ".join(f"{counts[s]} {s}" for s in ("breaking", "warning", "info") if s in counts)
    print(f"\n{root}\n{len(findings)} findings ({summary})\n")

    current = None
    for f in findings:
        if f["artifact"] != current:
            current = f["artifact"]
            print(f"[{f['severity'].upper()}] {f['artifact']} -- {f['status']}{deadline_phrase(f)}")
            print(f"  {f['note']}")
            if f["replacement"]:
                print(f"  use instead: {f['replacement']}")
            print(f"  evidence: {f['evidence']}")
        tag = "" if f.get("context", "source") == "source" else f" [{f['context']}]"
        print(f"    {f['file']}:{f['line']}{tag}  {f['excerpt']}")
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

    rules = load_ignores(root)
    if rules:
        providers = {m["provider"] for m in load_manifests()}
        before = len(findings)
        findings = [f for f in findings if not suppressed_by(rules, f, providers)]
        if before != len(findings):
            print(f"{before - len(findings)} finding(s) suppressed by {IGNORE_FILE}")

    if args.json:
        json.dump({"root": root, "findings": findings}, sys.stdout, indent=2)
        print()
        return 0
    return report(findings, root)


if __name__ == "__main__":
    sys.exit(main())
