/**
 * Postbuild gate for the two agent-facing files the export emits.
 *
 * The setup prompt names a CLI version and a set of flags. If either
 * drifts from the repository it describes, the site is publishing exactly
 * the failure driftcite exists to catch — a published identifier that no
 * longer matches the artifact behind it — so a mismatch fails the build
 * rather than shipping.
 *
 * Two of the checks need the repository above site/ (package.json for the
 * version pin, bin/driftcite.mjs for the flag list). On Vercel the project
 * root is site/ and the repository is not uploaded, so those two skip
 * there by design and run on every local and CI build.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "out");
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
  if (!ok) failures.push(name);
};

console.log("agent artifacts");

/* ── setup.md ───────────────────────────────────────────────────────── */
const setupPath = path.join(OUT, "setup.md");
check("out/setup.md exists", existsSync(setupPath));
const setup = existsSync(setupPath) ? readFileSync(setupPath, "utf8") : "";

// The soft-404 lesson: status codes and content-types both lie, so assert
// on a body marker a real prompt must carry and an error page never will.
check("setup.md carries its OBJECTIVE marker", setup.includes("OBJECTIVE:"));
check("setup.md ends with the EXECUTE NOW close", setup.includes("EXECUTE NOW:"));

// Pure printable ASCII + newline. Em-dashes, curly quotes, zero-widths and
// NBSPs are the characters that clipboard round-trips mangle first.
const badChars = [...setup].filter((c) => !/[\x20-\x7E\n]/.test(c));
check(
  "setup.md is printable ASCII plus newline only",
  badChars.length === 0,
  `found: ${[...new Set(badChars)].map((c) => "U+" + c.codePointAt(0).toString(16).padStart(4, "0")).join(", ")}`,
);

// 3-7 TODO checkboxes, per the hardened install-doc shape.
const boxes = (setup.match(/^- \[ \]/gm) || []).length;
check("setup.md has 3-7 TODO checkboxes", boxes >= 3 && boxes <= 7, `found ${boxes}`);

/* ── llms.txt ───────────────────────────────────────────────────────── */
const llmsPath = path.join(OUT, "llms.txt");
check("out/llms.txt exists", existsSync(llmsPath));
const llms = existsSync(llmsPath) ? readFileSync(llmsPath, "utf8") : "";
check("llms.txt opens with the H1", llms.startsWith("# driftcite"));
check("llms.txt links the setup file", llms.includes("/setup.md"));

/* ── against the repository, when it is present ─────────────────────── */
const rootPkgPath = path.join(HERE, "..", "..", "package.json");
const cliPath = path.join(HERE, "..", "..", "bin", "driftcite.mjs");

if (existsSync(rootPkgPath)) {
  const version = JSON.parse(readFileSync(rootPkgPath, "utf8")).version;
  check(
    `setup.md pins the repository's version (driftcite@${version})`,
    setup.includes(`driftcite@${version}`),
    "bump site/lib/agent-setup.ts PIN when the CLI version changes",
  );
} else {
  console.log("  skip version pin check (no ../package.json here)");
}

if (existsSync(cliPath)) {
  const help = execFileSync("node", [cliPath, "--help"], { encoding: "utf8" });
  const helpFlags = new Set(help.match(/--[a-z][a-z-]*/g) || []);
  const named = [...new Set(setup.match(/--[a-z][a-z-]*/g) || [])];
  const missing = named.filter((f) => !helpFlags.has(f));
  check(
    "every flag setup.md names exists in the CLI's --help",
    missing.length === 0,
    `setup.md names flags --help lacks: ${missing.join(", ")}`,
  );
} else {
  console.log("  skip flag check (no ../bin/driftcite.mjs here)");
}

if (failures.length) {
  console.error(`\n${failures.length} agent-artifact check(s) failed`);
  process.exit(1);
}
console.log("");
