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
import { emptyState, assertPrivate, loadState, saveState, carryPrs } from "../ee/watch/state.mjs";
import { feedSnapshot, feedDelta, planRepo } from "../ee/watch/plan.mjs";
import { branchName, prBody, splitWorkflowEdits, PR_TITLE } from "../ee/watch/pr.mjs";
import { sweepRepo } from "../ee/watch/sweep.mjs";

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
    fixed.includes("gpt-3.5-turbo-instruct") && !fixed.includes("text-davinci-003"));

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

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
