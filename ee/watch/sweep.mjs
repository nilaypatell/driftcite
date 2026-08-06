/**
 * One repository, end to end: clone, scan with the public CLI, apply only
 * the fixes the provider itself named, push a branch, open one pull request.
 *
 * The scan and the fix are the same code paths anyone can read in
 * bin/driftcite.mjs, run with --offline so a sweep sees exactly one feed
 * version throughout. The clone lives in a temporary directory for the
 * duration of one repository and is deleted before the next one starts.
 *
 * What leaves this function is a fingerprint — provider names, artifact ids,
 * the head commit, PR bookkeeping — and never a file path, line, or excerpt.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { branchName, existingBranch, prBody, splitWorkflowEdits, PR_TITLE } from "./pr.mjs";

const exec = promisify(execFile);

// Until the App is registered this is a placeholder in the right shape;
// GitHub attributes commits from an App to <slug>[bot] regardless.
const BOT_NAME = "driftcite[bot]";
const BOT_EMAIL = "driftcite[bot]@users.noreply.github.com";

async function runCli(cliPath, args) {
  // Exit 1 just means breaking findings were present, which is the normal
  // case for a repository worth opening a PR on.
  try {
    return (await exec("node", [cliPath, ...args])).stdout;
  } catch (err) {
    if (typeof err.stdout === "string" && err.stdout) return err.stdout;
    throw err;
  }
}

export async function sweepRepo({ repo, api, token, cliPath, today, live }) {
  const dir = await mkdtemp(path.join(tmpdir(), "driftcite-clone-"));
  const git = (...args) => exec("git", ["-C", dir, ...args]);
  try {
    await exec("git", ["clone", "--quiet", "--depth", "1", repo.cloneUrl, dir]);
    const head = (await git("rev-parse", "HEAD")).stdout.trim();

    const scan = JSON.parse(await runCli(cliPath, [dir, "--offline", "--no-deps", "--json"]));
    const findings = scan.findings || [];
    const entry = {
      providers: [...new Set(findings.map((f) => f.artifact.split("/")[0]))].sort(),
      artifacts: [...new Set(findings.map((f) => f.artifact))].sort(),
      head,
      last_scan: today,
      prs: {},
    };

    const breaking = findings.filter((f) => f.severity === "breaking");
    if (!breaking.length) return { action: "clean", entry };

    // Fix inside the clone. The clone is ours; only pushing is an act, so
    // the dry run applies the fix too and reports what it produced.
    await runCli(cliPath, [dir, "--offline", "--no-deps", "--fix", "--write"]);
    const changed = (await git("status", "--porcelain")).stdout
      .split("\n").filter(Boolean).map((line) => line.slice(3));
    if (!changed.length) return { action: "needs-human", entry };

    const { allowed, refused } = splitWorkflowEdits(changed);
    for (const file of refused) await git("checkout", "--", file);
    if (!allowed.length) return { action: "needs-human", entry, refused };

    // Any driftcite branch on the remote means a previous PR is open, was
    // merged with its branch left behind, or was deliberately closed.
    // Re-opening it is how a helpful bot becomes a nuisance, so leave it
    // alone either way. Every head is listed rather than asking the remote
    // to match a pattern for us, because the answer decides whether we push
    // into someone else's repository and glob semantics are not worth
    // betting that on.
    const heads = (await git("ls-remote", "--heads", "origin")).stdout;
    const existing = existingBranch(heads);
    if (existing) return { action: "left-alone", entry, refused, branch: existing };

    const branch = branchName(today);

    const body = prBody(breaking);
    if (!live) {
      return { action: "would-open-pr", entry, refused, files: allowed, body };
    }

    await git("checkout", "-q", "-b", branch);
    await git("-c", `user.name=${BOT_NAME}`, "-c", `user.email=${BOT_EMAIL}`,
      "commit", "-qam", PR_TITLE);
    await git("push", "-q", "origin", branch);
    const pr = await api(token, "POST", `/repos/${repo.fullName}/pulls`, {
      title: PR_TITLE,
      head: branch,
      base: repo.defaultBranch,
      body,
    });
    entry.prs[branch] = { opened_on: today, url: pr.html_url };
    return { action: "opened-pr", entry, refused, files: allowed, url: pr.html_url };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
