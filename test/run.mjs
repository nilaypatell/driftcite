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
import { fileURLToPath } from "node:url";

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
  try {
    out = execFileSync("node", args, { encoding: "utf8" });
  } catch (err) {
    out = err.stdout || "";
  }
  const result = { out, files: {} };
  for (const name of Object.keys(files)) {
    result.files[name] = readFileSync(path.join(dir, name), "utf8");
  }
  rmSync(dir, { recursive: true, force: true });
  return result;
}

{
  const r = runFix({ "a.js": `const m = 'text-davinci-003';` }, true);
  check("applies the replacement the provider named",
    r.files["a.js"].includes("gpt-3.5-turbo-instruct"));
  check("removes the retired literal", !r.files["a.js"].includes("text-davinci-003"));
  check("preserves the original quote style",
    r.files["a.js"].includes("'gpt-3.5-turbo-instruct'"),
    `got: ${r.files["a.js"].trim()}`);
}

{
  const src = `const a = "text-davinci-003";\n// keep 'text-davinci-003' here\n`;
  const r = runFix({ "b.js": src }, true);
  check("fixes double-quoted code without touching the comment",
    r.files["b.js"].includes('"gpt-3.5-turbo-instruct"') &&
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
    "  'gpt-3.5-turbo-instruct': { in: 2 },",
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
    r.files["call.js"].includes("gpt-3.5-turbo-instruct"));
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

console.log("\nreporting");
check(
  "a clean repository yields no findings",
  runOn({ "clean.js": `export const hello = () => 'world';` }).length === 0
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
