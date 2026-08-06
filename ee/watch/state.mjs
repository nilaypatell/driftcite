/**
 * The fingerprint store, and the allowlist that keeps it honest.
 *
 * The README's promise is "a few hundred strings, never files". This module
 * is where that promise is enforced rather than remembered: every save walks
 * the state against a strict shape, and anything outside it — a findings
 * array, a file path posing as an artifact id, an excerpt smuggled into a
 * string — refuses to serialise. A future edit that tries to persist source
 * fails a test here instead of shipping.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const emptyState = () => ({
  state_version: 1,
  last_sweep: null,
  feed_snapshot: {},
  repos: {},
});

// Long enough for any artifact id or URL, far too short for a line of code.
const MAX_STR = 300;
const str = (v) => typeof v === "string" && !v.includes("\n") && v.length <= MAX_STR;
const strOrNull = (v) => v === null || str(v);
const strArray = (v) => Array.isArray(v) && v.every(str);
// provider/kind/name: three segments minimum. A file path has fewer, and a
// path deep enough to fake it still fails the scan below for looking nothing
// like the feed. This is a tripwire, not cryptography.
const artifactId = (v) => str(v) && /^[^/\s]+\/[^/\s]+\/.+$/.test(v);

function refuse(where) {
  throw new Error(`state refuses to persist: ${where}`);
}

export function assertPrivate(state) {
  const TOP = new Set(["state_version", "last_sweep", "feed_snapshot", "repos"]);
  for (const k of Object.keys(state)) if (!TOP.has(k)) refuse(k);
  if (state.state_version !== 1) refuse("state_version");
  if (!strOrNull(state.last_sweep)) refuse("last_sweep");

  for (const [provider, ids] of Object.entries(state.feed_snapshot ?? {})) {
    if (!Array.isArray(ids) || !ids.every(artifactId)) refuse(`feed_snapshot.${provider}`);
  }

  for (const [name, entry] of Object.entries(state.repos ?? {})) {
    const KEYS = new Set(["providers", "artifacts", "head", "last_scan", "failed_on", "prs"]);
    for (const k of Object.keys(entry)) if (!KEYS.has(k)) refuse(`repos[${name}].${k}`);
    if (!strArray(entry.providers)) refuse(`repos[${name}].providers`);
    if (!Array.isArray(entry.artifacts) || !entry.artifacts.every(artifactId)) {
      refuse(`repos[${name}].artifacts`);
    }
    if (!strOrNull(entry.head)) refuse(`repos[${name}].head`);
    if (!strOrNull(entry.last_scan)) refuse(`repos[${name}].last_scan`);
    if (entry.failed_on !== undefined && !strOrNull(entry.failed_on)) {
      refuse(`repos[${name}].failed_on`);
    }
    for (const [branch, pr] of Object.entries(entry.prs ?? {})) {
      const PR = new Set(["opened_on", "url"]);
      for (const k of Object.keys(pr)) if (!PR.has(k)) refuse(`repos[${name}].prs[${branch}].${k}`);
      if (!str(pr.opened_on) || !str(pr.url)) refuse(`repos[${name}].prs[${branch}]`);
    }
  }
  return state;
}

/**
 * Fold a fresh scan's entry into what was already known about the repo.
 * Everything current comes from the fresh scan; the PRs are the exception,
 * because a sweep that finds its branch already on the remote returns no PR
 * record of its own, and forgetting a PR we opened would let a later sweep
 * open it again.
 */
export const carryPrs = (prev, entry) => ({
  ...entry,
  prs: { ...(prev?.prs || {}), ...entry.prs },
});

/**
 * The entry for a repository whose sweep threw: everything the last good
 * sweep learned, plus the day this one failed.
 *
 * The day is the whole record. An error message is the one string here
 * written by someone else's git, lockfile or scanner output, and it can
 * carry a path out of their repository, so it goes to the operator's console
 * and never into this file. What the next sweep needs is only that the
 * attempt did not happen: `planRepo` scans a repository with `failed_on`
 * whether or not its code or its providers moved, because its recorded head
 * is the one from the last sweep that actually completed, and "code
 * unchanged" is true of a repository nobody managed to look at.
 */
export const markFailed = (prev, day) => ({
  providers: prev?.providers ?? [],
  artifacts: prev?.artifacts ?? [],
  head: prev?.head ?? null,
  last_scan: prev?.last_scan ?? null,
  failed_on: day,
  prs: prev?.prs ?? {},
});

export async function loadState(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return emptyState();
  }
}

export async function saveState(file, state) {
  assertPrivate(state);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 1) + "\n", "utf8");
}
