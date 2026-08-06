#!/usr/bin/env node
/**
 * Tests for the hosted watch (ee/watch).
 *
 * Everything runs with no network and no real GitHub App: the API is a fake
 * that records its calls, and the git remote is a local bare repository. The
 * end-to-end sweep test is the contract: clone, scan with the public CLI,
 * fix, push a branch, open one PR, and persist nothing but artifact IDs.
 */

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appJwt, makeApi, paginate } from "../ee/watch/github.mjs";
import {
  emptyState, assertPrivate, loadState, saveState, carryPrs, markFailed,
} from "../ee/watch/state.mjs";
import { feedSnapshot, feedDelta, planRepo } from "../ee/watch/plan.mjs";
import {
  branchName, existingBranch, prBody, splitWorkflowEdits, PR_TITLE,
} from "../ee/watch/pr.mjs";
import { sweepRepo } from "../ee/watch/sweep.mjs";
import { runSweep } from "../ee/watch/watch.mjs";

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

const b64json = (part) => JSON.parse(Buffer.from(part, "base64url").toString());

console.log("\napp auth");

{
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const now = 1_700_000_000_000;
  const jwt = appJwt({ appId: "12345", privateKey: pem, now });
  const [h, p, sig] = jwt.split(".");

  check("jwt is three dot-separated parts", jwt.split(".").length === 3);
  check("jwt header says RS256", b64json(h).alg === "RS256");
  check("jwt issuer is the app id", b64json(p).iss === "12345");
  // GitHub rejects tokens issued in the future; clock skew between us and
  // them is absorbed by backdating a minute.
  check("jwt iat is backdated 60s", b64json(p).iat === now / 1000 - 60);
  check("jwt expires 9 minutes out, under the 10-minute cap",
    b64json(p).exp === now / 1000 + 540);
  check("jwt signature verifies against the key",
    crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKey,
      Buffer.from(sig, "base64url")));
}

console.log("\nthe api, under limits");

const res = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

{
  // The secondary limit answers with Retry-After. Sleeping that long and
  // retrying is the difference between a queue and a ban.
  const calls = [];
  const slept = [];
  const responses = [
    res(403, { message: "secondary rate limit" }, { "retry-after": "7" }),
    res(200, { fine: true }),
  ];
  const api = makeApi({
    fetch: async (url, opts) => { calls.push({ url, opts }); return responses.shift(); },
    sleep: async (ms) => slept.push(ms),
  });
  const out = await api("tok", "GET", "/rate-limited");
  check("retries after the Retry-After window", out.fine === true);
  check("slept exactly what the header asked", slept.length === 1 && slept[0] === 7000);
  check("sends the token as a bearer",
    calls[0].opts.headers.authorization === "Bearer tok");
}

{
  // An exhausted primary window says remaining=0 and when it resets.
  const slept = [];
  const nowSec = 1_700_000_000;
  const responses = [
    res(403, { message: "rate limit exceeded" },
      { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(nowSec + 30) }),
    res(200, { fine: true }),
  ];
  const api = makeApi({
    fetch: async () => responses.shift(),
    sleep: async (ms) => slept.push(ms),
    now: () => nowSec * 1000,
  });
  const out = await api("tok", "GET", "/exhausted");
  check("waits for the primary window to reset", out.fine === true);
  check("sleeps until the reset time, plus a beat",
    slept.length === 1 && slept[0] >= 30_000 && slept[0] <= 35_000,
    `slept ${slept[0]}`);
}

{
  // A 404 is an answer, not an invitation to retry.
  const calls = [];
  const api = makeApi({
    fetch: async () => { calls.push(1); return res(404, { message: "not found" }); },
    sleep: async () => {},
  });
  let threw = null;
  try {
    await api("tok", "GET", "/missing");
  } catch (err) {
    threw = err;
  }
  check("does not retry a plain 404", calls.length === 1);
  check("throws with the status attached", threw?.status === 404);
}

{
  const pages = {
    "https://api.github.com/app/installations?per_page=100": res(200, [{ id: 1 }],
      { link: '<https://api.github.com/app/installations?page=2>; rel="next"' }),
    "https://api.github.com/app/installations?page=2": res(200, [{ id: 2 }]),
  };
  const api = makeApi({ fetch: async (url) => pages[url] ?? res(500, {}), sleep: async () => {} });
  const all = await paginate(api, "tok", "/app/installations?per_page=100");
  check("pagination follows the Link header to the end",
    all.length === 2 && all[0].id === 1 && all[1].id === 2);
}

console.log("\nthe state file stays private");

{
  const state = emptyState();
  state.repos["octo/app"] = {
    providers: ["openai"],
    artifacts: ["openai/model_id/text-davinci-003"],
    head: "abc123",
    last_scan: "2026-08-05",
    prs: { "driftcite/2026-08-05": { opened_on: "2026-08-05", url: "https://x" } },
  };
  let ok = true;
  try {
    assertPrivate(state);
  } catch {
    ok = false;
  }
  check("artifact ids, sha and pr bookkeeping are allowed", ok);
}

{
  // The promise is "a few hundred strings, never files". A future edit that
  // persists a finding verbatim must fail here, not ship.
  const cases = {
    "a findings array": (s) => { s.repos["o/r"] = { providers: [], artifacts: [], head: null, last_scan: null, prs: {}, findings: [{ file: "src/a.js" }] }; },
    "a file path posing as an artifact": (s) => { s.repos["o/r"] = { providers: [], artifacts: ["src/app.js"], head: null, last_scan: null, prs: {} }; },
    "an excerpt smuggled into a string": (s) => { s.repos["o/r"] = { providers: ["openai"], artifacts: [], head: "x".repeat(400), last_scan: null, prs: {} }; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const state = emptyState();
    mutate(state);
    let threw = false;
    try {
      assertPrivate(state);
    } catch {
      threw = true;
    }
    check(`refuses to persist ${name}`, threw);
  }
}

{
  const dir = mkdtempSync(path.join(tmpdir(), "driftcite-state-"));
  const file = path.join(dir, "state.json");
  const state = emptyState();
  state.repos["octo/app"] = {
    providers: ["openai"], artifacts: ["openai/model_id/text-davinci-003"],
    head: "abc", last_scan: "2026-08-05", prs: {},
  };
  await saveState(file, state);
  const back = await loadState(file);
  check("state survives a round trip",
    back.repos["octo/app"].artifacts[0] === "openai/model_id/text-davinci-003");
  check("a missing state file starts empty",
    (await loadState(path.join(dir, "absent.json"))).state_version === 1);
  rmSync(dir, { recursive: true, force: true });
}

{
  // A later sweep that finds the branch already on the remote returns an
  // entry with no PR record of its own. Folding it into the old entry must
  // keep the remembered PR, or the state forgets it ever opened one.
  const prev = {
    providers: ["openai"], artifacts: [], head: "old", last_scan: "2026-08-01",
    prs: { "driftcite/2026-08-01": { opened_on: "2026-08-01", url: "https://x/1" } },
  };
  const fresh = {
    providers: ["openai"], artifacts: [], head: "new", last_scan: "2026-08-05",
    prs: { "driftcite/2026-08-05": { opened_on: "2026-08-05", url: "https://x/2" } },
  };
  const merged = carryPrs(prev, fresh);
  check("a new sweep keeps the prs already remembered",
    merged.prs["driftcite/2026-08-01"]?.url === "https://x/1" &&
    merged.prs["driftcite/2026-08-05"]?.url === "https://x/2");
  check("everything else comes from the fresh scan", merged.head === "new");
  check("the first sweep of a repo has nothing to carry",
    carryPrs(undefined, fresh).prs["driftcite/2026-08-05"]?.url === "https://x/2");
  check("a repo that swept cleanly is no longer marked failed",
    carryPrs({ ...prev, failed_on: "2026-08-04" }, fresh).failed_on === undefined);
}

{
  // A repository whose sweep threw keeps everything the last good sweep
  // learned and gains the day it failed. The day is the whole record: the
  // error message is written by someone else's git or scanner and can carry
  // a path out of their repository, so it goes to the console, never here.
  const prev = {
    providers: ["openai"], artifacts: ["openai/model_id/text-davinci-003"],
    head: "abc", last_scan: "2026-08-01",
    prs: { "driftcite/2026-08-01": { opened_on: "2026-08-01", url: "https://x/1" } },
  };
  const failed = markFailed(prev, "2026-08-06");
  check("a failed sweep keeps the fingerprint the last good one wrote",
    failed.head === "abc" && failed.artifacts.length === 1 &&
    failed.prs["driftcite/2026-08-01"]?.url === "https://x/1");
  check("a failed sweep records the day and nothing else about the failure",
    failed.failed_on === "2026-08-06" &&
    Object.keys(failed).sort().join(",") ===
      "artifacts,failed_on,head,last_scan,providers,prs");

  const fresh = markFailed(undefined, "2026-08-06");
  check("a repo that was never scanned can still be recorded as failed",
    fresh.failed_on === "2026-08-06" && fresh.head === null);

  const state = emptyState();
  state.repos["octo/app"] = failed;
  let ok = true;
  try {
    assertPrivate(state);
  } catch {
    ok = false;
  }
  check("the failure record passes the privacy allowlist", ok);

  // The date is the only shape allowed through. A message pasted in here
  // would arrive with the newlines of a stack trace or a git diff.
  const smuggled = emptyState();
  smuggled.repos["octo/app"] = {
    ...markFailed(prev, "fatal: could not read src/app.js\n  at clone (git)"),
  };
  let threw = false;
  try {
    assertPrivate(smuggled);
  } catch {
    threw = true;
  }
  check("refuses to persist an error message as the failure record", threw);
}

console.log("\nearning the clone");

{
  const feed = {
    artifacts: [
      { id: "openai/model_id/a", provider: "openai" },
      { id: "stripe/endpoint/b", provider: "stripe" },
      { id: "openai/model_id/c", provider: "openai" },
    ],
  };
  const snap = feedSnapshot(feed);
  check("snapshot groups artifact ids by provider",
    snap.openai.length === 2 && snap.stripe.length === 1);
  check("snapshot is sorted so equality is comparable",
    snap.openai[0] === "openai/model_id/a" && snap.openai[1] === "openai/model_id/c");

  const moved = feedDelta(snap, {
    openai: ["openai/model_id/a", "openai/model_id/c", "openai/model_id/NEW"],
    stripe: ["stripe/endpoint/b"],
  });
  check("delta names the provider that moved",
    moved.has("openai") && !moved.has("stripe"));
  check("a provider seen for the first time counts as moved",
    feedDelta({}, { groq: ["groq/model_id/x"] }).has("groq"));
}

{
  const entry = {
    providers: ["openai"], artifacts: [], head: "abc", last_scan: "2026-08-01", prs: {},
  };
  check("a repo never seen is scanned",
    planRepo(undefined, { head: "abc", delta: new Set(), full: false }).scan === true);
  check("a moved head is scanned",
    planRepo(entry, { head: "def", delta: new Set(), full: false }).scan === true);
  check("drift in a provider the repo touches is scanned",
    planRepo(entry, { head: "abc", delta: new Set(["openai"]), full: false }).scan === true);
  const skip = planRepo(entry, { head: "abc", delta: new Set(["stripe"]), full: false });
  check("unrelated drift and unchanged code is skipped", skip.scan === false);
  check("the skip says why", typeof skip.reason === "string" && skip.reason.length > 0);
  check("--full scans everything regardless",
    planRepo(entry, { head: "abc", delta: new Set(), full: true }).scan === true);

  // The head and the providers on a failed entry are the ones from the last
  // sweep that finished, so every other question here answers "nothing
  // moved" about a repository nobody managed to look at.
  const retry = planRepo({ ...entry, failed_on: "2026-08-05" },
    { head: "abc", delta: new Set(), full: false });
  check("a repo whose last sweep failed is scanned again", retry.scan === true);
  check("the retry says which day it is retrying", retry.reason.includes("2026-08-05"));
}

console.log("\npull request rules");

{
  check("branch is named for the day", branchName("2026-08-05") === "driftcite/2026-08-05");

  const findings = [
    { artifact: "openai/model_id/text-davinci-003", severity: "breaking", daysLeft: -935,
      evidence: "https://developers.openai.com/api/docs/deprecations" },
    { artifact: "openai/model_id/text-davinci-003", severity: "breaking", daysLeft: -935,
      evidence: "https://developers.openai.com/api/docs/deprecations" },
    { artifact: "stripe/endpoint//v1/x", severity: "warning", evidence: "https://stripe" },
  ];
  const body = prBody(findings);
  check("pr body cites the provider's own page",
    body.includes("https://developers.openai.com/api/docs/deprecations"));
  check("pr body lists an artifact once however many call sites it has",
    (body.match(/text-davinci-003/g) || []).length === 1);
  check("pr body counts the days since death", body.includes("935 days"));
  check("pr body leaves warnings out; a PR is for what is broken",
    !body.includes("stripe/endpoint//v1/x"));
  check("pr body says how to make it stop", /uninstall/i.test(body));
}

{
  // The branch name carries the day it was opened, so asking the remote for
  // today's name found nothing every morning after and the same repository
  // collected a fresh identical PR each day the feed moved. The prefix is
  // the part of the name that does not move, so it is the part to ask about.
  const heads = [
    "5df9627e3afc30e1149cde8efad9a72af05f9a51\trefs/heads/main",
    "e0f7006276ea5779f2cce69b09e0ceb25023e506\trefs/heads/driftcite/2026-08-05",
  ].join("\n");
  check("a branch opened on another day is still ours",
    existingBranch(heads) === "driftcite/2026-08-05");
  check("a remote with only their branches is untouched by us",
    existingBranch("abc\trefs/heads/main\ndef\trefs/heads/renovate/lodash-4.x\n") === null);
  check("a remote with no branches at all", existingBranch("") === null);
  // Someone else's branch that merely starts with the word is not ours; the
  // separator is what makes it a namespace.
  check("only the driftcite/ namespace counts as ours",
    existingBranch("abc\trefs/heads/driftcite-notes\n") === null);
}

{
  const { allowed, refused } = splitWorkflowEdits([
    "src/models.py",
    ".github/workflows/ci.yml",
    "lib/deep/.github/workflows/x.yml",
  ]);
  check("source edits pass the workflows guard", allowed.includes("src/models.py"));
  check("workflow files are refused, we do not hold that scope",
    refused.includes(".github/workflows/ci.yml"));
  check("only the repo root .github counts as a workflow dir",
    allowed.includes("lib/deep/.github/workflows/x.yml"));
}

console.log("\na sweep, end to end");

function shell(cwd, ...args) {
  return execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8" }).trim();
}

function makeOrigin(files) {
  const root = mkdtempSync(path.join(tmpdir(), "driftcite-sweep-"));
  const origin = path.join(root, "origin.git");
  const work = path.join(root, "seed");
  mkdirSync(work);
  shell(root, "git", "init", "--bare", "-b", "main", origin);
  shell(root, "git", "init", "-b", "main", work);
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(work, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  shell(work, "git", "add", "-A");
  shell(work, "git", "-c", "user.name=seed", "-c", "user.email=seed@x", "commit", "-qm", "seed");
  shell(work, "git", "push", "-q", origin, "main");
  return { root, origin };
}

function fakeApi() {
  const created = [];
  const api = async (token, method, url, body) => {
    if (method === "POST" && /\/pulls$/.test(url)) {
      created.push({ url, body });
      return { html_url: `https://github.example/pr/${created.length}` };
    }
    throw new Error(`unexpected api call: ${method} ${url}`);
  };
  return { api, created };
}

{
  const { root, origin } = makeOrigin({
    "app.js": "const m = 'text-davinci-003';\n",
    ".github/workflows/ci.yml": "run: use 'text-davinci-003' # openai\n",
  });
  const gh = fakeApi();
  const repo = { fullName: "octo/app", cloneUrl: origin, defaultBranch: "main" };

  // Dry run first: it must describe everything and touch nothing.
  const dry = await sweepRepo({
    repo, api: gh.api, token: "tok", cliPath: CLI,
    today: "2026-08-05", live: false,
  });
  check("dry run says it would open a pr", dry.action === "would-open-pr");
  check("dry run pushed nothing",
    shell(root, "git", "ls-remote", "--heads", origin).split("\n").length === 1);
  check("dry run opened nothing", gh.created.length === 0);

  const out = await sweepRepo({
    repo, api: gh.api, token: "tok", cliPath: CLI,
    today: "2026-08-05", live: true,
  });
  check("live run opens exactly one pr", out.action === "opened-pr" && gh.created.length === 1);
  check("the pr goes to the right repo and branch",
    gh.created[0]?.url === "/repos/octo/app/pulls" &&
    gh.created[0]?.body.head === "driftcite/2026-08-05" &&
    gh.created[0]?.body.base === "main");
  check("the pr title matches the workflow's", gh.created[0]?.body.title === PR_TITLE);
  check("the pr body carries the evidence url",
    /developers\.openai\.com/.test(gh.created[0]?.body.body || ""));

  const fixed = shell(root, "git", "--git-dir", origin, "show",
    "driftcite/2026-08-05:app.js");
  check("the pushed branch carries the provider-named fix",
    fixed.includes("gpt-5.6-terra") && !fixed.includes("text-davinci-003"));

  // The scanner never descends into dot-directories, so nothing under
  // .github/ can be edited by our own fix path; splitWorkflowEdits is the
  // tripwire in case that ever changes. The branch must carry it untouched.
  const wf = shell(root, "git", "--git-dir", origin, "show",
    "driftcite/2026-08-05:.github/workflows/ci.yml");
  check("the pushed branch never touches workflow files",
    wf.includes("text-davinci-003"));

  check("the fingerprint is artifact ids, never paths",
    out.entry.artifacts.includes("openai/model_id/text-davinci-003") &&
    JSON.stringify(out.entry).includes("app.js") === false);
  check("the fingerprint records the head it scanned",
    /^[0-9a-f]{40}$/.test(out.entry.head || ""));
  check("the pr is remembered against its branch",
    out.entry.prs["driftcite/2026-08-05"]?.url === "https://github.example/pr/1");

  // Run again the same day: the branch exists, so the PR is left alone.
  const again = await sweepRepo({
    repo, api: gh.api, token: "tok", cliPath: CLI,
    today: "2026-08-05", live: true,
  });
  check("an existing branch means the pr is left alone",
    again.action === "left-alone" && gh.created.length === 1);

  rmSync(root, { recursive: true, force: true });
}

{
  // The same repository, the next day, and the day after. The feed moves and
  // the sweep runs again; the fix is the same fix and the diff is the same
  // diff, so the second PR is not a second problem, it is spam. This is the
  // one that was broken: the branch carries the day in its name, and the
  // check for "have we been here" asked only for today's name.
  const { root, origin } = makeOrigin({ "app.js": "const m = 'text-davinci-003';\n" });
  const gh = fakeApi();
  const repo = { fullName: "octo/app", cloneUrl: origin, defaultBranch: "main" };
  const run = (today, live = true) =>
    sweepRepo({ repo, api: gh.api, token: "tok", cliPath: CLI, today, live });

  const first = await run("2026-08-05");
  const nextDay = await run("2026-08-06");
  const dayAfter = await run("2026-08-07");
  check("the first day opens the pull request", first.action === "opened-pr");
  check("a later sweep opens no second pr for the same repo",
    nextDay.action === "left-alone" && dayAfter.action === "left-alone" &&
    gh.created.length === 1);
  check("the repo left alone names the branch that is already open",
    nextDay.branch === "driftcite/2026-08-05");
  check("no second branch was pushed either",
    shell(root, "git", "ls-remote", "--heads", origin).split("\n").length === 2);

  // The dry run takes the same decision, so what it prints is what a live
  // run would do rather than a PR it would have opened.
  const dry = await run("2026-08-08", false);
  check("a dry run on a later day leaves it alone too", dry.action === "left-alone");

  rmSync(root, { recursive: true, force: true });
}

{
  // A repository with nothing broken produces a fingerprint and no PR.
  const { root, origin } = makeOrigin({ "clean.js": "export const hi = 1;\n" });
  const gh = fakeApi();
  const out = await sweepRepo({
    repo: { fullName: "octo/clean", cloneUrl: origin, defaultBranch: "main" },
    api: gh.api, token: "tok", cliPath: CLI, today: "2026-08-05", live: true,
  });
  check("a clean repo is recorded and left in peace",
    out.action === "clean" && gh.created.length === 0 && out.entry.artifacts.length === 0);
  rmSync(root, { recursive: true, force: true });
}

{
  // Breaking findings whose replacement the provider never named: report,
  // do not push, do not open.
  const { root, origin } = makeOrigin({
    "billing.js": "// stripe\nconst url = \"/v1/invoices/upcoming\";\n",
  });
  const gh = fakeApi();
  const out = await sweepRepo({
    repo: { fullName: "octo/manual", cloneUrl: origin, defaultBranch: "main" },
    api: gh.api, token: "tok", cliPath: CLI, today: "2026-08-05", live: true,
  });
  check("nothing auto-fixable means a report, never a pr",
    out.action === "needs-human" && gh.created.length === 0);
  check("the untouched repo gained no branches",
    shell(root, "git", "ls-remote", "--heads", origin).split("\n").length === 1);
  rmSync(root, { recursive: true, force: true });
}

console.log("\none repository cannot end the sweep");

const repoRecord = (name) => ({
  full_name: name,
  default_branch: "main",
  clone_url: `https://github.example/${name}.git`,
});

{
  // The state file is written once, at the end of the run. One repository
  // throwing used to take the process with it, so everything learned about
  // every repository swept before it went too and the next run re-cloned all
  // of them. Two ways to fail are covered here: the API call that earns the
  // clone, and the sweep itself.
  const state = emptyState();
  const known = { providers: ["openai"], artifacts: [], head: "old", last_scan: "2026-08-01", prs: {} };
  state.repos["octo/first"] = { ...known };
  state.repos["octo/blip"] = { ...known };

  const api = async (token, method, url) => {
    if (url.includes("octo/blip")) {
      throw new Error("GitHub 403 on GET /repos/octo/blip/branches/main: not accessible");
    }
    if (method === "GET" && url.includes("/branches/")) return { commit: { sha: "new" } };
    throw new Error(`unexpected api call: ${method} ${url}`);
  };
  const swept = [];
  const lines = [];
  const { counts, failures } = await runSweep({
    state, today: "2026-08-06", live: true, full: false, delta: new Set(),
    api, installations: [{ id: 1 }], jwt: () => "jwt",
    mintToken: async () => "tok",
    repos: async () => ["octo/first", "octo/blip", "octo/boom", "octo/last"].map(repoRecord),
    sweep: async ({ repo }) => {
      swept.push(repo.fullName);
      if (repo.fullName === "octo/boom") {
        throw new Error(
          "fatal: could not read from remote repository\n" +
          "please make sure you have the correct access rights");
      }
      return {
        action: "clean",
        entry: { providers: ["openai"], artifacts: [], head: "new", last_scan: "2026-08-06", prs: {} },
      };
    },
    log: (l) => lines.push(l),
  });

  check("the sweep carries on past the repository that threw",
    swept.includes("octo/last") && counts.clean === 2);
  check("both kinds of failure are counted, neither is fatal", counts.failed === 2);
  check("state written before the failure survives it",
    state.repos["octo/first"].last_scan === "2026-08-06");
  check("a repository swept after the failure is recorded too",
    state.repos["octo/last"].last_scan === "2026-08-06");
  check("the failing repositories are named in the output",
    failures.map((f) => f.name).sort().join(",") === "octo/blip,octo/boom" &&
    lines.some((l) => l.includes("failed") && l.includes("octo/boom")));
  check("a repository that failed is recorded as failed",
    state.repos["octo/boom"].failed_on === "2026-08-06" &&
    state.repos["octo/blip"].failed_on === "2026-08-06");
  check("the failed repository keeps what the last good sweep knew",
    state.repos["octo/blip"].head === "old" &&
    state.repos["octo/blip"].last_scan === "2026-08-01");
  check("the whole state is still something we are allowed to write",
    (() => { try { assertPrivate(state); return true; } catch { return false; } })());
  // The message is written by someone else's git; one capped line of it goes
  // to the operator's console and none of it goes to the state file.
  check("only the first line of the error reaches the log",
    !lines.join("\n").includes("correct access rights") &&
    !JSON.stringify(state).includes("could not read"));
  check("a repository that failed is scanned again next sweep, quiet or not",
    planRepo(state.repos["octo/blip"], { head: "old", delta: new Set(), full: false }).scan === true);
}

{
  // A whole installation can fail: the grant revoked, the install suspended,
  // the token endpoint having a moment. That is one customer's outage and it
  // used to be every customer's.
  const state = emptyState();
  const { counts, failures } = await runSweep({
    state, today: "2026-08-06", live: true, full: false, delta: new Set(),
    api: async (t, m, url) => { throw new Error(`unexpected api call: ${m} ${url}`); },
    installations: [{ id: 11 }, { id: 22 }],
    jwt: () => "jwt",
    mintToken: async (api, jwt, id) => {
      if (id === 11) throw new Error("GitHub 401 on POST /app/installations/11/access_tokens");
      return "tok";
    },
    repos: async () => [repoRecord("octo/ok")],
    sweep: async () => ({
      action: "clean",
      entry: { providers: [], artifacts: [], head: "new", last_scan: "2026-08-06", prs: {} },
    }),
    log: () => {},
  });
  check("an installation that cannot be reached is one failure, not all of them",
    counts.failed === 1 && counts.clean === 1);
  check("the unreachable installation is named too",
    failures[0]?.name === "installation 11");
  check("the next installation is still swept",
    state.repos["octo/ok"]?.last_scan === "2026-08-06");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
