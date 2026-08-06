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
import datetime
import json
import os
import re
import sys
import urllib.error
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


# What source_license says when the answer is not an SPDX identifier. Neither
# of these may be written as null. plaid/plaid-openapi ships no LICENSE file at
# all — GitHub's licence endpoint answers 404 and the repository's own licence
# field is null — and the manifest recorded that as `source_license: null`,
# which is exactly what an unreachable network also produced. A reader could
# not tell "we checked, and Plaid publishes no licence" from "nobody checked",
# and those two call for opposite actions: the first is a question for a
# lawyer before anyone reuses the spec, the second is a rerun.
NO_LICENSE = "none published"
UNDETERMINED = "undetermined"


def source_license(repo):
    """The upstream spec's own license, carried into every manifest we derive.

    Stripe's and GitHub's spec repos are MIT, which permits commercial use and
    derivation outright. MIT also asks that the notice travel with substantial
    portions, and whether a derived drift artifact counts as one is genuinely
    unsettled. Carrying the notice costs nothing and makes the question moot.

    Returns (spdx_or_reason, url). The second value is a link a human can open
    to check the claim: the LICENSE file when there is one, the repository
    itself when there is not.
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
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return NO_LICENSE, f"https://github.com/{repo}"
        return UNDETERMINED, None
    except Exception:
        return UNDETERMINED, None
    spdx = (data.get("license") or {}).get("spdx_id")
    if not spdx or spdx == "NOASSERTION":
        # GitHub found a licence file and could not identify it. That is still
        # an answer, and still not an SPDX id anyone should copy into a notice.
        return spdx or NO_LICENSE, data.get("html_url") or f"https://github.com/{repo}"
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


def schema_bag(spec):
    """Every named schema, in whichever dialect the provider writes.

    OpenAPI 3 puts them under components.schemas and Swagger 2 under
    definitions. Square's spec still carries a definitions block alongside the
    modern one, so both are read rather than one being assumed.
    """
    bag = {}
    bag.update((spec.get("components") or {}).get("schemas") or {})
    bag.update(spec.get("definitions") or {})
    return bag


def enum_owners(spec):
    """Enum value -> the names of the schemas that list it.

    enum_inventory keys by dotted trail, and a trail cannot be turned back into
    a schema name: Twilio names schemas things like
    api.v2010.account.usage.usage_record.usage_record_all_time, and the dots
    inside that name are indistinguishable from the dots the trail puts between
    levels. The un-enumerated check below needs owning schema names, so they
    are collected by walking each named schema on its own.
    """
    owners = {}
    for name, node in schema_bag(spec).items():
        for values in enums(node).values():
            for v in values:
                owners.setdefault(v, set()).add(name)
    return owners


def owner_fields(spec):
    """Every place a $ref can be pointed from, as owner -> {field: schema}.

    Named schemas are the obvious owners, keyed by name and holding their
    properties. Operations are the other one, keyed "GET /path" and holding
    their parameters. Twilio's usage_record_time_parameterized_enum_category is
    referenced only from the parameters of the usage endpoints, so a map built
    from schemas alone would call it unreferenced and read its deletion as a
    retirement when the query parameter had merely stopped being constrained.
    """
    owners = {}
    for name, node in schema_bag(spec).items():
        props = node.get("properties") if isinstance(node, dict) else None
        owners[name] = props if isinstance(props, dict) else {}
    for path, item in (spec.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        shared = item.get("parameters") or []
        for method, op in item.items():
            if method.lower() not in METHODS or not isinstance(op, dict):
                continue
            fields = {}
            for p in list(shared) + list(op.get("parameters") or []):
                if isinstance(p, dict) and p.get("name"):
                    fields[p["name"]] = p.get("schema") or p
            owners[f"{method.upper()} {path}"] = fields
    return owners


def schema_referrers(spec):
    """Named schema -> {(owner that $refs it, the field it sits under)}.

    The field name is carried because it is the only way to find the same field
    in the other spec and ask what it looks like now.
    """
    refs = {}

    def walk(node, owner, field):
        if isinstance(node, dict):
            target = node.get("$ref")
            if isinstance(target, str) and "/" in target:
                refs.setdefault(target.rsplit("/", 1)[1], set()).add((owner, field))
            for key, child in node.items():
                if key == "properties" and isinstance(child, dict):
                    for pname, pnode in child.items():
                        walk(pnode, owner, pname)
                else:
                    walk(child, owner, field)
        elif isinstance(node, list):
            for child in node:
                walk(child, owner, field)

    for name, node in schema_bag(spec).items():
        walk(node, name, None)
    for path, item in (spec.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        shared = item.get("parameters") or []
        for method, op in item.items():
            if method.lower() not in METHODS or not isinstance(op, dict):
                continue
            for p in list(shared) + list(op.get("parameters") or []):
                if isinstance(p, dict) and p.get("name"):
                    walk(p, f"{method.upper()} {path}", p["name"])
    return refs


def stopped_enumerating(schema, referrers_a, bag_b, fields_b):
    """Did this enum schema vanish because the field it constrained stopped
    being constrained, rather than because the field went away?

    This is the twilio case, and it is the difference between 601 findings and
    none. Between 2.3.2 and 2.6.9 Twilio deleted eleven schemas — one usage
    category enum per reporting window (all_time, daily, monthly, today,
    yesterday, this_month, last_month, yearly, time_parameterized, the base
    record, and the trigger) — taking 637 enum values with them. Not one of
    those categories was retired. The field that used them,
    api.v2010.account.usage.usage_record.usage_record_all_time.category, is
    still there; it is now `type: string` with a link to the usage-categories
    doc, because Twilio decided to stop restating the list in the spec. A field
    that stopped being constrained accepts strictly more, not less.

    So the question is not "did the enum disappear" but "did a field that
    referenced it survive without an enum". If the referring schema is gone
    too, the surface really was withdrawn and the values are reported: Datadog
    deleted DORAIncidentType and DORAIncidentResponseData together, and the one
    value they carried is a genuine removal. If nothing referenced the enum,
    as with Square's orphaned V1SettlementEntryType, there is no field to have
    been loosened and the deletion stands.
    """
    if schema in bag_b:
        return False
    for owner, field in referrers_a.get(schema, ()):
        if owner not in fields_b:
            continue
        if field is None:
            return True
        node = fields_b[owner].get(field)
        if node is None:
            continue
        # A field that still carries an enum has not been loosened. The value
        # is missing from it because the provider dropped it, which is the
        # ordinary case the inventory diff already reports.
        if not isinstance(node.get("enum"), list):
            return True
    return False


# ----------------------------------------------------------------------- diff

def distinctive_enum(value):
    """Is this enum value specific enough to be worth matching in source?

    GitHub's spec retired enum values called "None", "Remove", "Replace" and
    "number". Those are ordinary words, and emitting them would flag a quoted
    string in every file that happens to mention GitHub. A retired identifier
    that is actually worth finding almost always carries a separator or a digit
    — a dated Anthropic model id, one of Stripe's snake_case interval values, a
    hyphenated OpenAI variant — or is long enough that it cannot be an English
    word by accident.

    Those three are described rather than quoted on purpose. driftcite scans
    its own scanner/ directory in CI and expects it to come back clean, so a
    comment here that pastes a literal the feed carries turns this file into a
    finding about itself.
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
    (idempotency_key, page[size], store_id) or is long enough that it is not an
    English word by accident. This is the same test enum values already have to
    pass, for the same reason.
    """
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.\-\[\]]*", name or ""):
        return False
    if any(ch in name for ch in "-_.[]"):
        return True
    if any(ch.isdigit() for ch in name):
        return True
    return len(name) >= 12


# Why an observation was withheld. These sentences are printed on every run
# and written into the manifest, so they have to read as something a human can
# act on rather than as a filter's variable name.
ENUM_UNENUMERATED = "provider stopped publishing the enum; the field now accepts any string"
ENUM_TOO_ORDINARY = "enum value is an ordinary word and would match unrelated code"
ENUM_TOO_WIDESPREAD = "enum value appears in more than six schemas; too broad to attribute"
PATH_STILL_SERVED = "path still served by another method, so the literal is still live"
PARAM_STILL_ACCEPTED = "parameter still accepted by another method on the same path"
PARAM_UNMATCHABLE = "parameter name is not distinctive enough to match safely"


class Withheld:
    """Observations the diff made and refused to publish, kept with a reason.

    Anything the tool cannot do has to be named in its output, and a filter
    that fires invisibly is indistinguishable from a bug. This file had one:
    twilio's spec lost 637 enum values in a single release and the run printed
    "0 drift artifacts generated", which reads as "Twilio did not change" when
    what happened is that every one of them was thrown away by a filter nobody
    could see. Every filter below now says what it swallowed and why.
    """

    def __init__(self):
        self._rows = {}

    def drop(self, reason, what, where=None):
        row = self._rows.setdefault(reason, {"reason": reason, "count": 0, "examples": []})
        row["count"] += 1
        if len(row["examples"]) < 3:
            row["examples"].append(f"{what} at {where}" if where else str(what))

    def total(self):
        return sum(row["count"] for row in self._rows.values())

    def records(self):
        return sorted(self._rows.values(), key=lambda r: (-r["count"], r["reason"]))


def observation_labels(ver_a, ver_b, ref_a, ref_b, observed_on=None):
    """What a note should call the two sides of a diff.

    info.version is the name a human recognises, and for most providers it is
    also a lie. GitHub tags v1.1.4 and v2.1.0 with info.version 1.1.4 in both,
    Twilio has shipped 1.0.0 since the spec existed, and OpenAI's 2.0.0 has
    covered every release since it was set. 119 of the 129 generated artifacts
    read "X existed in 2.0 and is gone in 2.0", which is true and tells nobody
    when anything died.

    When the two version strings are equal, name the refs that were actually
    compared and the day the comparison was made. Those are always different
    and always true, and the date is the part a reader needs: a note that is
    pinned to the moment it was made cannot go stale later, which is the same
    reason no generated note here states a deadline in the future tense.
    """
    if ver_a != ver_b:
        return ver_a, ver_b, ""
    day = observed_on or datetime.date.today().isoformat()
    return ref_a, ref_b, f" Observed {day}; the spec's own version stayed {ver_a}."


def diff(provider, ref_a, ref_b, min_len=4, observed_on=None):
    spec_a, spec_b = load_spec(provider, ref_a), load_spec(provider, ref_b)
    ops_a, ops_b = operations(spec_a), operations(spec_b)
    inv_a, inv_b = enum_inventory(spec_a), enum_inventory(spec_b)

    evidence = COMPARE.format(repo=PROVIDERS[provider]["repo"], a=ref_a, b=ref_b)
    ver_a = (spec_a.get("info") or {}).get("version", ref_a)
    ver_b = (spec_b.get("info") or {}).get("version", ref_b)
    tag_a, tag_b, dateline = observation_labels(ver_a, ver_b, ref_a, ref_b, observed_on)
    withheld = Withheld()
    artifacts = {}

    def add(kind, name, literals, severity, note, status):
        art_id = f"{provider}/{kind}/{name}"
        if art_id in artifacts:
            # An id is how a finding is cited, linked and suppressed. Two
            # artifacts under one id is a bug in this function, not data to
            # publish, so it stops the run rather than reaching a manifest.
            raise ValueError(f"duplicate artifact id {art_id!r} in {provider} diff")
        artifacts[art_id] = {
            "id": art_id,
            "kind": kind,
            "match": {"literals": sorted(literals)},
            "status": status,
            "severity": severity,
            "note": note,
            "evidence": evidence,
        }

    # Operations that disappeared, grouped by path.
    #
    # The literal we hand the scanner is the path and nothing else, because a
    # path is what appears in source. Keying the artifact by path alone while
    # emitting one per method therefore produced several artifacts with the
    # same id and the same literal: GitHub removed GET, PATCH, PUT and DELETE
    # from /scim/v2/enterprises/{enterprise}/Groups/{scim_group_id} in one
    # release and shipped that path four times over. Twelve ids repeated that
    # way, inflating every count this project publishes.
    #
    # Grouping also fixes a false finding hiding underneath. GitHub dropped PUT
    # from /orgs/{org}/actions/runner-groups/{runner_group_id}/repositories/
    # {repository_id} and kept DELETE, and Datadog dropped PATCH from
    # /api/v2/incidents/{incident_id}/attachments and kept GET and POST. The
    # path string in those callers' code still works, so calling it removed is
    # wrong. A path is only reported when every method on it is gone.
    live_paths_b = {op.split(" ", 1)[1] for op in ops_b}
    gone_by_path = {}
    for op in sorted(set(ops_a) - set(ops_b)):
        method, path = op.split(" ", 1)
        gone_by_path.setdefault(path, []).append(method)
    for path, methods in sorted(gone_by_path.items()):
        if path in live_paths_b:
            withheld.drop(PATH_STILL_SERVED, path, ", ".join(methods) + " removed")
            continue
        add("endpoint", path, [path], "breaking",
            f"{', '.join(methods)} {path} existed in {tag_a} and is gone in "
            f"{tag_b}.{dateline}", "removed")

    # Operations newly marked deprecated by the provider, grouped the same way
    # and for the same reason. A path cannot be both wholly removed and still
    # present, so these ids can never collide with the ones above.
    deprecated_by_path = {}
    for op in sorted(set(ops_a) & set(ops_b)):
        if ops_b[op]["deprecated"] and not ops_a[op]["deprecated"]:
            method, path = op.split(" ", 1)
            deprecated_by_path.setdefault(path, []).append(method)
    for path, methods in sorted(deprecated_by_path.items()):
        add("endpoint", path, [path], "warning",
            f"{', '.join(methods)} {path} was marked deprecated between {tag_a} "
            f"and {tag_b}.{dateline}", "deprecated")

    # Request parameters dropped from a surviving operation, keyed by the path
    # and the parameter. The same parameter removed from two methods of one
    # path used to produce the same id twice; and a parameter another method on
    # that path still accepts is not gone at all. Square dropped vendor_id from
    # PUT /v2/vendors/{vendor_id} while GET still takes it.
    accepted_b = {}
    for op, meta in ops_b.items():
        accepted_b.setdefault(op.split(" ", 1)[1], set()).update(meta["params"])
    dropped_params = {}
    for op in sorted(set(ops_a) & set(ops_b)):
        method, path = op.split(" ", 1)
        for p in sorted(ops_a[op]["params"] - ops_b[op]["params"]):
            if len(p) < min_len or not sendable_param(p):
                withheld.drop(PARAM_UNMATCHABLE, repr(p), op)
                continue
            dropped_params.setdefault((path, p), []).append(method)
    for (path, p), methods in sorted(dropped_params.items()):
        if p in accepted_b.get(path, set()):
            withheld.drop(PARAM_STILL_ACCEPTED, repr(p), path)
            continue
        add("request_param", f"{path}#{p}", [p], "breaking",
            f"Parameter '{p}' on {', '.join(methods)} {path} existed in {tag_a} "
            f"and is gone in {tag_b}.{dateline}", "removed")

    # Enum values the provider retired. This is the model-ID case.
    owners_a = enum_owners(spec_a)
    referrers_a = schema_referrers(spec_a)
    bag_b, fields_b = schema_bag(spec_b), owner_fields(spec_b)
    loosened = {}  # schema -> was it un-enumerated rather than withdrawn
    for value in sorted(set(inv_a) - set(inv_b)):
        if not distinctive_enum(value):
            withheld.drop(ENUM_TOO_ORDINARY, repr(value))
            continue
        # One loosened home is enough to withhold the value, not all of them.
        # What the artifact would assert is that the string no longer works,
        # and a single field that now takes any string is a place it still
        # does. Twilio's categories live in eleven enums and one of the eleven
        # is referenced only from a query parameter; requiring every home to be
        # loosened would have published all 637 on the strength of that one.
        homes = owners_a.get(value) or set()
        for home in homes:
            if home not in loosened:
                loosened[home] = stopped_enumerating(home, referrers_a, bag_b, fields_b)
        if any(loosened[home] for home in homes):
            withheld.drop(ENUM_UNENUMERATED, repr(value),
                          sorted(h for h in homes if loosened[h])[0])
            continue
        where = sorted(inv_a[value])
        # A value used in dozens of places is structural vocabulary, not a
        # retired identifier. Keep the narrow ones.
        if len(where) > 6:
            withheld.drop(ENUM_TOO_WIDESPREAD, repr(value), f"{len(where)} schemas")
            continue
        add("enum_value", value, [value], "breaking",
            f"Enum value '{value}' was valid in {tag_a} and is gone in {tag_b}. "
            f"Seen at: {where[0]}.{dateline}", "removed")

    return list(artifacts.values()), ver_a, ver_b, evidence, withheld


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
    # Real parameter shapes, but never a literal the feed carries: CI scans
    # scanner/ with driftcite and expects nothing.
    for good in ("idempotency_key", "page[size]", "store_id",
                 "search_queries_only", "max_tokens_to_sample"):
        assert sendable_param(good), f"{good!r} should be kept"

    # An enum schema that disappeared while the field it constrained survived
    # as a free string is Twilio's usage categories, not a retirement.
    twilio_a = {"components": {"schemas": {
        "usage_record_all_time_enum_category": {
            "type": "string", "enum": ["a2p-registration-fees", "sms-inbound"]},
        "api.v2010.usage_record_all_time": {"properties": {
            "category": {"$ref": "#/components/schemas/usage_record_all_time_enum_category"}}},
    }}}
    twilio_b = {"components": {"schemas": {
        "api.v2010.usage_record_all_time": {"properties": {
            "category": {"type": "string", "description": "See Usage Categories."}}},
    }}}
    refs = schema_referrers(twilio_a)
    assert stopped_enumerating("usage_record_all_time_enum_category", refs,
                               schema_bag(twilio_b), owner_fields(twilio_b)), \
        "loosened enum read as retired"

    # The same enum reached only through a query parameter. Walking schemas
    # alone missed this one, and Twilio has exactly one like it.
    param_a = {"components": {"schemas": {
        "usage_record_time_parameterized_enum_category": {"enum": ["a2p-registration-fees"]}}},
        "paths": {"/Usage/Records.json": {"get": {"parameters": [
            {"name": "Category",
             "schema": {"$ref": "#/components/schemas/usage_record_time_parameterized_enum_category"}}]}}}}
    param_b = {"components": {"schemas": {}},
               "paths": {"/Usage/Records.json": {"get": {"parameters": [
                   {"name": "Category", "schema": {"type": "string"}}]}}}}
    assert stopped_enumerating("usage_record_time_parameterized_enum_category",
                               schema_referrers(param_a), schema_bag(param_b),
                               owner_fields(param_b)), "parameter-only enum missed"

    # Datadog deleted DORAIncidentType and the schema that referenced it in the
    # same release. That surface really is gone, and must still be reported.
    dd_a = {"components": {"schemas": {
        "DORAIncidentType": {"enum": ["incident-record"]},
        "DORAIncidentResponseData": {"properties": {
            "type": {"$ref": "#/components/schemas/DORAIncidentType"}}},
    }}}
    dd_b = {"components": {"schemas": {}}}
    assert not stopped_enumerating("DORAIncidentType", schema_referrers(dd_a),
                                   schema_bag(dd_b), owner_fields(dd_b)), \
        "withdrawn surface read as loosened"

    # Square's V1SettlementEntryType is a Swagger 2 definition nothing $refs.
    # With no field to have been loosened, its deletion stands.
    sq_a = {"definitions": {"V1SettlementEntryType": {"enum": ["LEGACY_ENTRY_ROW"]}}}
    sq_b = {"definitions": {}}
    assert not stopped_enumerating("V1SettlementEntryType", schema_referrers(sq_a),
                                   schema_bag(sq_b), owner_fields(sq_b)), \
        "orphan enum swallowed"

    # A field that kept its enum and lost a member is an ordinary retirement.
    kept_b = {"components": {"schemas": {
        "api.v2010.usage_record_all_time": {"properties": {
            "category": {"type": "string", "enum": ["sms-inbound"]}}},
    }}}
    assert not stopped_enumerating("usage_record_all_time_enum_category", refs,
                                   schema_bag(kept_b), owner_fields(kept_b)), \
        "shortened enum read as loosened"

    # Notes have to say when something died. When the two spec versions are the
    # same string, saying it twice says nothing, so the refs and the day the
    # comparison ran stand in.
    tag_a, tag_b, line = observation_labels("1.1.4", "1.1.4", "v1.1.4", "v2.1.0",
                                            observed_on="2026-08-06")
    assert (tag_a, tag_b) == ("v1.1.4", "v2.1.0"), (tag_a, tag_b)
    assert "2026-08-06" in line, line
    assert observation_labels("2020-09-14_1.5.0", "2020-09-14_1.20.6", "a", "b") == \
        ("2020-09-14_1.5.0", "2020-09-14_1.20.6", "")

    # Withheld observations are counted and named, never dropped.
    w = Withheld()
    for v in ("one", "two", "three", "four"):
        w.drop(ENUM_TOO_ORDINARY, v)
    assert w.total() == 4 and w.records()[0]["count"] == 4
    assert len(w.records()[0]["examples"]) == 3, "examples should be a sample, not the lot"

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

    artifacts, ver_a, ver_b, evidence, withheld = diff(args.provider, args.ref_a, args.ref_b)

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

    # Printed even when nothing was withheld would be noise; printed only when
    # something was is the point. A run that observed 637 changes and published
    # none must not be able to look like a run that observed nothing.
    if withheld.total():
        print(f"  {withheld.total()} observation(s) withheld, not discarded:")
        for row in withheld.records():
            print(f"    {row['count']:>5}  {row['reason']}")
            print(f"           e.g. {row['examples'][0]}")
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
                               "from_api_version": ver_a, "to_api_version": ver_b,
                               "observed_on": datetime.date.today().isoformat(),
                               "withheld": withheld.records()},
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
