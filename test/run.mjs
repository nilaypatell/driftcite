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
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
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
  runOn({ "app.js": `const m = 'claude-3-opus-20240229';` })
    .some((f) => f.artifact === "anthropic/model_id/claude-3-opus-20240229")
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
  runOn({ "app.js": `const m = 'claude-3-opus-20240229'; // legacy` }).length > 0
);

// A manifest contains every literal by definition, so vendoring the feed into
// a repository must not report the entire feed back as findings.
check(
  "ignores vendored drift manifests",
  runOn({
    "vendor/feed.json": JSON.stringify({
      feed_version: 1,
      artifacts: [{ id: "x", match: { literals: ["claude-3-opus-20240229"] } }],
    }),
  }).length === 0
);

console.log("\ndeadline arithmetic");

const findings = runOn({ "app.js": `const m = 'claude-3-opus-20240229';` });
const opus = findings.find((f) => f.artifact.endsWith("claude-3-opus-20240229"));

check("a passed retirement date reports as retired", opus?.status === "retired",
  `got status=${opus?.status}`);
check("a passed retirement date is breaking", opus?.severity === "breaking",
  `got severity=${opus?.severity}`);
check("days elapsed is negative and counted", typeof opus?.daysLeft === "number" && opus.daysLeft < 0,
  `got daysLeft=${opus?.daysLeft}`);
check("every finding carries its evidence url", findings.every((f) => f.evidence),
  "a finding without an evidence URL is exactly what this project exists to avoid");

console.log("\nreporting");
check(
  "a clean repository yields no findings",
  runOn({ "clean.js": `export const hello = () => 'world';` }).length === 0
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
