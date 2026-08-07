#!/usr/bin/env node
/**
 * Tests for the notify path and the feed's derived faces (calendar, RSS,
 * changelog). The notify payload and the changelog diff are the two places a
 * quiet bug becomes a loud wrong message in somebody's Slack or calendar, so
 * they get the same regression treatment as match precision.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { __test } from "../bin/driftcite.mjs";
import { updateChangelog, buildIcs, buildRss } from "../scripts/build_feed_extras.mjs";

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

// ------------------------------------------------------------------- notify

console.log("\nslack notify");

const finding = (over = {}) => ({
  file: "app.js", line: 3, artifact: "openai/model_id/text-davinci-003",
  severity: "breaking", status: "retired", retires_on: "2024-01-04",
  replacement: "gpt-5.6-terra", evidence: "https://example.com/deprecations",
  note: "", daysLeft: null, context: "source", excerpt: "",
  ...over,
});

check(
  "no message when nothing breaking",
  __test.slackMessage([finding({ severity: "warning" })], "/tmp/x") === null
);

{
  const msg = __test.slackMessage([finding()], "/repo/checkout");
  check("message names the artifact and the swap",
    msg.includes("openai/model_id/text-davinci-003") && msg.includes("gpt-5.6-terra"));
  check("message carries the evidence link",
    msg.includes("https://example.com/deprecations"));
  check("message names the call site", msg.includes("app.js:3"));
  check("message is titled with the scanned directory's name",
    msg.includes("checkout"));
}

{
  // Two hits on one artifact are one bullet with two call sites, not two
  // bullets: the channel is reading a summary, not the raw findings list.
  const msg = __test.slackMessage(
    [finding(), finding({ file: "worker.py", line: 9 })], "/r");
  check("hits on one artifact collapse into one bullet",
    msg.split("\n").filter((l) => l.startsWith("•")).length === 1
      && msg.includes("app.js:3, worker.py:9"));
}

{
  const many = Array.from({ length: 14 }, (_, i) =>
    finding({ artifact: `p/model_id/m${i}` }));
  const msg = __test.slackMessage(many, "/r");
  check("more than ten artifacts truncate with a count",
    msg.split("\n").filter((l) => l.startsWith("•")).length === 10
      && msg.includes("4 more artifact(s)"));
}

{
  const msg = __test.slackMessage(
    [finding({ status: "deprecated", retires_on: "2026-10-23" })], "/r");
  check("a deadline still in the future reads as a date, not a status",
    msg.includes("breaks 2026-10-23"));
}

{
  // postSlack against a stubbed fetch: delivery and refusal both surface.
  const realFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, opts) => { sent = { url, opts }; return { ok: true }; };
  await __test.postSlack("https://hooks.example/T/B/x", "hello");
  check("posts the text as a slack payload",
    sent.url === "https://hooks.example/T/B/x"
      && JSON.parse(sent.opts.body).text === "hello");

  globalThis.fetch = async () => ({ ok: false, status: 403 });
  let threw = null;
  try { await __test.postSlack("https://hooks.example/T/B/x", "hello"); }
  catch (err) { threw = err; }
  check("a refused webhook is an error that names the status",
    threw && threw.message.includes("403"));
  globalThis.fetch = realFetch;
}

{
  // --slack with no webhook must fail before scanning, loudly.
  let code = 0, stderr = "";
  try {
    execFileSync("node", [CLI, ".", "--slack", "--offline", "--no-deps"], {
      encoding: "utf8",
      env: { ...process.env, DRIFTCITE_SLACK_WEBHOOK: "" },
    });
  } catch (err) {
    code = err.status;
    stderr = err.stderr || "";
  }
  check("--slack without DRIFTCITE_SLACK_WEBHOOK exits 2 and says why",
    code === 2 && stderr.includes("DRIFTCITE_SLACK_WEBHOOK"));
}

// ---------------------------------------------------------------- changelog

console.log("\nchangelog");

const art = (over = {}) => ({
  id: "openai/model_id/gpt-4-turbo", kind: "model_id",
  match: { literals: ["gpt-4-turbo"] }, status: "deprecated",
  retires_on: "2026-10-23", replacement: "gpt-5.6-sol",
  severity: "breaking", note: "Shutdown announced.",
  evidence: "https://example.com/dep", provider: "openai",
  ...over,
});

const feedOf = (...artifacts) => ({
  feed_version: 1, generated_on: "2026-08-07", providers: ["openai"], artifacts,
});

{
  const first = updateChangelog(feedOf(art()), null);
  check("bootstrap records every artifact as appeared",
    first.events.length === 1 && first.events[0].type === "appeared"
      && first.events[0].date === "2026-08-07");

  const again = updateChangelog(feedOf(art()), first);
  check("an unchanged feed adds no events",
    again.events.length === first.events.length);

  const retired = updateChangelog(
    { ...feedOf(art({ status: "retired" })), generated_on: "2026-10-24" }, first);
  check("a status move is recorded with both ends",
    retired.events.some((e) =>
      e.type === "status_changed" && e.from === "deprecated" && e.status === "retired"
      && e.date === "2026-10-24"));

  const slid = updateChangelog(
    { ...feedOf(art({ retires_on: "2026-12-01" })), generated_on: "2026-09-01" }, first);
  check("a provider moving the date is its own event",
    slid.events.some((e) =>
      e.type === "date_changed" && e.from === "2026-10-23" && e.to === "2026-12-01"));

  const gone = updateChangelog(
    { ...feedOf(), generated_on: "2026-09-01" }, first);
  check("an artifact leaving the feed is recorded, not forgotten",
    gone.events.some((e) => e.type === "withdrawn"));
}

// ----------------------------------------------------------------- calendar

console.log("\ncalendar");

{
  const ics = buildIcs(feedOf(
    art(),
    art({ id: "openai/model_id/undated", retires_on: undefined }),
  ));
  check("only dated artifacts become events",
    (ics.match(/BEGIN:VEVENT/g) || []).length === 1);
  check("the event is all-day on the retirement date",
    ics.includes("DTSTART;VALUE=DATE:20261023")
      && ics.includes("DTEND;VALUE=DATE:20261024"));
  check("the summary names provider and artifact in plain words",
    ics.includes("SUMMARY:openai: gpt-4-turbo shuts down"));
  check("the description carries the replacement and the evidence",
    ics.includes("Use instead: gpt-5.6-sol") && ics.includes("URL:https://example.com/dep"));
  check("every line folds within 75 octets",
    ics.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75));
  check("a retired artifact reads in the past tense",
    buildIcs(feedOf(art({ status: "retired" }))).includes("shut down"));
}

{
  const long = art({ note: "x".repeat(300) + ", with; special\nchars" });
  const ics = buildIcs(feedOf(long));
  check("long descriptions fold and special characters are escaped",
    ics.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75)
      && ics.includes("\\, with\\; special"));
}

// ---------------------------------------------------------------------- rss

console.log("\nrss");

{
  const feed = feedOf(art());
  const log = updateChangelog(feed, null);
  const rss = buildRss(log, feed);
  check("one event is one item with the evidence as its link",
    (rss.match(/<item>/g) || []).length === 1
      && rss.includes("<link>https://example.com/dep</link>"));
  check("the item title is the artifact and its status",
    rss.includes("<title>openai/model_id/gpt-4-turbo — deprecated</title>"));
  check("pubDate is the event date in RFC 1123",
    rss.includes("<pubDate>Fri, 07 Aug 2026 00:00:00 GMT</pubDate>"));
}

{
  const feed = feedOf(art({ note: 'needs <escaping> & "quotes"' }));
  const rss = buildRss(updateChangelog(feed, null), feed);
  check("descriptions are XML-escaped",
    rss.includes("needs &lt;escaping&gt; &amp; &quot;quotes&quot;"));
}

{
  const arts = Array.from({ length: 120 }, (_, i) => art({ id: `p/model_id/m${i}` }));
  const feed = feedOf(...arts);
  const rss = buildRss(updateChangelog(feed, null), feed);
  check("the feed caps at 100 items",
    (rss.match(/<item>/g) || []).length === 100);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
