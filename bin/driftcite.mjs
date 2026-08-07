#!/usr/bin/env node
/**
 * driftcite: find the API calls in your code that already stopped working.
 *
 * Zero dependencies, by design. This runs on a stranger's machine and reads
 * their source, so it should be auditable in one sitting and pull nothing in.
 *
 * Nothing is sent anywhere. The only network calls are fetching the public
 * feed (skippable with --offline) and asking npm and PyPI whether a version
 * you already have installed was deprecated by its own maintainer.
 */

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicKey, verify as cryptoVerify } from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_FEED = path.join(HERE, "..", "feed", "feed.json");
const FEED_URL =
  "https://raw.githubusercontent.com/nilaypatell/driftcite/main/feed/feed.json";

/**
 * The live feed is signed, and this is the key it must verify against.
 *
 * "You should not have to trust us" was only mostly true while the feed
 * was fetched from a mutable branch: whoever controls the repository
 * controls what the feed says the providers said. The clock now signs
 * feed.json with an Ed25519 key that never leaves the maintainer's
 * machine, the signature travels beside it, and this pinned public key
 * decides whether a live feed is used at all. A feed that does not verify
 * is not an error and not a scan-stopper — the bundled copy inside the
 * npm tarball (already integrity-checked by npm itself) takes over, and
 * the report says so out loud. scripts/sign_feed.mjs holds the other end.
 */
const FEED_PUBKEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEABwzzGulmbaIQsOfrorjkpgQp2+xJFBnwYevroISVTCg=
-----END PUBLIC KEY-----
`;
const FEED_SIG_URL = `${FEED_URL}.sig`;

function verifyFeedSignature(bytes, sigBase64, pem = FEED_PUBKEY_PEM) {
  try {
    return cryptoVerify(
      null,
      bytes,
      createPublicKey(pem),
      Buffer.from(String(sigBase64).trim(), "base64"),
    );
  } catch {
    return false;
  }
}

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv",
  "venv", ".mypy_cache", ".pytest_cache", "coverage", ".turbo", "vendor",
  ".vercel", "out", ".cache", ".idea", "target",
]);

const SCAN_EXTS = new Set([
  ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rb", ".java",
  ".kt", ".cs", ".php", ".rs", ".sh", ".yaml", ".yml", ".json", ".toml", ".env",
  // Terraform, because that is where Lambda and Cloud Functions runtime ids
  // live in most infrastructure repos.
  ".tf",
]);

const MAX_BYTES = 2_000_000;
const SEVERITY_ORDER = { breaking: 0, warning: 1, info: 2 };
const SOON_DAYS = 90;

/**
 * Substring matching is wrong and produced three false positives for every
 * true one on the first real codebase. The parameter "refund" sits inside
 * "refunded" and inside a sentence about refunds; a retired enum value like
 * "hosted" is an ordinary English word. Each kind only counts in the shape it
 * actually takes when sent to a provider.
 */
const MATCH_SHAPES = {
  enum_value: ["quoted"],
  request_param: ["quoted", "key"],
  endpoint: ["quoted", "word"],
  model_id: ["quoted", "word"],
  tool_type: ["quoted", "word"],
  sdk_symbol: ["quoted", "word"],
  // A package name only counts quoted, because the word shape would let
  // "aws-sdk" match inside "@aws-sdk/client-s3" — the v2 artifact firing on
  // every repo that already did the migration it recommends.
  package: ["quoted"],
};
const DEFAULT_SHAPES = ["quoted", "word"];
/**
 * Kinds that never count without a provider marker in the file. Model IDs are
 * absent because they are normally distinctive enough to stand alone — but a
 * reseller is not: Azure serves gpt-4o and claude-opus-4-1 under its own,
 * earlier retirement dates, and reporting those to someone calling OpenAI or
 * Anthropic directly would be a wrong answer with a real date attached. Such
 * an artifact sets require_context and is held to the same gate.
 */
const CONTEXT_REQUIRED = new Set([
  "request_param", "sdk_symbol", "tool_type", "endpoint", "enum_value",
  // A runtime identifier ("python3.9", "go1.x") or a package name is only a
  // finding in a file that names its platform; the same string elsewhere is
  // just a version of Python.
  "package", "runtime",
]);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matcher(literal, kind, flags = "") {
  const lit = esc(literal);
  const parts = [];
  for (const shape of MATCH_SHAPES[kind] || DEFAULT_SHAPES) {
    if (shape === "quoted") parts.push(`['"\`]${lit}['"\`]`);
    else if (shape === "key") parts.push(`(?<![\\w.])${lit}\\s*[:=]`);
    else if (shape === "word") parts.push(`(?<![\\w./-])${lit}(?![\\w.-])`);
  }
  return new RegExp(parts.join("|"), flags);
}

/**
 * A manifest states a retirement date and then time passes. "Deprecated,
 * retires 2026-06-15" is simply retired once that date is behind us, and one
 * retiring next week is not a footnote. Severity is computed against today,
 * never frozen at authoring time.
 */
function applyDeadline(art, today = new Date()) {
  let severity = art.severity || "info";
  const status = art.status || "unknown";
  if (!art.retires_on) return { severity, status, daysLeft: null };
  const when = new Date(`${art.retires_on}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return { severity, status, daysLeft: null };
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((when.getTime() - utcToday) / 86_400_000);
  if (days < 0) return { severity: "breaking", status: "retired", daysLeft: days };
  if (days <= SOON_DAYS && severity !== "breaking") {
    return { severity: "breaking", status, daysLeft: days };
  }
  return { severity, status, daysLeft: days };
}

function deadlinePhrase(f) {
  if (f.daysLeft === null || f.daysLeft === undefined) {
    return f.retires_on ? ` (retires ${f.retires_on})` : "";
  }
  if (f.daysLeft < 0) return ` (DIED ${Math.abs(f.daysLeft)} days ago, ${f.retires_on})`;
  if (f.daysLeft === 0) return ` (DIES TODAY, ${f.retires_on})`;
  return ` (breaks in ${f.daysLeft} days, ${f.retires_on})`;
}

const urgency = (f) => [
  SEVERITY_ORDER[f.severity] ?? 3,
  f.daysLeft === null || f.daysLeft === undefined ? 1 : 0,
  f.daysLeft ?? 0,
];

function cmp(a, b) {
  const [x, y] = [urgency(a), urgency(b)];
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  // Artifact before file, so every occurrence of one artifact stays contiguous
  // and its heading is printed once rather than again for each file it appears
  // in. A retired model used in five files is one problem, not five.
  const ca = CONTEXT_RANK[a.context] ?? 9, cb = CONTEXT_RANK[b.context] ?? 9;
  if (ca !== cb) return ca - cb;
  if (a.artifact !== b.artifact) return a.artifact < b.artifact ? -1 : 1;
  return a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1;
}

async function loadFeed({ offline }) {
  if (!offline) {
    try {
      const [res, sigRes] = await Promise.all([
        fetch(FEED_URL, { signal: AbortSignal.timeout(15_000) }),
        fetch(FEED_SIG_URL, { signal: AbortSignal.timeout(15_000) }),
      ]);
      if (res.ok && sigRes.ok) {
        // Verify the exact bytes, then parse those same bytes — parsing the
        // response twice would leave a gap for the two reads to disagree.
        const bytes = Buffer.from(await res.arrayBuffer());
        if (verifyFeedSignature(bytes, await sigRes.text())) {
          return { feed: JSON.parse(bytes.toString("utf8")), source: "live" };
        }
        // A feed that fails verification is worth a loud line, not a quiet
        // downgrade: this is either key rotation mid-deploy or someone
        // else's hands on the feed, and both deserve attention.
        return {
          feed: JSON.parse(await readFile(BUNDLED_FEED, "utf8")),
          source: "bundled (live feed signature did not verify)",
        };
      }
      if (res.ok && sigRes.status === 404) {
        // The window between a feed commit and its signature existing at
        // this URL should be zero; treat absence like any other outage.
        return {
          feed: JSON.parse(await readFile(BUNDLED_FEED, "utf8")),
          source: "bundled (live feed is unsigned)",
        };
      }
    } catch {
      /* fall through to the bundled copy */
    }
  }
  if (existsSync(BUNDLED_FEED)) {
    return { feed: JSON.parse(await readFile(BUNDLED_FEED, "utf8")), source: "bundled" };
  }
  throw new Error("no feed available");
}

/** Every file worth opening, before any filtering by purpose. */
async function* walkAll(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      yield* walkAll(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

/** Source files, for drift scanning. */
async function* walk(dir) {
  for await (const file of walkAll(dir)) {
    // The local manifest contains every one of its own literals by definition,
    // the same reason a vendored feed is skipped by content below.
    if (path.basename(file) === LOCAL_FILE) continue;
    if (SCAN_EXTS.has(path.extname(file).toLowerCase())) yield file;
  }
}

/**
 * Dependency manifests, matched by filename rather than extension.
 * requirements.txt is a .txt file and must never be swept into the source
 * scan, but it is exactly where the pinned Python versions live.
 */
async function* walkManifests(dir, pattern) {
  for await (const file of walkAll(dir)) {
    if (pattern.test(path.basename(file))) yield file;
  }
}

/**
 * Documentation quotes parameter names constantly, and a comment is never a
 * call site. Cheap and deliberately conservative: only lines that *begin* with
 * a comment marker are skipped, so a trailing comment after real code still
 * gets scanned.
 */
const COMMENT_START = /^\s*(#|\/\/|\*|<!--|--|;)/;
const isComment = (line) => COMMENT_START.test(line);

/**
 * Where a finding lives changes what it means. A retired model id in
 * production source is a call that fails; the same string in a test fixture,
 * an example, or documentation is usually deliberate and sometimes must stay
 * exactly as it is. Reporting both as one number wastes people's attention on
 * the wrong lines, so context is labelled and source is ranked first.
 */
function fileContext(rel) {
  const p = rel.replace(/\\/g, "/").toLowerCase();
  if (/(^|\/)(tests?|__tests__|spec|testdata|fixtures?|mocks?)(\/|$)/.test(p) ||
      /(^|\/)[^/]*[._-](test|spec)\.[a-z]+$/.test(p) ||
      /(^|\/)(test|spec)_[^/]*\.[a-z]+$/.test(p)) return "test";
  if (/(^|\/)(examples?|samples?|demos?|cookbook|recipes?|notebooks?)(\/|$)/.test(p) ||
      /\.ipynb$/.test(p)) return "example";
  if (/(^|\/)(docs?|documentation|website|site)(\/|$)/.test(p) ||
      /\.(md|mdx|rst|txt)$/.test(p)) return "doc";
  return "source";
}

const CONTEXT_RANK = { source: 0, example: 1, test: 2, doc: 3 };

/**
 * Suppression, and why it exists.
 *
 * A team adds this to CI, hits one finding they will not fix (vendored code, a
 * deliberate pin, a model they still have access to), and their build fails on
 * every commit forever. So they delete the tool. That is how linters die, and
 * no amount of accuracy prevents it.
 *
 * Two mechanisms, deliberately different:
 *
 *   .driftciteignore  a permanent decision. "This path or artifact is not our
 *                     problem." Survives new findings.
 *   baseline          a snapshot. "Everything broken today is accepted; fail
 *                     only on something new." The honest way to adopt this in
 *                     a codebase that already has drift.
 *
 * A suppressed finding is still counted and reported as suppressed, never
 * silently dropped, because a tool that hides things is worse than one that
 * annoys.
 */
const IGNORE_FILE = ".driftciteignore";
const BASELINE_FILE = ".driftcite-baseline.json";

/**
 * A repo can carry artifacts for APIs this feed does not track: an internal
 * service, a vendor too small for the public feed, or a provider whose PR to
 * providers.yaml has not merged yet. They live in one JSON file at the scan
 * root, in exactly the feed's artifact shape — same fields, same vocabulary,
 * same rules — so nothing downstream needs to know where an artifact came
 * from.
 *
 * The file is validated with the same checks the feed's own self-test runs,
 * and an artifact that fails is skipped and named, never silently dropped and
 * never silently accepted. The feed wins collisions: a local artifact claiming
 * a literal the feed already carries would put two death dates on one line of
 * code, which is the exact bug the build refuses upstream.
 */
const LOCAL_FILE = ".driftcite-local.json";
const LOCAL_STATUS = new Set(["removed", "retired", "deprecated"]);
const LOCAL_SEVERITY = new Set(["breaking", "warning", "info"]);

function validateLocalArtifact(art, i, feedIds, feedLiterals) {
  const where = art?.id || `artifacts[${i}]`;
  if (!art || typeof art !== "object") return `${where}: not an object`;
  if (!art.id) return `${where}: no id`;
  if (!art.provider) return `${where}: no provider`;
  if (!art.kind) return `${where}: no kind`;
  const literals = art.match?.literals;
  if (!Array.isArray(literals) || !literals.length) {
    return `${where}: no match.literals, so it can never match anything`;
  }
  if (!LOCAL_STATUS.has(art.status)) {
    return `${where}: status ${JSON.stringify(art.status)} is not one of ` +
      `${[...LOCAL_STATUS].sort().join(", ")}`;
  }
  if (!LOCAL_SEVERITY.has(art.severity)) {
    return `${where}: severity ${JSON.stringify(art.severity)} is not one of ` +
      `${[...LOCAL_SEVERITY].sort().join(", ")}`;
  }
  if (!art.evidence || !String(art.evidence).startsWith("http")) {
    return `${where}: no evidence URL; every fact cites a source, yours included`;
  }
  for (const key of ["retires_on", "announced_on"]) {
    if (art[key] != null && Number.isNaN(new Date(`${art[key]}T00:00:00Z`).getTime())) {
      return `${where}: ${key} ${JSON.stringify(art[key])} is not a date`;
    }
  }
  if (CONTEXT_REQUIRED.has(art.kind) && !(art.file_markers || []).length) {
    return `${where}: kind ${JSON.stringify(art.kind)} needs file_markers, or a ` +
      `retired parameter named "refund" flags every codebase that mentions refunds`;
  }
  if (feedIds.has(art.id)) return `${where}: the public feed already carries this id`;
  for (const lit of literals) {
    if (feedLiterals.has(lit)) {
      return `${where}: literal ${JSON.stringify(lit)} already belongs to ` +
        `${feedLiterals.get(lit)} in the public feed; two artifacts on one ` +
        `literal is two death dates on one line of code`;
    }
  }
  return null;
}

async function loadLocal(root, feedArtifacts) {
  let text;
  try {
    text = await readFile(path.join(root, LOCAL_FILE), "utf8");
  } catch {
    return null;
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    return {
      artifacts: [],
      problems: [`${LOCAL_FILE} is not valid JSON: ${String(err.message).slice(0, 80)}`],
    };
  }
  const feedIds = new Set(feedArtifacts.map((a) => a.id));
  const feedLiterals = new Map();
  for (const a of feedArtifacts) {
    for (const lit of a.match?.literals || []) feedLiterals.set(lit, a.id);
  }
  const artifacts = [];
  const problems = [];
  const seen = new Set();
  (Array.isArray(doc.artifacts) ? doc.artifacts : []).forEach((art, i) => {
    const problem = validateLocalArtifact(art, i, feedIds, feedLiterals);
    if (problem) return problems.push(problem);
    if (seen.has(art.id)) return problems.push(`${art.id}: id appears more than once`);
    seen.add(art.id);
    artifacts.push({ ...art, file_markers: art.file_markers || [] });
  });
  return { artifacts, problems };
}

/**
 * The $example block is data the loader never reads, which is the only way a
 * JSON template can carry its own documentation without the act of writing it
 * creating findings.
 */
const LOCAL_TEMPLATE = `{
 "local_version": 1,
 "$readme": [
  "Artifacts for APIs the public driftcite feed does not track — internal",
  "services included. Same shape and rules as the feed: distinctive literals",
  "only, an evidence URL on every artifact, and no guessed dates. Kinds other",
  "than model_id need file_markers naming the API, or common words would flag",
  "unrelated code. Copy $example into artifacts to start.",
  "Public API? Upstream it: https://github.com/nilaypatell/driftcite"
 ],
 "$example": {
  "id": "acme-internal/endpoint//v1/users",
  "provider": "acme-internal",
  "kind": "endpoint",
  "match": { "literals": ["/v1/users"] },
  "status": "deprecated",
  "severity": "warning",
  "retires_on": "2027-01-31",
  "replacement": "/v2/users",
  "note": "Deprecated 2026-08-01 by the platform team; v1 shuts down 2027-01-31.",
  "evidence": "https://wiki.example.com/platform/v1-sunset",
  "file_markers": ["api.acme.internal", "ACME_API_TOKEN"]
 },
 "artifacts": []
}
`;

function globToRe(glob) {
  const body = glob.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^]*");
  return new RegExp(`^${body}$`);
}

async function loadIgnores(root) {
  let text;
  try {
    text = await readFile(path.join(root, IGNORE_FILE), "utf8");
  } catch {
    return [];
  }
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    // "path/glob" or "artifact-id" or "path/glob :: artifact-id"
    const [left, right] = line.split("::").map((x) => x && x.trim());
    if (right) rules.push({ path: globToRe(left), artifact: right });
    else if (left.includes("/") && !left.includes(" ")) {
      // An artifact id also contains slashes; tell them apart by whether the
      // first segment names a provider we know about.
      rules.push({ maybe: left, path: globToRe(left), artifact: left });
    } else rules.push({ artifact: left });
  }
  return rules;
}

function ignoreMatches(rule, finding, providers) {
  if (rule.maybe) {
    const isArtifact = providers.has(rule.maybe.split("/")[0]);
    return isArtifact ? finding.artifact === rule.maybe : rule.path.test(finding.file);
  }
  if (rule.path && rule.artifact) {
    return rule.path.test(finding.file) && finding.artifact === rule.artifact;
  }
  if (rule.path) return rule.path.test(finding.file);
  return finding.artifact === rule.artifact;
}

async function loadBaseline(root) {
  try {
    const doc = JSON.parse(await readFile(path.join(root, BASELINE_FILE), "utf8"));
    return new Set(doc.accepted || []);
  } catch {
    return null;
  }
}

/** Identity that survives edits elsewhere in the file: not the line number. */
const fingerprint = (f) => `${f.file}::${f.artifact}`;

function isDriftData(text) {
  const head = text.slice(0, 4000);
  if (head.includes('"feed_version"') || head.includes("feed_version:")) return true;
  return /(^|\n)\s*spec_version\s*:/.test(head) && /(^|\n)artifacts\s*:/.test(text.slice(0, 20000));
}

async function scanRepo(root, artifacts) {
  // Longest literal first so a specific id wins over a prefix of itself.
  const index = [];
  for (const art of artifacts) {
    for (const lit of art.match?.literals || []) index.push({ lit, art });
  }
  index.sort((a, b) => b.lit.length - a.lit.length);

  const findings = [];
  for await (const file of walk(root)) {
    let text;
    try {
      if ((await stat(file)).size > MAX_BYTES) continue;
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    // A drift manifest contains every literal by definition, so scanning one
    // reports the whole feed as findings. Anyone who vendors the feed into
    // their repo would hit this, not just us.
    if (isDriftData(text)) continue;

    const lowered = text.toLowerCase();
    let lines = null;

    /**
     * Which literal claimed which stretch of which line.
     *
     * An endpoint literal is a prefix of its own sub-paths, and the "word"
     * shape has to allow a trailing slash so that /v1/invoices/upcoming still
     * matches inside a URL that continues past it. The cost is that the parent
     * artifact also matches inside /v1/invoices/upcoming/lines, and one call
     * site came back as two findings, once under each id. Recording the span
     * each literal matched, rather than only that it matched somewhere on the
     * line, is what lets the longer literal win exactly where the two overlap
     * while a shorter one standing on its own further along the same line is
     * still its own call.
     */
    const claims = new Map();

    for (const { lit, art } of index) {
      if (!text.includes(lit)) continue;
      if (CONTEXT_REQUIRED.has(art.kind) || art.require_context) {
        const markers = art.file_markers || [];
        if (markers.length && !markers.some((m) => lowered.includes(m.toLowerCase()))) continue;
      }
      const re = matcher(lit, art.kind);
      if (!re.test(text)) continue;
      if (lines === null) lines = text.split(/\r?\n/);

      const all = matcher(lit, art.kind, "g");
      for (let i = 0; i < lines.length; i++) {
        if (isComment(lines[i])) continue;
        all.lastIndex = 0;
        const spans = [...lines[i].matchAll(all)].map((m) => [m.index, m.index + m[0].length]);
        if (!spans.length) continue;
        if (!claims.has(i)) claims.set(i, []);
        claims.get(i).push({ art, lit, spans });
      }
    }

    const rel = path.relative(root, file);
    for (const i of [...claims.keys()].sort((a, b) => a - b)) {
      const onLine = claims.get(i);
      for (const claim of onLine) {
        // Every place this literal appeared sits inside something longer that
        // also matched here, so it is the same call site read through a less
        // specific artifact rather than a second one.
        const shadowed = claim.spans.every(([s, e]) => onLine.some(
          (other) => other.lit.length > claim.lit.length &&
            other.spans.some(([os, oe]) => os <= s && oe >= e)
        ));
        if (shadowed) continue;
        const art = claim.art;
        const { severity, status, daysLeft } = applyDeadline(art);
        findings.push({
          context: fileContext(rel),
          file: rel,
          line: i + 1,
          artifact: art.id,
          severity, status, daysLeft,
          retires_on: art.retires_on ?? null,
          note: art.note || "",
          replacement: art.replacement ?? null,
          evidence: art.evidence ?? null,
          excerpt: lines[i].trim().slice(0, 160),
        });
      }
    }
  }

  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.artifact}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --------------------------------------------------------------------- fixes

/**
 * A replacement is only applied when it is a drop-in swap of one literal for
 * another. Manifests carry prose in that field too ("thinking: {type:
 * adaptive} plus output_config.effort", "none, effort is GA"), and guessing at
 * prose is how an automated fix breaks somebody's build. Those are reported
 * and left alone.
 *
 * There is no model anywhere in this path. It replaces a string the provider
 * retired with the string the provider named, inside the exact quoting the
 * code already used.
 */
const FIXABLE_KINDS = new Set(["model_id", "enum_value", "endpoint"]);
const CLEAN_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/**
 * Refuse a swap when the replacement value is already present in the file.
 *
 * Catalogues, pricing tables and provider registries key an object by model
 * id, and renaming one key to a value the file already uses produces a
 * duplicate key that silently overwrites its twin. Worse, the surrounding
 * fields still describe the old model: renaming a pricing key leaves the old
 * rates attached to the new name.
 *
 * Found by applying this to a real backend, where it collided two entries in a
 * provider registry and repriced one model at another's rate. A literal swap
 * can be correct on its own line and wrong in its file.
 */
function wouldCollide(text, replacement) {
  const re = new RegExp(`['"\`]${esc(replacement)}['"\`]`);
  return re.test(text);
}

function isFixable(art) {
  if (!FIXABLE_KINDS.has(art.kind)) return false;
  const r = art.replacement;
  if (!r || typeof r !== "string") return false;
  return CLEAN_TOKEN.test(r.trim()) && !/\s/.test(r.trim());
}

async function planFixes(root, findings, artifactsById) {
  const targets = new Map();   // file -> [{finding, art}]
  const unfixable = new Map(); // artifact id -> reason

  for (const f of findings) {
    const art = artifactsById.get(f.artifact);
    if (!art) continue;
    if (!isFixable(art)) {
      if (!unfixable.has(art.id)) {
        unfixable.set(art.id, art.replacement
          ? `replacement is not a drop-in swap: ${String(art.replacement).slice(0, 90)}`
          : "the provider named no replacement");
      }
      continue;
    }
    if (!targets.has(f.file)) targets.set(f.file, []);
    targets.get(f.file).push({ finding: f, art });
  }

  const edits = [];
  const writes = [];   // {full, body} decided only after every edit succeeded

  for (const [file, items] of targets) {
    const full = path.join(root, file);
    let original;
    try {
      original = await readFile(full, "utf8");
    } catch {
      continue;
    }

    // Preserve the file's existing line endings rather than normalising them.
    const eol = original.includes("\r\n") ? "\r\n" : "\n";
    const lines = original.split(/\r?\n/);
    const fileEdits = [];
    const collided = new Set();
    // Two DIFFERENT retired ids can share one replacement: both
    // claude-3-5-haiku-20241022 and claude-3-haiku-20240307 point at
    // claude-haiku-4-5, and applying both duplicates a key. But one id
    // appearing several times in a file must be fixed at every occurrence, so
    // this records which artifact introduced a value, not merely that it was
    // introduced.
    const introducedBy = new Map();

    for (const { finding, art } of items) {
      const i = finding.line - 1;
      if (i < 0 || i >= lines.length) continue;
      if (isComment(lines[i])) continue;

      const replacement = art.replacement.trim();
      const clash = introducedBy.has(replacement) && introducedBy.get(replacement) !== art.id;
      if (wouldCollide(original, replacement) || clash) {
        if (!collided.has(art.id)) {
          collided.add(art.id);
          const why = clash
            ? `another retired id in this file already maps to "${replacement}"; ` +
              "applying both would duplicate a key"
            : `"${replacement}" already appears in this file; swapping would ` +
              "duplicate a key or leave neighbouring fields describing the old value";
          unfixable.set(`${file} :: ${art.id}`, why);
        }
        continue;
      }
      for (const literal of art.match?.literals || []) {
        if (literal === replacement) continue;
        // Swap only inside the quoting the code already uses, so a bare
        // occurrence in prose or a longer identifier is never touched.
        const quoted = new RegExp(`(['"\`])${esc(literal)}\\1`, "g");
        const before = lines[i];
        const after = before.replace(quoted, `$1${replacement}$1`);
        if (after === before) continue;

        lines[i] = after;
        introducedBy.set(replacement, art.id);
        fileEdits.push({
          file, line: finding.line, from: literal, to: replacement,
          artifact: art.id, evidence: art.evidence ?? null,
          before: before.trim(), after: after.trim(),
        });
      }
    }

    if (!fileEdits.length) continue;

    const body = lines.join(eol);
    // Only the intended lines may differ. If anything else moved, the file is
    // left untouched rather than half-edited.
    const originalLines = original.split(/\r?\n/);
    const newLines = body.split(/\r?\n/);
    const touched = new Set(fileEdits.map((e) => e.line - 1));
    let safe = originalLines.length === newLines.length;
    if (safe) {
      for (let i = 0; i < originalLines.length; i++) {
        if (!touched.has(i) && originalLines[i] !== newLines[i]) {
          safe = false;
          break;
        }
      }
    }
    if (!safe) {
      unfixable.set(file, "edit would have changed lines it did not intend; skipped");
      continue;
    }

    edits.push(...fileEdits);
    writes.push({ full, body });
  }

  return {
    edits,
    writes,
    unfixable: [...unfixable].map(([artifact, reason]) => ({ artifact, reason })),
  };
}

function reportFixes(edits, unfixable, wrote) {
  if (edits.length) {
    console.log(
      c(BOLD, wrote ? `applied ${edits.length} fix(es)` : `${edits.length} fix(es) available`)
    );
    for (const e of edits) {
      console.log(`\n  ${e.file}:${e.line}`);
      console.log(c(RED, `    - ${e.before}`));
      console.log(c(GRN, `    + ${e.after}`));
      if (e.evidence) console.log(c(DIM, `    ${e.evidence}`));
    }
    console.log();
    if (!wrote) console.log(c(DIM, "  run again with --write to apply\n"));
  }
  if (unfixable.length) {
    console.log(c(BOLD, `${unfixable.length} finding(s) need a human`));
    for (const u of unfixable) {
      console.log(`  ${u.artifact}`);
      console.log(c(DIM, `    ${u.reason}`));
    }
    console.log();
  }
}

// ---------------------------------------------------------------- registries

const DEP_MANIFESTS = {
  npmLock: /^package-lock\.json$/,
  pnpmLock: /^pnpm-lock\.yaml$/,
  yarnLock: /^yarn\.lock$/,
  reqs: /^requirements(-.+)?\.txt$/,
  gemLock: /^Gemfile\.lock$/,
  cargoLock: /^Cargo\.lock$/,
  goSum: /^go\.sum$/,
  pkgJson: /^package\.json$/,
};

// Formats we recognise but do not read yet. Saying so beats silence: a
// scanner that quietly skips your lockfile looks clean when it is blind.
const UNSUPPORTED_MANIFESTS = [
  [/^poetry\.lock$/, "poetry.lock is not read yet; export a pinned requirements.txt for coverage"],
  [/^uv\.lock$/, "uv.lock is not read yet; export a pinned requirements.txt for coverage"],
  [/^Pipfile\.lock$/, "Pipfile.lock is not read yet"],
];

async function collectDepFiles(root) {
  const files = {
    npmLock: [], pnpmLock: [], yarnLock: [], reqs: [],
    gemLock: [], cargoLock: [], goSum: [], pkgJson: [],
  };
  const notes = new Set();
  for await (const file of walkAll(root)) {
    const base = path.basename(file);
    for (const [bucket, pattern] of Object.entries(DEP_MANIFESTS)) {
      if (pattern.test(base)) files[bucket].push(file);
    }
    for (const [pattern, note] of UNSUPPORTED_MANIFESTS) {
      if (pattern.test(base)) notes.add(note);
    }
  }
  return { files, notes: [...notes] };
}

async function npmDeps(paths, root) {
  const found = new Map();
  for (const file of paths) {
    let data;
    try {
      data = JSON.parse(await readFile(file, "utf8"));
    } catch {
      continue;
    }
    const rel = path.relative(root, file);
    // lockfile v2/v3
    for (const [p, meta] of Object.entries(data.packages || {})) {
      if (!p.startsWith("node_modules/")) continue;
      const name = p.split("node_modules/").pop();
      if (name && meta?.version) found.set(`${name}@${meta.version}`, rel);
    }
    // lockfile v1
    const walkV1 = (deps) => {
      for (const [name, meta] of Object.entries(deps || {})) {
        if (meta?.version) found.set(`${name}@${meta.version}`, rel);
        walkV1(meta?.dependencies);
      }
    };
    walkV1(data.dependencies);
  }
  return found;
}

/**
 * One pnpm-lock key, in any of the shapes pnpm has shipped:
 *   v5: /@scope/name/1.2.3_peerhash   v6: /@scope/name@1.2.3(peer@x)
 *   v9: '@scope/name@1.2.3'           or   name@1.2.3
 */
function parsePnpmKey(raw) {
  let key = raw.trim();
  if (key.endsWith(":")) key = key.slice(0, -1);
  key = key.replace(/^['"]|['"]$/g, "").replace(/\([^)]*\)/g, "");
  if (key.startsWith("/")) key = key.slice(1);
  if (!key) return null;
  let name, version;
  const at = key.lastIndexOf("@");
  if (at > 0) {
    name = key.slice(0, at);
    version = key.slice(at + 1);
  } else {
    const slash = key.lastIndexOf("/");
    if (slash <= 0) return null;
    name = key.slice(0, slash);
    version = key.slice(slash + 1);
  }
  version = version.split("_")[0];
  if (!/^\d/.test(version)) return null;
  if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(name)) return null;
  return { name, version };
}

async function pnpmDeps(paths, root) {
  const found = new Map();
  for (const file of paths) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file);
    let inPackages = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^\S/.test(line)) {
        inPackages = line.startsWith("packages:");
        continue;
      }
      if (!inPackages) continue;
      const m = /^ {2}(\S.*):\s*$/.exec(line);
      if (!m) continue;
      const parsed = parsePnpmKey(m[1]);
      if (parsed) found.set(`${parsed.name}@${parsed.version}`, rel);
    }
  }
  return found;
}

async function yarnDeps(paths, root) {
  const found = new Map();
  for (const file of paths) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file);
    // Classic yarn: `name@range, name@range:` then `  version "1.2.3"`.
    // Berry: `"name@npm:range":` then `  version: 1.2.3`.
    // Same shape both times: selectors on one line, resolved version below,
    // so one parser covers both eras.
    let pending = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.trimStart().startsWith("#")) continue;
      if (/^\S/.test(line) && line.trimEnd().endsWith(":")) {
        pending = [];
        for (let sel of line.trimEnd().slice(0, -1).split(",")) {
          sel = sel.trim().replace(/^['"]|['"]$/g, "");
          const at = sel.indexOf("@", 1); // skip a leading @scope
          if (at <= 0) continue;
          pending.push(sel.slice(0, at));
        }
        continue;
      }
      const vm = /^\s+version:?\s+"?([^\s"]+)"?\s*$/.exec(line);
      if (vm && pending.length) {
        for (const name of pending) found.set(`${name}@${vm[1]}`, rel);
        pending = [];
      }
    }
  }
  return found;
}

/**
 * Pinned Python requirements. Only `name==version` is read: a `>=` line does
 * not say which version is actually running, and guessing would produce
 * findings about a version the user may not have.
 */
async function pypiDeps(paths, root) {
  const found = new Map();
  const PINNED = /^\s*([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*==\s*([A-Za-z0-9._+!-]+)/;
  for (const file of paths) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file);
    for (const line of text.split(/\r?\n/)) {
      const t = line.trimStart();
      if (!t || t.startsWith("#") || t.startsWith("-")) continue;
      const m = PINNED.exec(line);
      if (m) found.set(`${m[1]}@${m[2]}`, rel);
    }
  }
  return found;
}

/**
 * Gemfile.lock. Only the GEM section's `specs:` block is read, where a gem
 * and its exact version sit at a known indent; the DEPENDENCIES block below
 * carries constraints rather than resolved versions, and PATH or GIT sections
 * are not on rubygems.org at all.
 *
 * A platform suffix (`nokogiri (1.16.0-x86_64-linux)`) is kept verbatim here
 * and reconciled against the registry's own version list later, because the
 * registry publishes the platform as a separate field.
 */
async function gemDeps(paths, root) {
  const found = new Map();
  const SPEC = /^ {4}([A-Za-z0-9._-]+) \(([^()]+)\)$/;
  for (const file of paths) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file);
    let inGemSpecs = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^\S/.test(line)) inGemSpecs = false;
      if (line === "GEM") inGemSpecs = "pending";
      else if (inGemSpecs === "pending" && line === "  specs:") inGemSpecs = true;
      else if (inGemSpecs === true) {
        const m = SPEC.exec(line);
        if (m) found.set(`${m[1]}@${m[2]}`, rel);
      }
    }
  }
  return found;
}

/**
 * Cargo.lock, which is TOML but regular enough to read without a parser:
 * every entry is a [[package]] table with name and version on their own
 * lines. Packages carrying a `source` of anything but crates.io are skipped,
 * since a git or path dependency has no registry to ask.
 */
async function cargoDeps(paths, root) {
  const found = new Map();
  for (const file of paths) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file);
    for (const block of text.split(/^\[\[package\]\]$/m).slice(1)) {
      const body = block.split(/^\[/m)[0];
      const name = /^name = "([^"]+)"/m.exec(body)?.[1];
      const version = /^version = "([^"]+)"/m.exec(body)?.[1];
      const source = /^source = "([^"]+)"/m.exec(body)?.[1];
      if (!name || !version) continue;
      if (source && !source.startsWith("registry+https://github.com/rust-lang/crates.io")) {
        continue;
      }
      if (!source) continue; // a workspace member, not a published crate
      found.set(`${name}@${version}`, rel);
    }
  }
  return found;
}

/**
 * go.sum. Two lines per module — `mod v1.2.3 h1:…` and `mod v1.2.3/go.mod
 * h1:…` — and only the first shape is a dependency; the `/go.mod` twin is
 * the checksum of a manifest Go read while resolving, present even for
 * modules that never ship code into the build. Reading both would double
 * every module and invent dependencies out of build-list bookkeeping.
 *
 * Versions are kept verbatim, pseudo-versions and +incompatible included,
 * because the proxy answers for exactly the string the lockfile pinned.
 */
async function goDeps(paths, root) {
  const found = new Map();
  const LINE = /^(\S+)\s+(v\S+?)(\/go\.mod)?\s+h1:/;
  for (const file of paths) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file);
    for (const line of text.split(/\r?\n/)) {
      const m = LINE.exec(line);
      if (m && !m[3]) found.set(`${m[1]}@${m[2]}`, rel);
    }
  }
  return found;
}

/**
 * A registry answer, and the difference between "no" and "could not ask".
 *
 * Each of these lookups used to return {} from a bare catch, so a dropped
 * connection, a rate limit or a 500 was indistinguishable from a package the
 * registry had nothing against. The user then read "No drift found" when the
 * truth was that the question never got through. These two constructors are
 * what makes that difference sayable, and every caller has to unwrap one.
 */
const answered = (versions) => ({ ok: true, versions });
const unanswered = (why) => ({ ok: false, why });

/**
 * A 404 is an answer, not a failure: the package is not published on this
 * registry at all — private, renamed, vendored, or an internal name that
 * happens to collide. Nothing was yanked and nothing is unknown. Any other
 * refusal (429, 403, 5xx) means the question went unanswered and has to be
 * counted as such.
 */
function fromStatus(res) {
  if (res.status === 404) return answered({});
  return unanswered(`HTTP ${res.status}`);
}

/** The full stack of a fetch failure is noise in a one-line note. */
function whyFailed(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "timed out";
  const code = err?.cause?.code || err?.code;
  if (code) return String(code);
  return err?.message ? String(err.message).slice(0, 60) : "request failed";
}

async function checkCrates(name) {
  try {
    const res = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`, {
      // crates.io rejects requests that do not identify themselves.
      headers: { "user-agent": "driftcite (+https://github.com/nilaypatell/driftcite)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return fromStatus(res);
    const doc = await res.json();
    const out = {};
    for (const v of doc.versions || []) {
      if (v?.yanked && v?.num) out[v.num] = "yanked from crates.io";
    }
    return answered(out);
  } catch (err) {
    return unanswered(whyFailed(err));
  }
}

/**
 * RubyGems publishes no yanked flag: a yanked version simply stops appearing
 * in the version list. So this asks a narrower question than the other
 * registries do, and says exactly that in the finding. We report only when
 * the gem itself is public and known and the pinned version is missing from
 * it, which is what a fresh `bundle install` would hit. Claiming the
 * maintainer "deprecated" it would be inventing a statement nobody made.
 */
async function checkRubygems(name) {
  try {
    const res = await fetch(
      `https://rubygems.org/api/v1/versions/${encodeURIComponent(name)}.json`,
      { signal: AbortSignal.timeout(20_000) }
    );
    if (!res.ok) return fromStatus(res);
    const doc = await res.json();
    // A body that is not a version list answers nothing about any version,
    // but the registry did reply, so this is not an outage.
    if (!Array.isArray(doc) || doc.length === 0) return answered({});
    const served = new Set();
    for (const v of doc) {
      if (typeof v?.number !== "string") continue;
      served.add(v.number);
      if (v.platform && v.platform !== "ruby") served.add(`${v.number}-${v.platform}`);
    }
    return answered({ served });
  } catch (err) {
    return unanswered(whyFailed(err));
  }
}

async function checkNpm(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return fromStatus(res);
    const doc = await res.json();
    const out = {};
    for (const [v, meta] of Object.entries(doc.versions || {})) {
      if (meta?.deprecated) out[v] = String(meta.deprecated).trim();
    }
    return answered(out);
  } catch (err) {
    return unanswered(whyFailed(err));
  }
}

async function checkPypi(name) {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return fromStatus(res);
    const doc = await res.json();
    const out = {};
    for (const [v, files] of Object.entries(doc.releases || {})) {
      const first = Array.isArray(files) ? files[0] : null;
      if (first?.yanked) {
        out[v] = (first.yanked_reason || "").trim() || "yanked, no reason given";
      }
    }
    return answered(out);
  } catch (err) {
    return unanswered(whyFailed(err));
  }
}

/**
 * Go's registry speaks a different shape from all the others, so its answer
 * does too. There is no per-version yanked flag: a maintainer writes
 * `retract` directives and a `// Deprecated:` comment into the LATEST
 * go.mod, and clients are expected to read them from there. So this asks
 * the module proxy two questions — what is latest, and what does its
 * go.mod say — and returns { all, retract } for resolveFlagged to apply:
 * `all` covers every pinned version of a module deprecated outright,
 * `retract` is ranges the pinned version is compared against.
 *
 * The proxy path is case-encoded (an uppercase letter becomes '!' plus its
 * lowercase), and both 404 and 410 mean "not known here" — the proxy uses
 * them interchangeably — which is an answer, not an outage.
 */
const goEscape = (mod) => mod.replace(/[A-Z]/g, (ch) => "!" + ch.toLowerCase());

function parseGoMod(text) {
  const out = { deprecated: null, retract: [] };
  const lines = text.split(/\r?\n/);

  // "// Deprecated: reason" lives in the comment block directly above the
  // module directive, per the go command's own convention.
  const before = [];
  for (const line of lines) {
    if (/^\s*module\s/.test(line)) break;
    const m = /^\s*\/\/\s?(.*)$/.exec(line);
    if (m) before.push(m[1]);
    else if (line.trim()) before.length = 0;
  }
  const dep = /(?:^|\s)Deprecated:\s*(.*)$/s.exec(before.join(" "));
  if (dep) out.deprecated = dep[1].trim();

  // retract, in its three spellings: bare, range, and a parenthesised block
  // of either. The comment beside a retraction is its rationale.
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (inBlock) {
      if (line.startsWith(")")) { inBlock = false; continue; }
      const r = parseRetractLine(line);
      if (r) out.retract.push(r);
      continue;
    }
    if (/^retract\s*\($/.test(line)) { inBlock = true; continue; }
    const single = /^retract\s+(.+)$/.exec(line);
    if (single) {
      const r = parseRetractLine(single[1]);
      if (r) out.retract.push(r);
    }
  }
  return out;
}

function parseRetractLine(line) {
  const comment = /\/\/\s*(.*)$/.exec(line);
  const reason = comment ? comment[1].trim() : "";
  const body = line.replace(/\/\/.*$/, "").trim();
  const range = /^\[\s*(v\S+?)\s*,\s*(v\S+?)\s*\]$/.exec(body);
  if (range) return { lo: range[1], hi: range[2], reason };
  const single = /^(v\S+)$/.exec(body);
  if (single) return { lo: single[1], hi: single[1], reason };
  return null;
}

/**
 * Enough semver ordering to place a pinned version inside a retract range:
 * numeric core compared numerically, a prerelease sorts before its release,
 * prerelease identifiers compared the way semver says. Go pseudo-versions
 * are ordinary prereleases with fixed-width timestamps, so they order
 * correctly under exactly these rules.
 */
function cmpGoVersion(a, b) {
  const parse = (v) => {
    const [core, pre = null] = v.replace(/^v/, "").split("+")[0].split(/-(.+)/s);
    return { nums: core.split(".").map(Number), pre };
  };
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    const d = (pa.nums[i] || 0) - (pb.nums[i] || 0);
    if (d) return d;
  }
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  const as = pa.pre.split("."), bs = pb.pre.split(".");
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const [x, y] = [as[i], bs[i]];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { const d = Number(x) - Number(y); if (d) return d; }
    else if (nx !== ny) return nx ? -1 : 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

async function checkGoModule(name) {
  const base = `https://proxy.golang.org/${goEscape(name)}`;
  try {
    const latestRes = await fetch(`${base}/@latest`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (latestRes.status === 404 || latestRes.status === 410) return answered({});
    if (!latestRes.ok) return fromStatus(latestRes);
    const latest = (await latestRes.json())?.Version;
    if (!latest) return answered({});
    const modRes = await fetch(`${base}/@v/${latest}.mod`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (modRes.status === 404 || modRes.status === 410) return answered({});
    if (!modRes.ok) return fromStatus(modRes);
    const { deprecated, retract } = parseGoMod(await modRes.text());
    const out = {};
    if (deprecated) out.all = `Deprecated by the maintainer: ${deprecated}`;
    if (retract.length) out.retract = retract;
    return answered(out);
  } catch (err) {
    return unanswered(whyFailed(err));
  }
}

/**
 * Ask a registry about every package a lockfile resolved, and keep count of
 * the ones it would not answer for.
 *
 * A lookup that failed is not a package that is fine. An unreachable registry
 * must never fail the build — running this on a plane, or behind a proxy that
 * blocks npmjs.org, has to stay pleasant — but the count and the reason come
 * back here so the report can say plainly which packages went unchecked.
 */
async function resolveFlagged(deps, check, ecosystem) {
  const names = [...new Set([...deps.keys()].map((k) => k.slice(0, k.lastIndexOf("@"))))];
  const flagged = [];
  const reasons = new Map(); // why -> how many packages hit it
  const CONC = 16;
  for (let i = 0; i < names.length; i += CONC) {
    const batch = names.slice(i, i + CONC);
    const results = await Promise.all(batch.map((n) => check(n).then((r) => [n, r])));
    for (const [name, answer] of results) {
      if (!answer.ok) {
        reasons.set(answer.why, (reasons.get(answer.why) || 0) + 1);
        continue;
      }
      const versions = answer.versions;
      for (const [key, source] of deps) {
        const at = key.lastIndexOf("@");
        if (key.slice(0, at) !== name) continue;
        const version = key.slice(at + 1);
        // Four answer shapes, one per way registries express "bad". Most
        // state which versions are bad, keyed by version. RubyGems stops
        // serving them, so it answers with the set that still exists and
        // absence is the signal. Go answers with retract ranges the pinned
        // version is compared against, and `all` when the maintainer
        // deprecated the module outright.
        if (versions.served) {
          if (!versions.served.has(version)) {
            flagged.push({
              ecosystem, name, version, source,
              message: "not served by rubygems.org; a fresh bundle install fails",
            });
          }
          continue;
        }
        const retracted = (versions.retract || []).find(
          (r) => cmpGoVersion(version, r.lo) >= 0 && cmpGoVersion(version, r.hi) <= 0
        );
        if (retracted) {
          flagged.push({
            ecosystem, name, version, source,
            message: `retracted by the maintainer${retracted.reason ? `: ${retracted.reason}` : ""}`,
          });
        } else if (versions[version]) {
          flagged.push({ ecosystem, name, version, source, message: versions[version] });
        } else if (versions.all) {
          flagged.push({ ecosystem, name, version, source, message: versions.all });
        }
      }
    }
  }
  let unasked = 0;
  for (const n of reasons.values()) unasked += n;
  const ranked = [...reasons].sort((a, b) => b[1] - a[1]).map(([why]) => why);
  const note = unasked
    ? `${ecosystem}: ${unasked} of ${names.length} package(s) could not be checked `
      + `(${ranked.slice(0, 3).join(", ")}); those versions are unverified, not clean`
    : null;
  return { flagged, unasked, note };
}

async function scanRegistry(root, { collectOnly = false } = {}) {
  const { files, notes } = await collectDepFiles(root);
  const js = new Map([
    ...(await npmDeps(files.npmLock, root)),
    ...(await pnpmDeps(files.pnpmLock, root)),
    ...(await yarnDeps(files.yarnLock, root)),
  ]);
  const pypi = await pypiDeps(files.reqs, root);
  const gems = await gemDeps(files.gemLock, root);
  const crates = await cargoDeps(files.cargoLock, root);
  const gomods = await goDeps(files.goSum, root);
  if (!js.size && files.pkgJson.length) {
    notes.push(
      "package.json found but no lockfile resolved; commit package-lock.json, pnpm-lock.yaml or yarn.lock so exact versions can be checked"
    );
  }
  if (collectOnly) return { js, pypi, gems, crates, gomods, notes };
  const results = await Promise.all([
    resolveFlagged(js, checkNpm, "npm"),
    resolveFlagged(pypi, checkPypi, "pypi"),
    resolveFlagged(gems, checkRubygems, "rubygems"),
    resolveFlagged(crates, checkCrates, "crates.io"),
    resolveFlagged(gomods, checkGoModule, "go"),
  ]);
  // A registry that would not answer is named alongside the lockfile formats
  // that are not read yet: both are things the tool could not do, and both
  // would otherwise look exactly like a clean result.
  for (const r of results) if (r.note) notes.push(r.note);
  return {
    flagged: results.flatMap((r) => r.flagged),
    checked: js.size + pypi.size + gems.size + crates.size + gomods.size,
    unreachable: results.reduce((n, r) => n + r.unasked, 0),
    notes,
  };
}

// -------------------------------------------------------------------- notify

/**
 * One message to a Slack incoming webhook, only when something breaking was
 * found. A quiet scan posts nothing: a daily "all clean" is noise that gets
 * the channel muted, and a muted channel misses the day that matters. Pair a
 * scheduled scan with a committed baseline and the webhook only ever fires
 * for drift that is new.
 *
 * The webhook URL is a secret and comes from the environment, never argv,
 * so it cannot land in shell history or a process listing.
 */
function slackMessage(findings, root) {
  const breaking = findings.filter((f) => f.severity === "breaking");
  if (!breaking.length) return null;

  const byArtifact = new Map();
  for (const f of breaking) {
    if (!byArtifact.has(f.artifact)) byArtifact.set(f.artifact, []);
    byArtifact.get(f.artifact).push(f);
  }

  const lines = [
    `:rotating_light: *driftcite: ${byArtifact.size} breaking artifact(s) in ${path.basename(root)}*`,
  ];
  const MAX_ARTIFACTS = 10;
  let shown = 0;
  for (const [id, hits] of byArtifact) {
    if (shown === MAX_ARTIFACTS) {
      lines.push(`…and ${byArtifact.size - shown} more artifact(s); run \`npx driftcite\` for the full report`);
      break;
    }
    shown++;
    const f = hits[0];
    const when =
      f.status === "deprecated" && f.retires_on ? `breaks ${f.retires_on}` : f.status;
    const swap = f.replacement ? ` → use \`${f.replacement}\`` : "";
    lines.push(`• *${id}* — ${when}${swap}`);
    if (f.evidence) lines.push(`    <${f.evidence}|evidence>`);
    const places = hits.slice(0, 5).map((h) => `${h.file}:${h.line}`).join(", ");
    lines.push(`    ${places}${hits.length > 5 ? ` +${hits.length - 5} more` : ""}`);
  }
  return lines.join("\n");
}

async function postSlack(url, text) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`slack webhook returned ${res.status}`);
}

// -------------------------------------------------------------------- report

const BOLD = "[1m", DIM = "[2m", RED = "[31m",
      YEL = "[33m", GRN = "[32m", OFF = "[0m";
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (color ? code + s + OFF : s);

function report(findings, registry, root, feedSource, suppressed = []) {
  const breaking = findings.filter((f) => f.severity === "breaking").length;

  console.log();
  console.log(c(BOLD, root));
  console.log(
    c(DIM, `feed: ${feedSource} | ${registry.checked.toLocaleString()} dependencies resolved`)
  );
  console.log();

  if (registry.notes?.length) {
    for (const n of registry.notes) console.log(c(DIM, `note: ${n}`));
    console.log();
  }

  if (suppressed.length) {
    console.log(c(DIM, `${suppressed.length} finding(s) suppressed by `
      + `${IGNORE_FILE} or baseline\n`));
  }

  if (!findings.length && !registry.flagged.length) {
    // The plain sentence would be a claim about packages nobody managed to
    // ask about. The note above says which ones; this stops the summary line
    // from contradicting it.
    console.log(registry.unreachable
      ? "No drift found in what could be checked."
      : "No drift found.");
    console.log();
    return 0;
  }

  if (findings.length) {
    const inSource = findings.filter((f) => f.context === "source").length;
    const elsewhere = findings.length - inSource;
    const where = elsewhere
      ? `, ${inSource} in source and ${elsewhere} in tests, examples or docs`
      : "";
    console.log(c(BOLD,
      `${findings.length} provider findings (${breaking} breaking${where})`));
    let current = null;
    for (const f of [...findings].sort(cmp)) {
      if (f.artifact !== current) {
        current = f.artifact;
        const tag = f.severity === "breaking" ? c(RED, "[BREAKING]") : c(YEL, "[WARNING]");
        console.log(`\n${tag} ${f.artifact} -- ${f.status}${deadlinePhrase(f)}`);
        if (f.note) console.log(`  ${f.note}`);
        if (f.replacement) console.log(`  use instead: ${f.replacement}`);
        if (f.evidence) console.log(c(DIM, `  evidence: ${f.evidence}`));
      }
      const tag = f.context === "source" ? "" : c(DIM, ` [${f.context}]`);
      console.log(`    ${f.file}:${f.line}${tag}  ${c(DIM, f.excerpt)}`);
    }
    console.log();
  }

  if (registry.flagged.length) {
    const groups = new Map();
    for (const f of registry.flagged) {
      const key = f.message;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    console.log(
      c(BOLD, `${registry.flagged.length} dependencies on a maintainer-flagged version`)
    );
    for (const [message, items] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      const pkgs = [...new Set(items.map((i) => i.name))].sort();
      const head = items.length === 1
        ? `${items[0].name}@${items[0].version}`
        : `${pkgs.length} packages`;
      console.log(`\n  ${head}`);
      console.log(`    "${message.slice(0, 170)}"`);
      if (items.length > 1) {
        const more = pkgs.length > 5 ? `, +${pkgs.length - 5} more` : "";
        console.log(c(DIM, `    ${pkgs.slice(0, 5).join(", ")}${more}`));
      }
    }
    console.log();
  }

  return breaking ? 1 : 0;
}

// ---------------------------------------------------------------------- main

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(`driftcite: find the API calls in your code that already stopped working.

  npx driftcite [path]        scan a directory (default: .)
  npx driftcite . --offline   use the bundled feed, no network at all
  npx driftcite . --json      machine-readable output
  npx driftcite . --no-deps   skip the registry checks
  npx driftcite . --fix       show the swaps the provider named
  npx driftcite . --fix --write   apply them
  npx driftcite . --list-deps every dependency version resolved, no network
  npx driftcite . --write-baseline  accept today's findings, fail on new ones
  npx driftcite . --init-local  start a ${LOCAL_FILE} for APIs we don't track
  npx driftcite . --slack     post breaking findings to a Slack webhook
  npx driftcite --version     print the version

--slack reads the webhook URL from DRIFTCITE_SLACK_WEBHOOK (environment, not
argv, so it stays out of shell history). It posts only when something breaking
was found; a clean scan posts nothing. It runs anywhere the CLI runs — GitHub,
GitLab, Bitbucket, Jenkins, a cron job on a laptop. Schedule it with a
committed baseline and the channel only ever hears about drift that is new.

Track your own API: put feed-shaped artifacts in ${LOCAL_FILE} at the
scan root (internal services welcome; --init-local writes a template). They
are validated by the same rules as the public feed and scanned alongside it.

Lockfiles read: package-lock.json, pnpm-lock.yaml, yarn.lock (classic and
berry), pinned requirements.txt, Cargo.lock, Gemfile.lock, and go.sum.
Formats it cannot read yet are named in the output instead of silently
skipped.

Registry lookups that fail — offline, rate limited, a 500 — are counted and
named in the output. They never fail the build, but they are never reported
as a clean package either.

Exits 1 if anything breaking was found, so it drops into CI unchanged.
--fix --write still exits 1 when a breaking finding it could not fix is left
in the tree, so a partial repair never turns the build green.
Your source code is never sent anywhere.`);
    return 0;
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    const pkg = JSON.parse(await readFile(path.join(HERE, "..", "package.json"), "utf8"));
    console.log(pkg.version);
    return 0;
  }

  // An unrecognised flag is a hard error, not a silent no-op. The failure
  // this prevents: a newer README (or a pasted setup prompt) names a flag
  // this installed version does not have, the flag is ignored, and the run
  // "succeeds" while doing something other than what was asked. Confident
  // false success is the one failure mode a scanner must not have.
  const KNOWN_FLAGS = new Set([
    "--offline", "--json", "--no-deps", "--fix", "--write",
    "--list-deps", "--write-baseline", "--init-local", "--slack",
  ]);
  const unknown = argv.filter((a) => a.startsWith("-") && !KNOWN_FLAGS.has(a));
  if (unknown.length) {
    console.error(`unknown flag: ${unknown.join(", ")}`);
    console.error(`run \`npx driftcite --help\` for the flags this version has`);
    return 2;
  }

  const root = path.resolve(argv.find((a) => !a.startsWith("-")) || ".");
  const offline = argv.includes("--offline");
  const asJson = argv.includes("--json");
  const noDeps = argv.includes("--no-deps");
  const fix = argv.includes("--fix");
  const write = argv.includes("--write");
  const slack = argv.includes("--slack");

  // Misconfiguration fails before the scan, not after it. A scheduled job
  // that scans for ten minutes and then discovers it cannot deliver is a
  // job that looked green in the log while alerting nobody.
  if (slack && !process.env.DRIFTCITE_SLACK_WEBHOOK) {
    console.error("--slack needs DRIFTCITE_SLACK_WEBHOOK set to a Slack incoming-webhook URL");
    return 2;
  }

  if (argv.includes("--init-local")) {
    const dest = path.join(root, LOCAL_FILE);
    if (existsSync(dest)) {
      console.error(`${LOCAL_FILE} already exists here; not overwriting it`);
      return 2;
    }
    await writeFile(dest, LOCAL_TEMPLATE);
    console.log(`wrote ${LOCAL_FILE}`);
    console.log("copy $example into artifacts and edit; the next scan picks it up");
    return 0;
  }

  if (argv.includes("--list-deps")) {
    // Parse every dependency manifest and print what resolved, no network.
    // Exists so the lockfile parsers are testable without touching a registry.
    // Every ecosystem scanRegistry resolves is listed. Printing only npm and
    // pypi made Cargo.lock and Gemfile.lock look unread when they had in fact
    // been parsed, which is the same lie as skipping them.
    const { js, pypi, gems, crates, gomods, notes } = await scanRegistry(root, { collectOnly: true });
    for (const [ecosystem, deps] of [
      ["npm", js], ["pypi", pypi], ["rubygems", gems], ["crates.io", crates],
      ["go", gomods],
    ]) {
      for (const [key, source] of deps) {
        const at = key.lastIndexOf("@");
        console.log(`${ecosystem} ${key.slice(0, at)} ${key.slice(at + 1)} ${source}`);
      }
    }
    for (const n of notes) console.log(`note: ${n}`);
    return 0;
  }

  const { feed, source } = await loadFeed({ offline });
  const local = await loadLocal(root, feed.artifacts);
  const artifacts = local?.artifacts.length
    ? feed.artifacts.concat(local.artifacts)
    : feed.artifacts;
  const providers = new Set(artifacts.map((a) => a.provider));
  let findings = await scanRepo(root, artifacts);

  const ignores = await loadIgnores(root);
  const baseline = await loadBaseline(root);
  const suppressed = [];
  if (ignores.length || baseline) {
    findings = findings.filter((f) => {
      const byIgnore = ignores.some((r) => ignoreMatches(r, f, providers));
      const byBaseline = baseline?.has(fingerprint(f));
      if (byIgnore || byBaseline) {
        suppressed.push({ ...f, suppressed_by: byIgnore ? "ignore" : "baseline" });
        return false;
      }
      return true;
    });
  }

  if (argv.includes("--write-baseline")) {
    const all = [...findings, ...suppressed];
    const doc = {
      created: new Date().toISOString().slice(0, 10),
      note: "Findings accepted at creation time. New findings still fail. "
          + "Delete an entry once fixed; regenerate with --write-baseline.",
      accepted: [...new Set(all.map(fingerprint))].sort(),
    };
    await writeFile(path.join(root, BASELINE_FILE), JSON.stringify(doc, null, 1) + "\n");
    console.log(`wrote ${BASELINE_FILE} accepting ${doc.accepted.length} finding(s)`);
    console.log("new findings will still fail the build");
    return 0;
  }
  const registry = noDeps || offline
    ? { flagged: [], checked: 0, unreachable: 0, notes: [] }
    : await scanRegistry(root);

  // A local artifact that failed validation is a note, not a crash: the rest
  // of the scan is sound, and hiding the skip would be the silent drop the
  // loader promises not to do.
  if (local?.problems.length) {
    registry.notes.unshift(...local.problems.map((p) => `${LOCAL_FILE}: ${p}`));
  }
  const sourceLabel = local?.artifacts.length
    ? `${source} + ${local.artifacts.length} local artifact(s)`
    : source;

  // The plan is computed before any output path so that --json can carry it.
  // It used to be built after the --json early return, which meant the one
  // caller that most needs it could not have it: the hosted watch ran the
  // fixer and threw its output away, then described the pull request from the
  // *findings*. A maintainer opening a PR from a stranger is deciding about a
  // diff, not about a scan, and the two are not the same list — findings
  // include everything refused for having no replacement.
  let plan = null;
  if (fix) {
    const byId = new Map(artifacts.map((a) => [a.id, a]));
    plan = await planFixes(root, findings, byId);
    if (write) {
      for (const w of plan.writes) await writeFile(w.full, w.body, "utf8");
    }
  }

  // What --write repaired, and so what is still in the tree afterwards.
  const stillBreaking = () => {
    const repaired = new Set((plan?.edits ?? []).map((e) => `${e.file}:${e.line}:${e.artifact}`));
    return findings.filter((f) => f.severity === "breaking"
      && !repaired.has(`${f.file}:${f.line}:${f.artifact}`));
  };

  if (slack) {
    const text = slackMessage(findings, root);
    if (text) {
      try {
        await postSlack(process.env.DRIFTCITE_SLACK_WEBHOOK, text);
      } catch (err) {
        // The scan's own result still decides the exit code; a failed post is
        // named, not fatal, because the findings are also in the log and the
        // build is already red whenever there was anything worth posting.
        console.error(`driftcite: slack notify failed: ${err.message}`);
      }
    }
  }

  if (asJson) {
    // schema counts the shape of this object, not the tool's version. Agents
    // and CI paste-prompts key on these field names; renaming or removing
    // one bumps this number, adding a field does not. It sits first so a
    // human eyeballing the output sees the contract before the content.
    const payload = { schema: 1, root, feed: sourceLabel, findings, suppressed, registry };
    if (local) {
      payload.local = { file: LOCAL_FILE, artifacts: local.artifacts.length,
                        problems: local.problems };
    }
    if (plan) payload.plan = { edits: plan.edits, unfixable: plan.unfixable };
    console.log(JSON.stringify(payload, null, 2));
    if (fix && write) return stillBreaking().length ? 1 : 0;
    return findings.some((f) => f.severity === "breaking") ? 1 : 0;
  }

  const code = report(findings, registry, root, sourceLabel, suppressed);

  if (fix) {
    reportFixes(plan.edits, plan.unfixable, write);
    if (write) {
      // --write repairs what it can and leaves the rest exactly where it was.
      // Returning 0 because *something* was fixed turned CI green over code
      // that still called a removed endpoint, which is the one outcome this
      // tool exists to prevent. What is still in the tree decides the exit
      // code, precisely as it would have without --fix.
      const left = stillBreaking();
      if (left.length) {
        console.log(c(BOLD, `${left.length} breaking finding(s) remain after --write`));
        console.log(c(DIM, "  exiting 1: these are still in your tree\n"));
      }
      return left.length ? 1 : 0;
    }
  }

  return code;
}

/** The lockfile readers and the registry layer, for the test suite. Hitting
 *  the live registries in a test would make the suite depend on someone
 *  else's uptime; these are called with globalThis.fetch swapped for a stub,
 *  which is also the only way to exercise a rate limit on purpose. */
export const __test = {
  cargoDeps, gemDeps, pypiDeps, goDeps,
  checkNpm, checkPypi, checkCrates, checkRubygems, checkGoModule,
  parseGoMod, cmpGoVersion, verifyFeedSignature,
  resolveFlagged, scanRegistry,
  slackMessage, postSlack,
};

// Only run when invoked as a command. The scanner is Apache 2.0 so that it
// can be embedded in other people's tooling, and a module that scans a
// directory the moment it is imported cannot be.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  // process.exit() abandons stdout that has not flushed, and pipes flush
  // asynchronously, so a large --json report would arrive truncated in CI and
  // under the watch. Setting exitCode lets the process drain and then leave.
  main().then(
    (code) => { process.exitCode = code; },
    (err) => {
      console.error(`driftcite: ${err.message}`);
      process.exitCode = 2;
    }
  );
}
