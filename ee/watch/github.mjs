/**
 * GitHub, from an App's point of view: sign the App JWT, trade it for
 * installation tokens, and call the REST API without tripping the limits
 * that get bots banned. Zero dependencies, like everything else here.
 *
 * Every function takes its effects (fetch, sleep, clock) as arguments so the
 * tests can run a full conversation with no network and no real App.
 */

import crypto from "node:crypto";

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

export function appJwt({ appId, privateKey, now = Date.now() }) {
  const sec = Math.floor(now / 1000);
  const header = b64url({ alg: "RS256", typ: "JWT" });
  // Backdated a minute because GitHub rejects a token issued "in the future"
  // and their clock is the one that counts; nine minutes of life stays clear
  // of their ten-minute cap for the same reason.
  const payload = b64url({ iss: String(appId), iat: sec - 60, exp: sec + 540 });
  const sig = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKey)
    .toString("base64url");
  return `${header}.${payload}.${sig}`;
}

const BASE = "https://api.github.com";
const LINK = Symbol("link header");

/**
 * The retry policy is the queue discipline from DESIGN.md:
 *
 *   Retry-After present        sleep exactly that, then retry. This is the
 *                              secondary limit, and honouring it is what
 *                              paces the 500 content-creating requests/hour.
 *   primary window exhausted   sleep until x-ratelimit-reset, plus a beat.
 *   5xx                        brief linear backoff; the API was having a day.
 *   anything else              an answer, not an invitation. Throw at once,
 *                              so a 404 or a 422 never burns five retries.
 */
export function makeApi({
  fetch = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => Date.now(),
  maxRetries = 5,
} = {}) {
  return async function api(token, method, url, body) {
    const full = url.startsWith("http") ? url : BASE + url;
    let res;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      res = await fetch(full, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "user-agent": "driftcite-watch",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.ok) {
        if (res.status === 204) return null;
        const data = await res.json();
        if (data && typeof data === "object") {
          Object.defineProperty(data, LINK, { value: res.headers.get("link") });
        }
        return data;
      }

      const limited = res.status === 403 || res.status === 429;
      const retryAfter = res.headers.get("retry-after");
      if (limited && retryAfter) {
        await sleep(Number(retryAfter) * 1000);
        continue;
      }
      if (limited && res.headers.get("x-ratelimit-remaining") === "0") {
        const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
        await sleep(Math.max(reset - now(), 0) + 2000);
        continue;
      }
      if (res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      break;
    }

    const detail = await res.text().catch(() => "");
    const err = new Error(`GitHub ${res.status} on ${method} ${url}: ${detail.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  };
}

const nextLink = (link) => /<([^>]+)>;\s*rel="next"/.exec(link || "")?.[1] ?? null;

export async function paginate(api, token, url, pick = (page) => page) {
  const all = [];
  for (let next = url; next; ) {
    const page = await api(token, "GET", next);
    all.push(...pick(page));
    next = nextLink(page?.[LINK]);
  }
  return all;
}

export const installationToken = async (api, jwt, installationId) =>
  (await api(jwt, "POST", `/app/installations/${installationId}/access_tokens`)).token;

export const listInstallations = (api, jwt) =>
  paginate(api, jwt, "/app/installations?per_page=100");

export const listRepos = (api, token) =>
  paginate(api, token, "/installation/repositories?per_page=100", (p) => p.repositories);
