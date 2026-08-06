#!/usr/bin/env python3
"""Generate drift manifest artifacts by diffing two versions of a provider's
own public OpenAPI spec.

This is the half no lockfile tool can see. When a provider drops a field,
removes an endpoint, or retires an enum value, nothing moves in your
package.json. Socket, deps.dev, Dependabot and Renovate all read manifests, so
they are blind to it by construction.

Nothing here is inferred. Every artifact is the difference between two files
the provider published themselves, and the evidence is their own git compare.

    python3 scanner/openapi_diff.py --provider stripe --from v1200 --to v2345
    python3 scanner/openapi_diff.py --provider github --from <sha> --to main
"""

import argparse
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CACHE = os.path.join(ROOT, ".cache", "specs")
PROVIDERS_FILE = os.path.join(ROOT, "providers.yaml")


def load_providers(path=PROVIDERS_FILE):
    """Providers live in config, not code, so adding one is a data change that
    anyone can send as a pull request."""
    import yaml
    with open(path) as fh:
        doc = yaml.safe_load(fh) or {}
    return doc.get("providers") or {}


PROVIDERS = load_providers()

RAW = "https://raw.githubusercontent.com/{repo}/{ref}/{path}"
COMPARE = "https://github.com/{repo}/compare/{a}...{b}"
LICENSE_API = "https://api.github.com/repos/{repo}/license"


def _gh_token():
    """Fall back to the local gh CLI's token. CI sets GITHUB_TOKEN directly;
    on a developer machine the credential usually lives in gh's keyring, and
    unauthenticated GitHub is 60 requests an hour, which is not enough."""
    import shutil
    import subprocess
    if not shutil.which("gh"):
        return None
    try:
        out = subprocess.run(["gh", "auth", "token"], capture_output=True,
                             text=True, timeout=15)
        return out.stdout.strip() or None
    except Exception:
        return None


def source_license(repo):
    """The upstream spec's own license, carried into every manifest we derive.

    Stripe's and GitHub's spec repos are MIT, which permits commercial use and
    derivation outright. MIT also asks that the notice travel with substantial
    portions, and whether a derived drift artifact counts as one is genuinely
    unsettled. Carrying the notice costs nothing and makes the question moot.
    """
    req = urllib.request.Request(LICENSE_API.format(repo=repo), headers={
        "User-Agent": "driftcite",
        "Accept": "application/vnd.github+json",
    })
    token = os.environ.get("GITHUB_TOKEN") or _gh_token()
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.load(resp)
    except Exception:
        return None, None
    spdx = (data.get("license") or {}).get("spdx_id")
    return spdx, data.get("html_url")


class SpecUnavailable(Exception):
    """A provider moved, renamed, or had not yet published its spec at this ref.

    Raised rather than crashing, because the daily poller must survive one
    provider reorganising its repository without losing every other provider's
    run for the day.
    """


def _parse(raw, path):
    if path.endswith((".yaml", ".yml")):
        import yaml
        try:
            from yaml import CSafeLoader as Loader  # much faster on 3MB specs
        except ImportError:
            from yaml import SafeLoader as Loader
        return yaml.load(raw, Loader=Loader)
    return json.loads(raw)


def load_spec(provider, ref):
    cfg = PROVIDERS[provider]
    os.makedirs(CACHE, exist_ok=True)

    # Providers rename openapi.json to openapi.yaml and back over the years,
    # so try the configured path first and then the sibling extension.
    candidates = [cfg["path"]]
    base, ext = os.path.splitext(cfg["path"])
    for alt in (".json", ".yaml", ".yml"):
        if alt != ext:
            candidates.append(base + alt)

    errors = []
    for candidate in candidates:
        safe = f"{provider}-{ref.replace('/', '_')}-{os.path.basename(candidate)}"
        local = os.path.join(CACHE, safe)
        if not os.path.exists(local):
            url = RAW.format(repo=cfg["repo"], ref=ref, path=candidate)
            req = urllib.request.Request(url, headers={"User-Agent": "driftcite"})
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    body = resp.read()
            except Exception as exc:
                errors.append(f"{candidate}: {exc}")
                continue
            with open(local, "wb") as fh:
                fh.write(body)
        with open(local, encoding="utf-8") as fh:
            return _parse(fh.read(), candidate)

    raise SpecUnavailable(f"{provider}@{ref}: " + "; ".join(errors))


# ------------------------------------------------------------------ extraction

METHODS = {"get", "put", "post", "delete", "patch", "options", "head"}


def operations(spec):
    """(METHOD PATH) -> {deprecated, params}. Params are names the caller sends."""
    out = {}
    for path, item in (spec.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        shared = item.get("parameters") or []
        for method, op in item.items():
            if method.lower() not in METHODS or not isinstance(op, dict):
                continue
            params = set()
            for p in list(shared) + list(op.get("parameters") or []):
                if isinstance(p, dict) and p.get("name"):
                    params.add(p["name"])
            out[f"{method.upper()} {path}"] = {
                "deprecated": bool(op.get("deprecated")),
                "params": params,
            }
    return out


def enums(node, trail="", found=None):
    """Collect every enum in the spec, keyed by where it lives.

    Enum values are the highest-value artifact we can extract: a retired model
    ID, a dropped payment method, a dead status all appear in real code as a
    bare string literal, which we can locate exactly.

    Only the string members are collected, and an enum holding a non-string is
    still read rather than skipped. Skipping it was a real bug: OpenAPI 3.0
    spells a nullable enum by putting `null` in the list, so the moment Plaid
    made StudentRepaymentPlan.type nullable, the whole enum vanished from the
    newer inventory and all ten of its values were published as removed and
    breaking. Seven false artifacts shipped before this was caught. A value
    that gains a sibling null has not been retired.
    """
    if found is None:
        found = {}
    if isinstance(node, dict):
        vals = node.get("enum")
        if isinstance(vals, list):
            strings = {v for v in vals if isinstance(v, str)}
            if strings:
                found.setdefault(trail or "<root>", set()).update(strings)
        for key, child in node.items():
            if key in ("example", "examples", "default"):
                continue
            enums(child, f"{trail}.{key}" if trail else key, found)
    elif isinstance(node, list):
        for i, child in enumerate(node):
            enums(child, f"{trail}[{i}]", found)
    return found


def enum_inventory(spec):
    """Value -> set of locations. Values shared across many locations (like a
    currency code) are noise; values in one or two places are real signal."""
    inv = {}
    for location, values in enums(spec).items():
        for v in values:
            inv.setdefault(v, set()).add(location)
    return inv


# ----------------------------------------------------------------------- diff

def distinctive_enum(value):
    """Is this enum value specific enough to be worth matching in source?

    GitHub's spec retired enum values called "None", "Remove", "Replace" and
    "number". Those are ordinary words, and emitting them would flag a quoted
    string in every file that happens to mention GitHub. A retired identifier
    that is actually worth finding almost always carries a separator or a digit
    (claude-3-opus-20240229, last_during_period, gpt-4o-mini) or is long enough
    that it cannot be an English word by accident.
    """
    if len(value) < 4:
        return False
    if any(ch in value for ch in "-_.:/"):
        return True
    if any(ch.isdigit() for ch in value):
        return True
    return len(value) >= 12


def sendable_param(name):
    """Is this parameter worth reporting if the provider drops it?

    Two separate ways a spec diff produces a parameter that should never reach
    a user, both observed on Square's spec the day it was added here:

    The name is not something anyone could type. Square's generated spec once
    called its body parameters `create#body` and `bulk-upsert#body`, then
    stopped. Real code contains no `#`, so the artifact can never match, and
    the feed would assert 134 removals no caller ever sent.

    The name is not distinctive. Square dropped a parameter named `body` from
    134 operations. Matched as an object key, `body:` appears in nearly every
    JavaScript file that ever called fetch, and Square's own file marker is
    the ordinary English word "square". Shipping it would have put a false
    finding in a large share of all JavaScript repositories.

    A parameter worth matching carries a separator or a digit
    (budget_tokens, filter[advisory_id], store_id) or is long enough that it
    is not an English word by accident. This is the same test enum values
    already have to pass, for the same reason.
    """
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.\-\[\]]*", name or ""):
        return False
    if any(ch in name for ch in "-_.[]"):
        return True
    if any(ch.isdigit() for ch in name):
        return True
    return len(name) >= 12


def diff(provider, ref_a, ref_b, min_len=4):
    spec_a, spec_b = load_spec(provider, ref_a), load_spec(provider, ref_b)
    ops_a, ops_b = operations(spec_a), operations(spec_b)
    inv_a, inv_b = enum_inventory(spec_a), enum_inventory(spec_b)

    evidence = COMPARE.format(repo=PROVIDERS[provider]["repo"], a=ref_a, b=ref_b)
    ver_a = (spec_a.get("info") or {}).get("version", ref_a)
    ver_b = (spec_b.get("info") or {}).get("version", ref_b)
    artifacts = []

    def add(kind, name, literals, severity, note, status):
        artifacts.append({
            "id": f"{provider}/{kind}/{name}",
            "kind": kind,
            "match": {"literals": sorted(literals)},
            "status": status,
            "severity": severity,
            "note": note,
            "evidence": evidence,
        })

    # Operations that disappeared.
    for op in sorted(set(ops_a) - set(ops_b)):
        method, path = op.split(" ", 1)
        add("endpoint", path, [path], "breaking",
            f"{op} existed in {ver_a} and is gone in {ver_b}.", "removed")

    # Operations newly marked deprecated by the provider.
    for op in sorted(set(ops_a) & set(ops_b)):
        if ops_b[op]["deprecated"] and not ops_a[op]["deprecated"]:
            method, path = op.split(" ", 1)
            add("endpoint", path, [path], "warning",
                f"{op} was marked deprecated between {ver_a} and {ver_b}.", "deprecated")

    # Request parameters dropped from a surviving operation.
    for op in sorted(set(ops_a) & set(ops_b)):
        gone = ops_a[op]["params"] - ops_b[op]["params"]
        for p in sorted(gone):
            if len(p) < min_len or not sendable_param(p):
                continue
            add("request_param", f"{op.split(' ', 1)[1]}#{p}", [p], "breaking",
                f"Parameter '{p}' on {op} existed in {ver_a} and is gone in {ver_b}.",
                "removed")

    # Enum values the provider retired. This is the model-ID case.
    for value in sorted(set(inv_a) - set(inv_b)):
        if not distinctive_enum(value):
            continue
        where = sorted(inv_a[value])
        # A value used in dozens of places is structural vocabulary, not a
        # retired identifier. Keep the narrow ones.
        if len(where) > 6:
            continue
        add("enum_value", value, [value], "breaking",
            f"Enum value '{value}' was valid in {ver_a} and is gone in {ver_b}. "
            f"Seen at: {where[0]}", "removed")

    return artifacts, ver_a, ver_b, evidence


def self_test():
    """The two filters that decide what is allowed to become a finding.

    Both exist because of a false artifact that actually shipped, so both are
    pinned here rather than left to be rediscovered the same way.
    """
    # A nullable enum must not read as a mass retirement. OpenAPI 3.0 spells
    # nullable by putting null in the list, and skipping such an enum wholesale
    # published seven of Plaid's live repayment plans as removed and breaking.
    before = {"components": {"schemas": {"Plan": {"properties": {
        "type": {"enum": ["standard", "graduated", "interest-only"]}}}}}}
    after = {"components": {"schemas": {"Plan": {"properties": {
        "type": {"enum": ["standard", "graduated", "interest-only", None]}}}}}}
    removed = set(enum_inventory(before)) - set(enum_inventory(after))
    assert removed == set(), f"nullable enum read as removed: {removed}"

    # A value genuinely dropped alongside a new null is still caught.
    shrunk = {"components": {"schemas": {"Plan": {"properties": {
        "type": {"enum": ["standard", "graduated", None]}}}}}}
    assert set(enum_inventory(before)) - set(enum_inventory(shrunk)) == {"interest-only"}

    # A parameter has to be something a caller could have typed, and
    # distinctive enough not to be an English word or a bare object key.
    for bad in ("create#body", "body", "type", "refund", "", "1abc"):
        assert not sendable_param(bad), f"{bad!r} should be refused"
    for good in ("budget_tokens", "filter[advisory_id]", "store_id",
                 "search_queries_only", "max_tokens_to_sample"):
        assert sendable_param(good), f"{good!r} should be kept"

    print("openapi_diff self-test: ok")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Diff two OpenAPI spec versions into drift artifacts.")
    ap.add_argument("--self-test", action="store_true",
                    help="check the artifact filters, no network")
    ap.add_argument("--provider", choices=sorted(PROVIDERS))
    ap.add_argument("--from", dest="ref_a")
    ap.add_argument("--to", dest="ref_b")
    ap.add_argument("--out", help="write a manifest YAML here")
    args = ap.parse_args()

    if args.self_test:
        return self_test()
    if not (args.provider and args.ref_a and args.ref_b):
        ap.error("--provider, --from and --to are required unless --self-test")

    artifacts, ver_a, ver_b, evidence = diff(args.provider, args.ref_a, args.ref_b)

    by_kind = {}
    for a in artifacts:
        by_kind.setdefault(a["kind"], []).append(a)

    print(f"\n{args.provider}: {ver_a} ({args.ref_a}) -> {ver_b} ({args.ref_b})")
    print(f"{len(artifacts)} drift artifacts generated, zero hand-written")
    print(f"evidence: {evidence}\n")
    for kind in sorted(by_kind):
        items = by_kind[kind]
        print(f"  {kind}: {len(items)}")
        for a in items[:6]:
            print(f"    [{a['severity']}] {a['match']['literals'][0]}")
        if len(items) > 6:
            print(f"    ... +{len(items) - 6} more")
    print()

    if args.out:
        import yaml
        repo = PROVIDERS[args.provider]["repo"]
        spdx, license_url = source_license(repo)
        doc = {
            "provider": args.provider,
            "spec_version": 1,
            "generated_from": {"repo": repo,
                               "from": args.ref_a, "to": args.ref_b,
                               "from_api_version": ver_a, "to_api_version": ver_b},
            "source_license": spdx,
            "source_notice": license_url,
            "sources": [evidence],
            "context": {"file_markers": PROVIDERS[args.provider]["markers"]},
            "artifacts": artifacts,
        }
        with open(args.out, "w") as fh:
            yaml.safe_dump(doc, fh, sort_keys=False, default_flow_style=False)
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
