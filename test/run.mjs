#!/usr/bin/env node
/**
 * Tests for the part that decides whether anyone keeps this installed.
 *
 * Match precision and deadline arithmetic are the whole product. A scanner
 * that is wrong three times out of four gets muted, then deleted, so the cases
 * below are the real false positives from the first run against a live
 * 1,200-dependency codebase, kept as regressions.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "bin", "driftcite.mjs");

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
}

function runOn(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-test-"));
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(dir, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  let out = "";
  try {
    out = execFileSync("node", [CLI, dir, "--offline", "--no-deps", "--json"], {
      encoding: "utf8",
    });
  } catch (err) {
    // exit 1 just means breaking findings, which most of these expect
    out = err.stdout || "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return JSON.parse(out).findings;
}

console.log("\nmatch precision");

// A retired model ID in a real call site must be found.
check(
  "finds a retired model id in a string literal",
  runOn({ "app.js": `const m = 'text-davinci-003';` })
    .some((f) => f.artifact === "openai/model_id/text-davinci-003")
);

// The original false positive: "refund" matched inside "refunded".
check(
  "does not match a parameter inside a longer word",
  runOn({
    "model.js": `// stripe billing\nconst s = { enum: ['succeeded', 'refunded'] };`,
  }).length === 0,
  "the parameter 'refund' must not match inside 'refunded'"
);

// The second original false positive: prose in a comment.
check(
  "does not match a parameter in prose",
  runOn({ "audit.js": `// stripe: recent refunds in the window` }).length === 0
);

// Enum values are often ordinary English words, so they need quotes.
check(
  "does not match a bare enum-shaped word",
  runOn({ "ui.js": `// stripe\nconst layout = hosted ? 1 : 2;` }).length === 0
);

// Provider-scoped kinds need the file to mention the provider at all.
check(
  "requires provider context for non-model kinds",
  runOn({ "unrelated.js": `const mode = 'hosted';` }).length === 0
);

// Documentation quotes parameter names constantly. A comment is not a call site.
check(
  "does not match a quoted parameter inside a comment",
  runOn({ "notes.js": `// stripe: a bare "refund" here is documentation, not a call` })
    .length === 0
);

// But a trailing comment must not hide the real code on the same line.
check(
  "still matches real code that has a trailing comment",
  runOn({ "app.js": `const m = 'text-davinci-003'; // legacy` }).length > 0
);

// /api/v2/services is a prefix of /api/v2/services/{service_id}, and the
// endpoint shape deliberately allows a trailing slash so a URL that continues
// past the path still matches it. The parent artifact therefore matched inside
// the child, and one call site came back as two findings under two ids.
{
  const found = runOn({
    "dd.js": `// datadog\nconst url = "/api/v2/services/{service_id}";`,
  });
  check("a nested endpoint path is reported once, not once per prefix",
    found.length === 1,
    `got ${found.length}: ${found.map((f) => f.artifact).join(", ")}`);
  check("the most specific endpoint artifact is the one reported",
    found[0]?.artifact === "datadog/endpoint//api/v2/services/{service_id}",
    `got ${found[0]?.artifact}`);
}

// The prefix is not guilty by association: on its own it is its own call.
check(
  "the parent path still reports when it is the whole call",
  runOn({ "dd2.js": `// datadog\nconst u = "/api/v2/services";` })
    .some((f) => f.artifact === "datadog/endpoint//api/v2/services")
);

// Two genuinely different calls on one line are two findings. This is why the
// span each literal matched is compared, rather than dropping the shorter
// artifact everywhere it shares a line with a longer one.
check(
  "two distinct endpoint calls on one line are both reported",
  runOn({
    "dd3.js": `// datadog\nconst p = ["/api/v2/services", "/api/v2/services/{service_id}"];`,
  }).length === 2
);

// A manifest contains every literal by definition, so vendoring the feed into
// a repository must not report the entire feed back as findings.
check(
  "ignores vendored drift manifests",
  runOn({
    "vendor/feed.json": JSON.stringify({
      feed_version: 1,
      artifacts: [{ id: "x", match: { literals: ["text-davinci-003"] } }],
    }),
  }).length === 0
);

console.log("\ndeadline arithmetic");

const findings = runOn({ "app.js": `const m = 'text-davinci-003';` });
const opus = findings.find((f) => f.artifact.endsWith("text-davinci-003"));

check("a passed retirement date reports as retired", opus?.status === "retired",
  `got status=${opus?.status}`);
check("a passed retirement date is breaking", opus?.severity === "breaking",
  `got severity=${opus?.severity}`);
check("days elapsed is negative and counted", typeof opus?.daysLeft === "number" && opus.daysLeft < 0,
  `got daysLeft=${opus?.daysLeft}`);
check("every finding carries its evidence url", findings.every((f) => f.evidence),
  "a finding without an evidence URL is exactly what this project exists to avoid");

console.log("\nautomatic fixes");

function runFix(files, write) {
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-fix-"));
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(dir, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  const args = [CLI, dir, "--offline", "--no-deps", "--fix"];
  if (write) args.push("--write");
  let out = "";
  let code = 0;
  try {
    out = execFileSync("node", args, { encoding: "utf8" });
  } catch (err) {
    out = err.stdout || "";
    code = err.status ?? 1;
  }
  const result = { out, code, files: {} };
  for (const name of Object.keys(files)) {
    result.files[name] = readFileSync(path.join(dir, name), "utf8");
  }
  rmSync(dir, { recursive: true, force: true });
  return result;
}

{
  const r = runFix({ "a.js": `const m = 'text-davinci-003';` }, true);
  check("applies the replacement the provider named",
    r.files["a.js"].includes("gpt-5.6-terra"));
  check("removes the retired literal", !r.files["a.js"].includes("text-davinci-003"));
  check("preserves the original quote style",
    r.files["a.js"].includes("'gpt-5.6-terra'"),
    `got: ${r.files["a.js"].trim()}`);
}

{
  const src = `const a = "text-davinci-003";\n// keep 'text-davinci-003' here\n`;
  const r = runFix({ "b.js": src }, true);
  check("fixes double-quoted code without touching the comment",
    r.files["b.js"].includes('"gpt-5.6-terra"') &&
    r.files["b.js"].includes("// keep 'text-davinci-003' here"));
}

{
  const src = `const m = 'text-davinci-003';\nconst untouched = 1;\n`;
  const r = runFix({ "c.js": src }, true);
  const lines = r.files["c.js"].split("\n");
  check("changes only the line it reported", lines[1] === "const untouched = 1;");
}

{
  const r = runFix({ "d.js": `const m = 'text-davinci-003';` }, false);
  check("dry run leaves the file alone",
    r.files["d.js"].includes("text-davinci-003"));
  check("dry run says how to apply", r.out.includes("--write"));
}

{
  // A removed endpoint has no replacement the provider named, so guessing one
  // is exactly the behaviour that would break somebody's build.
  const r = runFix({ "e.js": `// stripe\nconst url = "/v1/invoices/upcoming";` }, true);
  check("leaves a finding alone when no replacement was named",
    r.files["e.js"].includes("/v1/invoices/upcoming"));
  check("explains what needs a human", /need a human/.test(r.out));
}

// The exit code after --write is the whole reason this is safe to put in CI.
// Reporting success because *something* was fixed is a green build over code
// that still calls a removed endpoint.
{
  const r = runFix({
    "fixable.js": `const m = 'text-davinci-003';`,
    "stuck.js": `// stripe\nconst url = "/v1/invoices/upcoming";`,
  }, true);
  check("--write still applies the fixes it has",
    r.files["fixable.js"].includes("gpt-5.6-terra"));
  check("--fix --write exits 1 while a breaking finding it refused remains",
    r.code === 1, `got exit ${r.code}`);
  check("says why the build is still red", /remain after --write/.test(r.out));
}

{
  const r = runFix({ "only.js": `const m = 'text-davinci-003';` }, true);
  check("--fix --write exits 0 once nothing breaking is left", r.code === 0,
    `got exit ${r.code}`);
}

{
  const help = execFileSync("node", [CLI, "--help"], { encoding: "utf8" });
  check("--help documents the exit code after --fix --write",
    /--fix --write still exits 1/.test(help));
}


console.log("\nsuppression");

function runRaw(files, extra = []) {
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-sup-"));
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(dir, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  const run = (args) => {
    try {
      return { code: 0, out: execFileSync("node", [CLI, dir, "--offline", "--no-deps", ...args],
        { encoding: "utf8" }) };
    } catch (err) {
      return { code: err.status ?? 1, out: err.stdout || "" };
    }
  };
  return { dir, run, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// A team that cannot suppress one unfixable finding deletes the tool, so this
// is the behaviour that decides whether it survives in anyone's CI.
{
  const t = runRaw({
    "app.js": `const a = 'text-davinci-003';`,
    "legacy/lib.js": `const b = 'gpt-4-vision-preview';`,
    ".driftciteignore": "legacy/*\n",
  });
  const r = t.run(["--json"]);
  const f = JSON.parse(r.out);
  check("ignore file excludes matching paths",
    f.findings.every((x) => !x.file.startsWith("legacy")));
  check("suppressed findings are reported, not hidden",
    f.suppressed.length === 1 && f.suppressed[0].suppressed_by === "ignore");
  t.cleanup();
}

{
  const t = runRaw({ "app.js": `const a = 'text-davinci-003';` });
  check("fails before a baseline exists", t.run([]).code === 1);
  t.run(["--write-baseline"]);
  check("passes once findings are accepted", t.run([]).code === 0);

  writeFileSync(path.join(t.dir, "new.js"), `const c = 'gpt-4-vision-preview';`);
  const after = t.run([]);
  check("a NEW finding still fails after a baseline", after.code === 1,
    "a baseline that swallows new drift would be worse than no tool at all");
  check("the new finding is the one reported",
    after.out.includes("gpt-4-vision-preview") && !after.out.includes("text-davinci-003"));
  t.cleanup();
}

{
  const t = runRaw({
    "app.js": `const a = 'text-davinci-003';`,
    ".driftciteignore": "openai/model_id/text-davinci-003\n",
  });
  check("ignore file accepts an artifact id as well as a path", t.run([]).code === 0);
  t.cleanup();
}

console.log("\nfinding context");

// Two of the first three candidate repositories for an outreach pull request
// turned out to have their only findings in test files. A dead model id in a
// fixture is not a call that fails, and treating them the same wastes the
// reader's attention on the wrong lines.
{
  const cases = {
    "src/client.js": "source",
    "lib/providers/google_genai_test.py": "test",
    "tests/helper.js": "test",
    "spec/thing_spec.rb": "test",
    "examples/quickstart.py": "example",
    // Markdown is not scanned at all, so the doc label is exercised through a
    // scanned extension that lives under a docs directory.
    "docs/snippets/config.json": "doc",
  };
  for (const [file, want] of Object.entries(cases)) {
    const found = runOn({ [file]: `const m = 'text-davinci-003';` });
    const got = found[0]?.context;
    check(`labels ${file} as ${want}`, got === want, `got ${got}`);
  }
}

{
  const found = runOn({
    "tests/a.js": `const m = 'text-davinci-003';`,
    "src/b.js": `const m = 'text-davinci-003';`,
  });
  check("ranks production source above test fixtures",
    found[0]?.context === "source", `first was ${found[0]?.context}`);
}

// Applying this to a real backend renamed a pricing key to a value the file
// already used, producing a duplicate object key and leaving the old model's
// rates attached to the new name. A swap can be right on its line and wrong
// in its file.
{
  const src = [
    "// openai",
    "const prices = {",
    "  'text-davinci-003': { in: 1 },",
    "  'gpt-5.6-terra': { in: 2 },",
    "};",
  ].join("\n");
  const r = runFix({ "prices.js": src }, true);
  check("refuses a swap that would duplicate an existing key",
    r.files["prices.js"].includes("'text-davinci-003'"),
    "renaming would have collided with the entry already in the file");
  check("says why it refused", /already appears in this file/.test(r.out));
}

{
  // The same artifact in a file without the collision is still fixed.
  const r = runFix({ "call.js": `const m = 'text-davinci-003';` }, true);
  check("still fixes when there is no collision",
    r.files["call.js"].includes("gpt-5.6-terra"));
}

{
  // One id appearing several times must be fixed at every occurrence. An
  // earlier guard refused the second one and left a live route on a dead
  // model, which is worse than the duplicate it was avoiding.
  const src = "// openai\nconst a = 'text-davinci-003';\nconst b = 'text-davinci-003';\n";
  const r = runFix({ "twice.js": src }, true);
  check("fixes every occurrence of the same id",
    !r.files["twice.js"].includes("text-davinci-003"),
    `left behind: ${r.files["twice.js"].trim()}`);
}

{
  // Two DIFFERENT retired ids sharing one replacement is the real collision:
  // applying both produces a duplicate key.
  const src = [
    "// openai",
    "const models = {",
    "  'gpt-3.5-turbo-0301': 1,",
    "  'text-davinci-003': 2,",
    "};",
  ].join("\n");
  const r = runFix({ "pair.js": src }, true);
  const body = r.files["pair.js"];
  const count = (body.match(/gpt-3\.5-turbo(?!-)/g) || []).length;
  check("does not let two ids collapse onto one key", count <= 1,
    `two retired ids both mapping to gpt-3.5-turbo would duplicate a key`);
}

console.log("\nthe fix plan as data");

// --json used to return before fixes were planned, so the one caller that
// most needs the plan — the hosted watch, which has to describe what it
// changed — ran the fixer and threw its output away.
{
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-plan-"));
  writeFileSync(path.join(dir, "a.py"),
    'import openai\nMODEL = "text-davinci-003"\n');
  let out = "";
  try {
    out = execFileSync("node",
      [CLI, dir, "--offline", "--no-deps", "--fix", "--write", "--json"],
      { encoding: "utf8" });
  } catch (err) { out = err.stdout || ""; }
  let parsed = null;
  try { parsed = JSON.parse(out); } catch { /* reported below */ }

  check("--json carries the fix plan", !!parsed?.plan?.edits);
  check("the plan names the swap it made",
    parsed?.plan?.edits?.[0]?.from === "text-davinci-003" &&
    parsed?.plan?.edits?.[0]?.to === "gpt-5.6-terra");
  check("--json --fix --write actually writes the file",
    readFileSync(path.join(dir, "a.py"), "utf8").includes("gpt-5.6-terra"));

  // A scan with no --fix must not grow a plan key; the watch keys off it.
  let plainOut = "";
  try {
    plainOut = execFileSync("node", [CLI, dir, "--offline", "--no-deps", "--json"],
      { encoding: "utf8" });
  } catch (err) { plainOut = err.stdout || ""; }
  let plain = null;
  try { plain = JSON.parse(plainOut); } catch { /* reported below */ }
  check("a scan without --fix carries no plan", plain !== null && plain.plan === undefined);

  rmSync(dir, { recursive: true, force: true });
}

console.log("\nlockfile parsing");

function runList(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-deps-"));
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(dir, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  let out = "";
  try {
    out = execFileSync("node", [CLI, dir, "--list-deps"], { encoding: "utf8" });
  } catch (err) {
    out = err.stdout || "";
  }
  rmSync(dir, { recursive: true, force: true });
  return out.trim().split("\n").filter(Boolean);
}

{
  const lines = runList({
    "package-lock.json": JSON.stringify({
      lockfileVersion: 3,
      packages: { "": {}, "node_modules/lodash": { version: "4.17.21" } },
    }),
  });
  check("reads package-lock v3", lines.includes("npm lodash 4.17.21 package-lock.json"));
}

{
  const body = [
    "lockfileVersion: '9.0'", "",
    "packages:", "",
    "  lodash@4.17.21:",
    "    resolution: {integrity: sha512-x}", "",
    "  '@babel/core@7.24.0':",
    "    resolution: {integrity: sha512-y}", "",
  ].join("\n");
  const lines = runList({ "pnpm-lock.yaml": body });
  check("reads pnpm-lock v9", lines.includes("npm lodash 4.17.21 pnpm-lock.yaml"));
  check("reads scoped pnpm entries", lines.includes("npm @babel/core 7.24.0 pnpm-lock.yaml"));
}

{
  const body = [
    "lockfileVersion: 6.0", "",
    "packages:", "",
    "  /lodash@4.17.21:",
    "    resolution: {integrity: x}", "",
    "  /@types/node@20.1.0(patch_hash=abc):",
    "    resolution: {integrity: y}", "",
  ].join("\n");
  const lines = runList({ "pnpm-lock.yaml": body });
  check("reads pnpm-lock v6 with peer suffixes",
    lines.includes("npm @types/node 20.1.0 pnpm-lock.yaml"));
}

{
  const body = [
    "# yarn lockfile v1", "",
    "lodash@^4.17.0:",
    '  version "4.17.21"',
    '  resolved "https://registry.example/lodash"', "",
    '"@babel/core@^7.0.0", "@babel/core@^7.2.0":',
    '  version "7.24.0"', "",
  ].join("\n");
  const lines = runList({ "yarn.lock": body });
  check("reads classic yarn.lock", lines.includes("npm lodash 4.17.21 yarn.lock"));
  check("reads multi-selector scoped yarn entries",
    lines.includes("npm @babel/core 7.24.0 yarn.lock"));
}

{
  const body = [
    "__metadata:",
    "  version: 8", "",
    '"lodash@npm:^4.17.21":',
    "  version: 4.17.21",
    '  resolution: "lodash@npm:4.17.21"', "",
  ].join("\n");
  const lines = runList({ "yarn.lock": body });
  check("reads yarn berry lockfiles", lines.includes("npm lodash 4.17.21 yarn.lock"));
  check("berry metadata block adds nothing", !lines.some((l) => l.includes("__metadata")));
}

{
  const lines = runList({ "requirements.txt": "requests[socks]==2.31.0\n" });
  check("reads pinned requirements with extras",
    lines.includes("pypi requests 2.31.0 requirements.txt"));
}

// --list-deps parsed Cargo.lock and Gemfile.lock and then printed neither, so
// the two newest ecosystems looked unread when they had in fact resolved.
{
  const lines = runList({
    "Gemfile.lock": "GEM\n  remote: https://rubygems.org/\n  specs:\n    rack (2.2.3)\n",
    "Cargo.lock": [
      "version = 3", "",
      "[[package]]",
      'name = "openssl"',
      'version = "0.10.44"',
      'source = "registry+https://github.com/rust-lang/crates.io-index"', "",
    ].join("\n"),
  });
  check("--list-deps prints resolved gems",
    lines.includes("rubygems rack 2.2.3 Gemfile.lock"), lines.join(" | "));
  check("--list-deps prints resolved crates",
    lines.includes("crates.io openssl 0.10.44 Cargo.lock"), lines.join(" | "));
}

{
  const lines = runList({ "poetry.lock": "content", "package.json": "{}" });
  check("says when a lockfile format is not read",
    lines.some((l) => l.startsWith("note: poetry.lock")));
  check("says when package.json has no lockfile",
    lines.some((l) => l.includes("no lockfile resolved")));
}

{
  const out = execFileSync("node", [CLI, "--version"], { encoding: "utf8" }).trim();
  check("prints its version", /^\d+\.\d+\.\d+$/.test(out), `got: ${out}`);
}

{
  // The JSON is a contract now — the published setup prompt teaches agents
  // these exact field names — so the shape carries its own version number.
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-schema-"));
  writeFileSync(path.join(dir, "empty.js"), "export const x = 1;\n");
  let out = "";
  try {
    out = execFileSync("node", [CLI, dir, "--offline", "--no-deps", "--json"], {
      encoding: "utf8",
    });
  } catch (err) {
    out = err.stdout || "";
  }
  rmSync(dir, { recursive: true, force: true });
  check("the JSON output declares its schema version", JSON.parse(out).schema === 1);
}

{
  // The feed signature: the pinned-key path is exercised against feed/ in
  // the tree; the negative paths use an ephemeral key so no test ever needs
  // the maintainer's private half. The CLI import is block-local because
  // this block runs before the module-scope one below is initialised.
  const { __test } = await import(CLI);
  const { generateKeyPairSync, sign } = await import("node:crypto");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const bytes = Buffer.from('{"feed_version":1}');
  const sig = sign(null, bytes, privateKey).toString("base64");
  check("a valid signature verifies against its key",
    __test.verifyFeedSignature(bytes, sig, pem) === true);
  check("tampered bytes do not verify",
    __test.verifyFeedSignature(Buffer.from('{"feed_version":2}'), sig, pem) === false);
  check("a garbage signature is false, not a crash",
    __test.verifyFeedSignature(bytes, "not base64!!!", pem) === false);
  const shippedFeed = readFileSync(path.join(HERE, "..", "feed", "feed.json"));
  const shippedSig = readFileSync(path.join(HERE, "..", "feed", "feed.json.sig"), "utf8");
  check("the feed in the tree verifies against the pinned key",
    __test.verifyFeedSignature(shippedFeed, shippedSig) === true,
    "regenerate with: node scripts/sign_feed.mjs");
}

{
  // A flag this version does not know must be a loud error, not a scan that
  // quietly ignores it. 0.2.0 accepted --write-baseline, printed "No drift
  // found." and exited 0 — confident false success, the exact failure the
  // scanner exists to catch in other people's tooling.
  let code = 0, err = "";
  try {
    execFileSync("node", [CLI, ".", "--wrote-baseline"], { encoding: "utf8" });
  } catch (e) {
    code = e.status ?? 0;
    err = e.stderr || "";
  }
  check("an unknown flag is a hard error", code === 2, `got exit ${code}`);
  check("the unknown flag is named", err.includes("unknown flag: --wrote-baseline"), err);
}

{
  // Every flag --help advertises must be a flag this build accepts, and the
  // README must not name a flag --help does not. The published-identifier-
  // versus-artifact mismatch is driftcite's own thesis applied to itself.
  const help = execFileSync("node", [CLI, "--help"], { encoding: "utf8" });
  const readme = readFileSync(path.join(HERE, "..", "README.md"), "utf8");
  const helpFlags = new Set(help.match(/--[a-z][a-z-]*/g) || []);
  const missing = [...new Set(readme.match(/--[a-z][a-z-]*/g) || [])]
    .filter((f) => !["--fix-", "--parent", "--match", "--provider", "--from", "--to"].some((p) => f.startsWith(p)))
    .filter((f) => !helpFlags.has(f));
  check("every flag the README names exists in --help", missing.length === 0,
    `README names flags --help lacks: ${missing.join(", ")}`);
}

{
  // Piped stdout is asynchronous, and process.exit() abandons whatever has
  // not flushed. In a terminal nobody notices; in CI or under the watch the
  // JSON arrives cut off at a pipe-buffer boundary. Found by the first real
  // sweep: "Unterminated string in JSON at position 8192".
  const noisy = {};
  for (let i = 0; i < 40; i++) {
    noisy[`mod${i}.js`] = Array.from({ length: 10 },
      (_, j) => `const m${j} = 'text-davinci-003';`).join("\n");
  }
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-flush-"));
  for (const [name, body] of Object.entries(noisy)) {
    writeFileSync(path.join(dir, name), body);
  }
  let out = "";
  try {
    out = execFileSync("node", [CLI, dir, "--offline", "--no-deps", "--json"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    out = err.stdout || "";
  }
  rmSync(dir, { recursive: true, force: true });
  let parsed = null;
  try {
    parsed = JSON.parse(out);
  } catch {
    /* leave null; the check below reports it */
  }
  check("large --json output arrives complete through a pipe",
    parsed !== null && parsed.findings.length === 400,
    `got ${out.length} bytes, parse ${parsed ? "ok" : "FAILED"}`);
}

console.log("\nthe fix plan as data");

// --json used to return before fixes were planned, so the one caller that
// most needs the plan — the hosted watch, which has to describe what it
// changed — ran the fixer and threw its output away.
{
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-plan-"));
  writeFileSync(path.join(dir, "a.py"),
    'import openai\nMODEL = "text-davinci-003"\n');
  let out = "";
  try {
    out = execFileSync("node",
      [CLI, dir, "--offline", "--no-deps", "--fix", "--write", "--json"],
      { encoding: "utf8" });
  } catch (err) { out = err.stdout || ""; }
  let parsed = null;
  try { parsed = JSON.parse(out); } catch { /* reported below */ }

  check("--json carries the fix plan", !!parsed?.plan?.edits);
  check("the plan names the swap it made",
    parsed?.plan?.edits?.[0]?.from === "text-davinci-003" &&
    parsed?.plan?.edits?.[0]?.to === "gpt-5.6-terra");
  check("--json --fix --write actually writes the file",
    readFileSync(path.join(dir, "a.py"), "utf8").includes("gpt-5.6-terra"));

  // A scan with no --fix must not grow a plan key; the watch keys off it.
  let plainOut = "";
  try {
    plainOut = execFileSync("node", [CLI, dir, "--offline", "--no-deps", "--json"],
      { encoding: "utf8" });
  } catch (err) { plainOut = err.stdout || ""; }
  let plain = null;
  try { plain = JSON.parse(plainOut); } catch { /* reported below */ }
  check("a scan without --fix carries no plan", plain !== null && plain.plan === undefined);

  rmSync(dir, { recursive: true, force: true });
}

console.log("\nlockfile parsing");

// The parsers are exercised directly: hitting the live registries in a test
// would make the suite depend on someone else's uptime.
const { __test } = await import(CLI);

{
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-lock-"));
  writeFileSync(path.join(dir, "Cargo.lock"), `# @generated
version = 3

[[package]]
name = "openssl"
version = "0.10.44"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "abc"
dependencies = [
 "bitflags",
]

[[package]]
name = "local-workspace-member"
version = "0.1.0"

[[package]]
name = "from-git"
version = "2.0.0"
source = "git+https://github.com/someone/thing?rev=abc#abc"
`);
  const crates = await __test.cargoDeps([path.join(dir, "Cargo.lock")], dir);
  check("Cargo.lock yields a registry crate with its version",
    crates.has("openssl@0.10.44"));
  check("a workspace member with no source is not asked about",
    !crates.has("local-workspace-member@0.1.0"));
  check("a git dependency is not asked about",
    !crates.has("from-git@2.0.0"),
    "crates.io has no answer for a git source");

  writeFileSync(path.join(dir, "Gemfile.lock"), `GEM
  remote: https://rubygems.org/
  specs:
    rack (2.2.3)
    nokogiri (1.16.0-x86_64-linux)

PLATFORMS
  ruby

DEPENDENCIES
  rack (~> 2.2)
`);
  const gems = await __test.gemDeps([path.join(dir, "Gemfile.lock")], dir);
  check("Gemfile.lock yields the resolved gem version", gems.has("rack@2.2.3"));
  check("a platform-specific gem keeps its platform suffix",
    gems.has("nokogiri@1.16.0-x86_64-linux"));
  check("the DEPENDENCIES constraint block is not read as a version",
    gems.size === 2,
    `got ${[...gems.keys()].join(", ")}`);
  rmSync(dir, { recursive: true, force: true });
}

console.log("\nregistry failures");

// Every one of these lookups used to return {} from a bare catch, so a rate
// limit, a 500 or an unplugged network was indistinguishable from a package
// the registry had nothing against, and the report said "No drift found" when
// nothing had been asked. fetch is swapped for a stub here, which is also the
// only way to hit a rate limit on purpose.
{
  const realFetch = globalThis.fetch;
  const withFetch = async (stub, fn) => {
    globalThis.fetch = stub;
    try {
      return await fn();
    } finally {
      globalThis.fetch = realFetch;
    }
  };
  const offline = async () => {
    const err = new TypeError("fetch failed");
    err.cause = { code: "ENOTFOUND" };
    throw err;
  };
  const status = (code) => async () => new Response("", { status: code });

  for (const [name, check_] of [
    ["checkNpm", __test.checkNpm], ["checkPypi", __test.checkPypi],
    ["checkCrates", __test.checkCrates], ["checkRubygems", __test.checkRubygems],
    ["checkGoModule", __test.checkGoModule],
  ]) {
    const down = await withFetch(offline, () => check_("lodash"));
    check(`${name} reports a network failure as unanswered`,
      down.ok === false && down.why === "ENOTFOUND", `got ${JSON.stringify(down)}`);
    const rate = await withFetch(status(429), () => check_("lodash"));
    check(`${name} reports a rate limit as unanswered`,
      rate.ok === false && /429/.test(rate.why), `got ${JSON.stringify(rate)}`);
    // A 404 is a real answer: the package is not on this registry at all,
    // which is not a yank and never was.
    const gone = await withFetch(status(404), () => check_("private-thing"));
    check(`${name} treats a 404 as an answer, not an outage`, gone.ok === true,
      `got ${JSON.stringify(gone)}`);
  }

  const deps = new Map([
    ["lodash@4.17.21", "package-lock.json"],
    ["axios@1.2.3", "package-lock.json"],
  ]);
  const res = await __test.resolveFlagged(deps, async () => ({ ok: false, why: "HTTP 503" }), "npm");
  check("an unanswered lookup is never turned into a finding", res.flagged.length === 0);
  check("every package that went unasked is counted", res.unasked === 2, `got ${res.unasked}`);
  check("the count and the reason reach the output as a note",
    /npm: 2 of 2 package\(s\) could not be checked \(HTTP 503\)/.test(res.note || ""),
    `got ${res.note}`);

  // ── Go: the registry that keeps its verdicts in a manifest ──────────
  // go.sum parsing: the /go.mod twin lines are bookkeeping, not deps.
  {
    const dir = mkdtempSync(path.join(tmpdir(), "driftcite-go-"));
    writeFileSync(path.join(dir, "go.sum"), [
      "github.com/pkg/errors v0.9.1 h1:FEBLx1zS214owpjy7qsBeixbURkuhQAwrK5UwLGTwt4=",
      "github.com/pkg/errors v0.9.1/go.mod h1:bwawxfHBFNV+L2hUp1rHADufV3IMtnDRdf1r5NINEl0=",
      "golang.org/x/text v0.0.0-20170915032832-14c0d48ead0c h1:qgOY6WgZOaTkIIMiVjBQcw93ERBE4m30iBm00nkL0i8=",
      "golang.org/x/text v0.0.0-20170915032832-14c0d48ead0c/go.mod h1:NqM8EUOU14njkJ3fqMW+pc6Ldnwhi/IjpwHt7yyuwOQ=",
    ].join("\n"));
    const gomods = await __test.goDeps([path.join(dir, "go.sum")], dir);
    rmSync(dir, { recursive: true, force: true });
    check("go.sum yields one dependency per module, not one per line",
      gomods.size === 2, `got ${[...gomods.keys()].join(", ")}`);
    check("a pseudo-version is kept verbatim",
      gomods.has("golang.org/x/text@v0.0.0-20170915032832-14c0d48ead0c"));
  }

  // go.mod parsing: Deprecated comment, bare/range/block retracts, reasons.
  {
    const mod = [
      "// Deprecated: use example.com/newer instead.",
      "module github.com/old/thing",
      "",
      "go 1.21",
      "",
      "retract v1.4.0 // built from the wrong branch",
      "retract (",
      "  v1.2.3 // leaked credentials",
      "  [v1.0.0, v1.1.9]",
      ")",
    ].join("\n");
    const parsed = __test.parseGoMod(mod);
    check("Deprecated: is read from above the module directive",
      parsed.deprecated === "use example.com/newer instead.");
    check("all three retract spellings are read",
      parsed.retract.length === 3, `got ${JSON.stringify(parsed.retract)}`);
    check("a retraction keeps its rationale",
      parsed.retract.some((r) => r.reason === "leaked credentials"));
  }

  // Version ordering: releases, prereleases, and pseudo-versions.
  check("go version ordering places a version inside a range",
    __test.cmpGoVersion("v1.1.0", "v1.0.0") > 0 &&
    __test.cmpGoVersion("v1.1.0", "v1.1.9") < 0);
  check("a prerelease sorts before its release",
    __test.cmpGoVersion("v1.2.0-rc.1", "v1.2.0") < 0);

  // The whole Go path: proxy answers -> retract range hit + module-wide
  // deprecation, and a version outside every range stays clean.
  {
    const proxy = async (url) => {
      const u = String(url);
      if (u.endsWith("/@latest")) {
        return new Response(JSON.stringify({ Version: "v1.9.0" }), { status: 200 });
      }
      if (u.endsWith(".mod")) {
        return new Response([
          "// Deprecated: maintained at example.com/two.",
          "module github.com/old/thing",
          "retract [v1.0.0, v1.1.9] // broken releases",
        ].join("\n"), { status: 200 });
      }
      return new Response("", { status: 404 });
    };
    const deps = new Map([
      ["github.com/old/thing@v1.1.5", "go.sum"],
      ["github.com/old/thing@v1.9.0", "go.sum"],
    ]);
    const res = await withFetch(proxy, () =>
      __test.resolveFlagged(deps, __test.checkGoModule, "go"));
    const inRange = res.flagged.find((f) => f.version === "v1.1.5");
    const outside = res.flagged.find((f) => f.version === "v1.9.0");
    check("a version inside a retract range is flagged with the rationale",
      /retracted by the maintainer: broken releases/.test(inRange?.message || ""),
      `got ${inRange?.message}`);
    check("a version outside every range still carries the module deprecation",
      /Deprecated by the maintainer: maintained at example.com\/two\./.test(outside?.message || ""),
      `got ${outside?.message}`);
    check("the retract range does not swallow the whole module",
      res.flagged.length === 2, `got ${res.flagged.length}`);
  }

  // Case-encoding: an uppercase letter in a module path becomes !lowercase
  // on the proxy, or the lookup 404s for every mixed-case module.
  {
    let asked = "";
    const capture = async (url) => { asked = String(url); return new Response("", { status: 404 }); };
    await withFetch(capture, () => __test.checkGoModule("github.com/Azure/azure-sdk-for-go"));
    check("uppercase module paths are case-encoded for the proxy",
      asked.includes("github.com/!azure/azure-sdk-for-go"), `asked ${asked}`);
  }

  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-reg-"));
  writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify({
    lockfileVersion: 3,
    packages: { "": {}, "node_modules/lodash": { version: "4.17.21" } },
  }));
  const reg = await withFetch(status(503), () => __test.scanRegistry(dir));
  rmSync(dir, { recursive: true, force: true });
  check("a registry outage surfaces beside the unread-lockfile notes",
    reg.notes.some((n) => n.startsWith("npm:") && n.includes("503")),
    `notes: ${JSON.stringify(reg.notes)}`);
  check("the scan still reports how many went unchecked", reg.unreachable === 1,
    `got ${reg.unreachable}`);
}

// End to end, with every network call failing the way it does on a plane.
// A preloaded stub replaces fetch before the CLI starts, so this exercises the
// real registry path — the one --offline skips — without touching a registry.
{
  const stubDir = mkdtempSync(path.join(tmpdir(), "driftcite-stub-"));
  const stub = path.join(stubDir, "no-network.mjs");
  writeFileSync(stub, [
    "globalThis.fetch = async () => {",
    '  const e = new TypeError("fetch failed");',
    '  e.cause = { code: "ENOTFOUND" };',
    "  throw e;",
    "};", "",
  ].join("\n"));

  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-net-"));
  writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify({
    lockfileVersion: 3,
    packages: { "": {}, "node_modules/lodash": { version: "4.17.21" } },
  }));
  const args = ["--import", pathToFileURL(stub).href, CLI, dir];
  let out = "", code = 0;
  try {
    out = execFileSync("node", args, { encoding: "utf8" });
  } catch (err) {
    out = err.stdout || "";
    code = err.status ?? 1;
  }
  rmSync(dir, { recursive: true, force: true });
  rmSync(stubDir, { recursive: true, force: true });

  check("an unreachable registry does not fail the build", code === 0, `got exit ${code}`);
  check("an unreachable registry is named in the report",
    /note: npm: 1 of 1 package\(s\) could not be checked/.test(out), out);
  check("the summary does not claim a package nobody could ask about is clean",
    out.includes("No drift found in what could be checked."), out);
}

console.log("\nlocal manifests");

// Full --json payload, for the tests that need more than findings.
function runPayload(files, extraArgs = []) {
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-local-"));
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(dir, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  let out = "";
  try {
    out = execFileSync("node", [CLI, dir, "--offline", "--no-deps", "--json", ...extraArgs], {
      encoding: "utf8",
    });
  } catch (err) {
    out = err.stdout || "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return JSON.parse(out);
}

const localDoc = (artifacts) =>
  JSON.stringify({ local_version: 1, artifacts });

const acme = {
  id: "acme/model_id/acme-gpt-1-legacy",
  provider: "acme",
  kind: "model_id",
  match: { literals: ["acme-gpt-1-legacy"] },
  status: "deprecated",
  severity: "warning",
  retires_on: "2026-01-01",
  replacement: "acme-gpt-2",
  note: "Deprecated 2025-10-01 by the platform team; retired 2026-01-01.",
  evidence: "https://wiki.example.com/acme/deprecations",
};

// An artifact for an API the public feed does not track must fire like any
// feed artifact, deadline arithmetic included.
{
  const p = runPayload({
    ".driftcite-local.json": localDoc([acme]),
    "app.js": `const model = "acme-gpt-1-legacy";`,
  });
  const f = p.findings.find((x) => x.artifact === acme.id);
  check("a local artifact fires on a real call site", Boolean(f));
  check("a local artifact's past deadline computes as retired and breaking",
    f?.status === "retired" && f?.severity === "breaking",
    JSON.stringify(f));
  check("the payload says how many local artifacts loaded",
    p.local?.artifacts === 1 && p.local?.file === ".driftcite-local.json",
    JSON.stringify(p.local));
}

// The rules are the feed's rules: no evidence, no artifact — skipped and
// named, never silently dropped and never silently accepted.
{
  const p = runPayload({
    ".driftcite-local.json": localDoc([{ ...acme, evidence: undefined }]),
    "app.js": `const model = "acme-gpt-1-legacy";`,
  });
  check("a local artifact with no evidence is skipped",
    p.findings.length === 0);
  check("the skip is named in the payload",
    p.local?.problems.some((x) => x.includes("evidence")),
    JSON.stringify(p.local));
}

// A local artifact claiming a literal the feed already carries would put two
// death dates on one line of code; the feed wins, out loud.
{
  const p = runPayload({
    ".driftcite-local.json": localDoc([{
      ...acme,
      id: "acme/model_id/text-davinci-003",
      match: { literals: ["text-davinci-003"] },
    }]),
    "app.js": `const model = "text-davinci-003";`,
  });
  check("a literal collision loses to the public feed",
    p.findings.every((f) => f.artifact.startsWith("openai/")),
    JSON.stringify(p.findings.map((f) => f.artifact)));
  check("the collision names the feed artifact that owns the literal",
    p.local?.problems.some((x) => x.includes("openai/model_id/text-davinci-003")),
    JSON.stringify(p.local));
}

// The local file contains every one of its own literals by definition.
{
  const p = runPayload({
    ".driftcite-local.json": localDoc([acme]),
    "clean.js": `export const hello = () => 'world';`,
  });
  check("the local manifest itself is never scanned", p.findings.length === 0,
    JSON.stringify(p.findings.map((f) => `${f.file}:${f.artifact}`)));
}

// Kinds that need context keep needing it locally: a retired parameter named
// like an English word must not flag unrelated code.
{
  const bare = { ...acme, id: "acme/request_param/legacy_flag", kind: "request_param",
    match: { literals: ["legacy_flag"] } };
  const noMarkers = runPayload({
    ".driftcite-local.json": localDoc([bare]),
    "app.js": `post({ legacy_flag: true });`,
  });
  check("a context-required kind without file_markers is refused",
    noMarkers.findings.length === 0 &&
    noMarkers.local?.problems.some((x) => x.includes("file_markers")),
    JSON.stringify(noMarkers.local));

  const withMarkers = { ...bare, file_markers: ["api.acme.internal"] };
  const gated = runPayload({
    ".driftcite-local.json": localDoc([withMarkers]),
    "other.js": `post({ legacy_flag: true });`,
    "app.js": `// api.acme.internal\npost({ legacy_flag: true });`,
  });
  check("local marker gating admits the marked file and refuses the bare one",
    gated.findings.length === 1 && gated.findings[0].file === "app.js",
    JSON.stringify(gated.findings.map((f) => f.file)));
}

// --init-local writes a template whose example is documentation, not data:
// initialising the file must not create findings.
{
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-init-"));
  writeFileSync(path.join(dir, "app.js"), `const x = "/v1/users";`);
  let out = "";
  try {
    execFileSync("node", [CLI, dir, "--init-local"], { encoding: "utf8" });
    out = execFileSync("node", [CLI, dir, "--offline", "--no-deps", "--json"], {
      encoding: "utf8",
    });
  } catch (err) {
    out = err.stdout || "";
  }
  const p = JSON.parse(out);
  check("--init-local writes a template that creates zero findings",
    p.findings.length === 0 && p.local?.artifacts === 0 &&
    p.local?.problems.length === 0,
    JSON.stringify({ findings: p.findings.length, local: p.local }));
  let refused = 0;
  try {
    execFileSync("node", [CLI, dir, "--init-local"], { encoding: "utf8" });
  } catch (err) {
    refused = err.status;
  }
  rmSync(dir, { recursive: true, force: true });
  check("--init-local refuses to overwrite an existing file", refused === 2,
    `got exit ${refused}`);
}

console.log("\nreporting");
check(
  "a clean repository yields no findings",
  runOn({ "clean.js": `export const hello = () => 'world';` }).length === 0
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
