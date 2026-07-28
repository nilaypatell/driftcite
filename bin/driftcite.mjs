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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_FEED = path.join(HERE, "..", "feed", "feed.json");
const FEED_URL =
  "https://raw.githubusercontent.com/nilaypatell/driftcite/main/feed/feed.json";

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv",
  "venv", ".mypy_cache", ".pytest_cache", "coverage", ".turbo", "vendor",
  ".vercel", "out", ".cache", ".idea", "target",
]);

const SCAN_EXTS = new Set([
  ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rb", ".java",
  ".kt", ".cs", ".php", ".rs", ".sh", ".yaml", ".yml", ".json", ".toml", ".env",
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
};
const DEFAULT_SHAPES = ["quoted", "word"];
const CONTEXT_REQUIRED = new Set([
  "request_param", "sdk_symbol", "tool_type", "endpoint", "enum_value",
]);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matcher(literal, kind) {
  const lit = esc(literal);
  const parts = [];
  for (const shape of MATCH_SHAPES[kind] || DEFAULT_SHAPES) {
    if (shape === "quoted") parts.push(`['"\`]${lit}['"\`]`);
    else if (shape === "key") parts.push(`(?<![\\w.])${lit}\\s*[:=]`);
    else if (shape === "word") parts.push(`(?<![\\w./-])${lit}(?![\\w.-])`);
  }
  return new RegExp(parts.join("|"));
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
      const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) return { feed: await res.json(), source: "live" };
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

    for (const { lit, art } of index) {
      if (!text.includes(lit)) continue;
      if (CONTEXT_REQUIRED.has(art.kind)) {
        const markers = art.file_markers || [];
        if (markers.length && !markers.some((m) => lowered.includes(m.toLowerCase()))) continue;
      }
      const re = matcher(lit, art.kind);
      if (!re.test(text)) continue;
      if (lines === null) lines = text.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        if (isComment(lines[i])) continue;
        if (!re.test(lines[i])) continue;
        const { severity, status, daysLeft } = applyDeadline(art);
        const rel = path.relative(root, file);
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
  pkgJson: /^package\.json$/,
};

// Formats we recognise but do not read yet. Saying so beats silence: a
// scanner that quietly skips your lockfile looks clean when it is blind.
const UNSUPPORTED_MANIFESTS = [
  [/^poetry\.lock$/, "poetry.lock is not read yet; export a pinned requirements.txt for coverage"],
  [/^uv\.lock$/, "uv.lock is not read yet; export a pinned requirements.txt for coverage"],
  [/^Pipfile\.lock$/, "Pipfile.lock is not read yet"],
  [/^Gemfile\.lock$/, "Gemfile.lock (RubyGems) is not read yet"],
  [/^Cargo\.lock$/, "Cargo.lock (crates.io) is not read yet"],
  [/^go\.sum$/, "go.sum (Go modules) is not read yet"],
];

async function collectDepFiles(root) {
  const files = { npmLock: [], pnpmLock: [], yarnLock: [], reqs: [], pkgJson: [] };
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

async function checkNpm(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return {};
    const doc = await res.json();
    const out = {};
    for (const [v, meta] of Object.entries(doc.versions || {})) {
      if (meta?.deprecated) out[v] = String(meta.deprecated).trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function checkPypi(name) {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return {};
    const doc = await res.json();
    const out = {};
    for (const [v, files] of Object.entries(doc.releases || {})) {
      const first = Array.isArray(files) ? files[0] : null;
      if (first?.yanked) {
        out[v] = (first.yanked_reason || "").trim() || "yanked, no reason given";
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function resolveFlagged(deps, check, ecosystem) {
  const names = [...new Set([...deps.keys()].map((k) => k.slice(0, k.lastIndexOf("@"))))];
  const flagged = [];
  const CONC = 16;
  for (let i = 0; i < names.length; i += CONC) {
    const batch = names.slice(i, i + CONC);
    const results = await Promise.all(batch.map((n) => check(n).then((r) => [n, r])));
    for (const [name, versions] of results) {
      for (const [key, source] of deps) {
        const at = key.lastIndexOf("@");
        if (key.slice(0, at) !== name) continue;
        const version = key.slice(at + 1);
        if (versions[version]) {
          flagged.push({ ecosystem, name, version, source, message: versions[version] });
        }
      }
    }
  }
  return flagged;
}

async function scanRegistry(root, { collectOnly = false } = {}) {
  const { files, notes } = await collectDepFiles(root);
  const js = new Map([
    ...(await npmDeps(files.npmLock, root)),
    ...(await pnpmDeps(files.pnpmLock, root)),
    ...(await yarnDeps(files.yarnLock, root)),
  ]);
  const pypi = await pypiDeps(files.reqs, root);
  if (!js.size && files.pkgJson.length) {
    notes.push(
      "package.json found but no lockfile resolved; commit package-lock.json, pnpm-lock.yaml or yarn.lock so exact versions can be checked"
    );
  }
  if (collectOnly) return { js, pypi, notes };
  const [npmFlagged, pypiFlagged] = await Promise.all([
    resolveFlagged(js, checkNpm, "npm"),
    resolveFlagged(pypi, checkPypi, "pypi"),
  ]);
  return { flagged: [...npmFlagged, ...pypiFlagged], checked: js.size + pypi.size, notes };
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
    console.log("No drift found.");
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
  npx driftcite --version     print the version

Lockfiles read: package-lock.json, pnpm-lock.yaml, yarn.lock (classic and
berry), and pinned requirements.txt. Formats it cannot read yet are named in
the output instead of silently skipped.

Exits 1 if anything breaking was found, so it drops into CI unchanged.
Your source code is never sent anywhere.`);
    return 0;
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    const pkg = JSON.parse(await readFile(path.join(HERE, "..", "package.json"), "utf8"));
    console.log(pkg.version);
    return 0;
  }

  const root = path.resolve(argv.find((a) => !a.startsWith("-")) || ".");
  const offline = argv.includes("--offline");
  const asJson = argv.includes("--json");
  const noDeps = argv.includes("--no-deps");
  const fix = argv.includes("--fix");
  const write = argv.includes("--write");

  if (argv.includes("--list-deps")) {
    // Parse every dependency manifest and print what resolved, no network.
    // Exists so the lockfile parsers are testable without touching a registry.
    const { js, pypi, notes } = await scanRegistry(root, { collectOnly: true });
    for (const [ecosystem, deps] of [["npm", js], ["pypi", pypi]]) {
      for (const [key, source] of deps) {
        const at = key.lastIndexOf("@");
        console.log(`${ecosystem} ${key.slice(0, at)} ${key.slice(at + 1)} ${source}`);
      }
    }
    for (const n of notes) console.log(`note: ${n}`);
    return 0;
  }

  const { feed, source } = await loadFeed({ offline });
  const providers = new Set(feed.artifacts.map((a) => a.provider));
  let findings = await scanRepo(root, feed.artifacts);

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
    ? { flagged: [], checked: 0, notes: [] }
    : await scanRegistry(root);

  if (asJson) {
    console.log(JSON.stringify({ root, feed: source, findings, suppressed, registry }, null, 2));
    return findings.some((f) => f.severity === "breaking") ? 1 : 0;
  }

  const code = report(findings, registry, root, source, suppressed);

  if (fix) {
    const byId = new Map(feed.artifacts.map((a) => [a.id, a]));
    const plan = await planFixes(root, findings, byId);
    if (write) {
      for (const w of plan.writes) await writeFile(w.full, w.body, "utf8");
    }
    reportFixes(plan.edits, plan.unfixable, write);
    if (write && plan.edits.length) return 0;
  }

  return code;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`driftcite: ${err.message}`);
    process.exit(2);
  }
);
