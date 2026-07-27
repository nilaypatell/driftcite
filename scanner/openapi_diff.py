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
import sys
import urllib.request

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".cache", "specs")

# Where each provider publishes its spec, and how to build an evidence link.
PROVIDERS = {
    "stripe": {
        "repo": "stripe/openapi",
        "path": "openapi/spec3.json",
        "markers": ["stripe", "STRIPE_SECRET", "STRIPE_API"],
    },
    "github": {
        "repo": "github/rest-api-description",
        "path": "descriptions/api.github.com/api.github.com.json",
        "markers": ["github", "octokit", "GITHUB_TOKEN"],
    },
    "openai": {
        "repo": "openai/openai-openapi",
        "path": "openapi.json",
        "markers": ["openai", "OPENAI_API_KEY", "gpt-"],
    },
    "cloudflare": {
        "repo": "cloudflare/api-schemas",
        "path": "openapi.json",
        "markers": ["cloudflare", "CLOUDFLARE_API", "CF_API"],
    },
}

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
    """
    if found is None:
        found = {}
    if isinstance(node, dict):
        vals = node.get("enum")
        if isinstance(vals, list) and vals and all(isinstance(v, str) for v in vals):
            found.setdefault(trail or "<root>", set()).update(vals)
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
            if len(p) < min_len:
                continue
            add("request_param", f"{op.split(' ', 1)[1]}#{p}", [p], "breaking",
                f"Parameter '{p}' on {op} existed in {ver_a} and is gone in {ver_b}.",
                "removed")

    # Enum values the provider retired. This is the model-ID case.
    for value in sorted(set(inv_a) - set(inv_b)):
        if len(value) < min_len:
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


def main():
    ap = argparse.ArgumentParser(description="Diff two OpenAPI spec versions into drift artifacts.")
    ap.add_argument("--provider", required=True, choices=sorted(PROVIDERS))
    ap.add_argument("--from", dest="ref_a", required=True)
    ap.add_argument("--to", dest="ref_b", required=True)
    ap.add_argument("--out", help="write a manifest YAML here")
    args = ap.parse_args()

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
