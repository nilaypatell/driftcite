#!/usr/bin/env node
/**
 * The hosted watch: one sweep across every installation of the App.
 *
 * There is no server. This process starts, walks every repository the App
 * can see, opens the pull requests that are due, writes the state file, and
 * exits; scheduling it is cron's job. Dry run is the default and prints
 * exactly what a live run would have done.
 *
 *   export DRIFTCITE_APP_ID=…          the App's numeric id
 *   export DRIFTCITE_APP_KEY_FILE=…    path to the App's private key PEM
 *   node ee/watch/watch.mjs --state ~/.driftcite/watch-state.json [--live] [--full]
 *
 * Serial on purpose, one repository and one PR at a time: the binding limit
 * is 500 content-creating requests per hour, and a queue that honours
 * Retry-After survives it where a fan-out gets the App suspended.
 *
 * Exit 0 if every repository was reached, 1 if any of them failed and was
 * named as failed, 2 if the sweep itself could not run.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appJwt, makeApi, installationToken, listInstallations, listRepos } from "./github.mjs";
import { loadState, saveState, carryPrs, markFailed, openPrs, recordOutcome } from "./state.mjs";
import { feedSnapshot, feedDelta, planRepo } from "./plan.mjs";
import { sweepRepo } from "./sweep.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "..", "bin", "driftcite.mjs");
const FEED = path.join(HERE, "..", "..", "feed", "feed.json");

const USAGE = `driftcite watch: scan every repository the App is installed on.

  node ee/watch/watch.mjs --state <file>          dry run, nothing pushed
  node ee/watch/watch.mjs --state <file> --live   push branches, open PRs
  node ee/watch/watch.mjs --state <file> --full   rescan everything

Needs DRIFTCITE_APP_ID and DRIFTCITE_APP_KEY_FILE in the environment. The App
holds exactly two repository permissions: Contents (read & write) and Pull
requests (read & write).`;

/**
 * The sweep itself: every installation, every repository, one at a time.
 *
 * Nothing a single repository does ends the run. A clone that dies halfway,
 * a permission removed between minting the token and using it, a lockfile
 * the scanner chokes on — before this, any of them threw all the way out of
 * the process, and because the state file is written once at the end, the
 * work already done on every repository swept before the bad one was thrown
 * away with it. The next run then re-cloned all of them. So a repository
 * that fails is recorded as failed, named in the output, and the sweep moves
 * on to the next one.
 *
 * Effects come in as arguments, the same as every other module here, so the
 * tests can run a full sweep with no network and no real App.
 */
export async function runSweep({
  state, today, live, full, delta, api, installations, jwt,
  mintToken = installationToken,
  repos = listRepos,
  sweep = sweepRepo,
  cliPath = CLI,
  log = console.log,
}) {
  const counts = {};
  const tally = (k) => { counts[k] = (counts[k] || 0) + 1; };
  const failures = [];

  // An error message is the operator's only clue about a repository that
  // threw, and it is also the one string in this run written by someone
  // else's git or scanner output. One capped line of it reaches the log, so
  // a stack trace or a chunk of a customer's file cannot pour into it.
  const because = (err) => String(err?.message ?? err).split("\n")[0].slice(0, 200);
  const line = (action, name, note) => log(`  ${action.padEnd(12)} ${name}   ${note}`);

  const failed = (name, err) => {
    tally("failed");
    failures.push({ name, because: because(err) });
    line("failed", name, because(err));
  };

  for (const inst of installations) {
    let token;
    let visible;
    try {
      // A JWT lives nine minutes and an installation token an hour; minting
      // fresh ones per installation keeps a long serial sweep inside both.
      token = await mintToken(api, jwt(), inst.id);
      visible = await repos(api, token);
    } catch (err) {
      // A suspended installation or a revoked grant is one customer's
      // problem, and it used to be every customer's: the throw came out
      // through the whole loop and no state was written at all. There is no
      // repository to mark here — the list of them is exactly what failed.
      failed(`installation ${inst.id}`, err);
      continue;
    }

    // Before scanning anything, find out what happened to what we already
    // proposed. This is cheap — one GET per pull request still recorded as
    // open — and it is the only fact in the whole sweep that nobody else
    // publishes and that cannot be recovered later: a maintainer's answer,
    // attributed to the artifacts we asked about. A merge says the swap was
    // right; a close says a removal we called breaking broke nobody.
    for (const [name, branch, url] of openPrs(state)) {
      const number = /\/pull\/(\d+)$/.exec(url || "")?.[1];
      if (!number || !visible.some((r) => r.full_name === name)) continue;
      try {
        const pr = await api(token, "GET", `/repos/${name}/pulls/${number}`);
        if (!pr || pr.state === "open") continue;
        const outcome = pr.merged_at ? "merged" : "closed";
        if (recordOutcome(state, name, branch, outcome, today)) {
          tally(outcome);
          line(outcome, name, `#${number}`);
        }
      } catch (err) {
        // A deleted or transferred repository is not a sweep failure, and a
        // pull request we can no longer read simply stays open in the record.
        line("outcome?", name, because(err));
      }
    }

    for (const repo of visible) {
      const name = repo.full_name;
      const entry = state.repos[name];
      try {
        // For a known repo, one cheap API call decides whether the clone is
        // earned at all; a never-seen repo is cloned regardless.
        let head = null;
        if (entry) {
          const branch = await api(token, "GET",
            `/repos/${name}/branches/${encodeURIComponent(repo.default_branch)}`);
          head = branch?.commit?.sha ?? null;
        }
        const plan = planRepo(entry, { head, delta, full });
        if (!plan.scan) {
          tally("skipped");
          line("skip", name, plan.reason);
          continue;
        }

        const out = await sweep({
          repo: {
            fullName: name,
            cloneUrl: repo.clone_url.replace("https://", `https://x-access-token:${token}@`),
            defaultBranch: repo.default_branch,
          },
          api, token, cliPath, today, live,
        });
        state.repos[name] = carryPrs(entry, out.entry);
        tally(out.action);
        line(out.action, name, plan.reason + (out.url ? `   ${out.url}` : ""));
      } catch (err) {
        // Whatever went wrong here is about this repository: the sweep of
        // the next one is unaffected, and the entries already folded into
        // the state stay folded in. The mark is what stops a repository
        // from going quiet — the next sweep scans it whether or not
        // anything moved.
        state.repos[name] = markFailed(entry, today);
        failed(name, err);
      }
    }
  }

  return { counts, failures };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(USAGE);
    return 0;
  }
  const live = argv.includes("--live");
  const full = argv.includes("--full");
  const stateAt = argv.indexOf("--state");
  const stateFile = stateAt >= 0 ? argv[stateAt + 1] : null;
  if (!stateFile) throw new Error("--state <file> is required; the sweep is stateful on purpose");

  const appId = process.env.DRIFTCITE_APP_ID;
  const keyFile = process.env.DRIFTCITE_APP_KEY_FILE;
  if (!appId || !keyFile) throw new Error("set DRIFTCITE_APP_ID and DRIFTCITE_APP_KEY_FILE");
  const privateKey = await readFile(keyFile, "utf8");

  const today = new Date().toISOString().slice(0, 10);
  const state = await loadState(stateFile);
  const feed = JSON.parse(await readFile(FEED, "utf8"));
  const snapshot = feedSnapshot(feed);
  const delta = feedDelta(state.feed_snapshot, snapshot);
  if (delta.size) {
    console.log(`providers moved since last sweep: ${[...delta].sort().join(", ")}`);
  }

  const api = makeApi({});
  const installations = await listInstallations(api, appJwt({ appId, privateKey }));
  console.log(`${installations.length} installation(s)` +
    (live ? "" : "   dry run: nothing will be pushed"));

  let counts = {};
  let failures = [];
  let fatal = null;
  try {
    ({ counts, failures } = await runSweep({
      state, today, live, full, delta, api, installations,
      jwt: () => appJwt({ appId, privateKey }),
    }));
  } catch (err) {
    // A repository never gets here; this is the sweep itself coming apart.
    // What it learned before that is still true, and dropping it would send
    // the next run back to clone every repository this one already read.
    fatal = err;
  }

  state.last_sweep = today;
  // The snapshot is how the next sweep learns which providers moved.
  // Advancing it after a run that did not finish would retire a delta on
  // behalf of repositories this run never reached, and they would sit
  // unscanned straight through the drift. A repository that failed is not
  // stranded that way: it carries failed_on and is scanned regardless.
  if (!fatal) state.feed_snapshot = snapshot;

  if (live) {
    await saveState(stateFile, state);
  } else {
    console.log("dry run: state not written, nothing was pushed");
  }
  console.log(
    Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ") || "no repositories visible"
  );
  // Named, not buried in the per-repository lines above: a sweep that quietly
  // half-happened is the one failure mode nobody notices.
  if (failures.length) {
    console.log(`failed: ${failures.map((f) => f.name).join(", ")}`);
  }
  if (fatal) {
    console.error(`driftcite watch: ${fatal.message}`);
    return 2;
  }
  return failures.length ? 1 : 0;
}

// Only run when invoked as a command, so the tests can import runSweep and
// drive a whole sweep without the process going looking for an App.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  // Same flush discipline as the CLI: process.exit() would truncate piped
  // output, so set the code and let the process drain.
  main().then(
    (code) => { process.exitCode = code; },
    (err) => {
      console.error(`driftcite watch: ${err.message}`);
      process.exitCode = 2;
    }
  );
}
