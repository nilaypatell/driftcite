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
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appJwt, makeApi, installationToken, listInstallations, listRepos } from "./github.mjs";
import { loadState, saveState, carryPrs } from "./state.mjs";
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

  const counts = {};
  const tally = (k) => { counts[k] = (counts[k] || 0) + 1; };

  for (const inst of installations) {
    // A JWT lives nine minutes and an installation token an hour; minting
    // fresh ones per installation keeps a long serial sweep inside both.
    const token = await installationToken(api, appJwt({ appId, privateKey }), inst.id);

    for (const repo of await listRepos(api, token)) {
      const name = repo.full_name;
      const entry = state.repos[name];

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
        console.log(`  skip   ${name}   ${plan.reason}`);
        continue;
      }

      const out = await sweepRepo({
        repo: {
          fullName: name,
          cloneUrl: repo.clone_url.replace("https://", `https://x-access-token:${token}@`),
          defaultBranch: repo.default_branch,
        },
        api, token, cliPath: CLI, today, live,
      });
      state.repos[name] = carryPrs(entry, out.entry);
      tally(out.action);
      console.log(`  ${out.action.padEnd(12)} ${name}   ${plan.reason}` +
        (out.url ? `   ${out.url}` : ""));
    }
  }

  state.feed_snapshot = snapshot;
  state.last_sweep = today;
  if (live) {
    await saveState(stateFile, state);
  } else {
    console.log("dry run: state not written, nothing was pushed");
  }
  console.log(
    Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ") || "no repositories visible"
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`driftcite watch: ${err.message}`);
    process.exit(2);
  }
);
