#!/usr/bin/env node
/**
 * Build the feed's two subscribable faces from feed.json:
 *
 *   feed/calendar.ics — every artifact with a retirement date, as an all-day
 *   calendar event. Subscribe once and every provider-announced shutdown sits
 *   in your calendar next to your own meetings.
 *
 *   feed/changes.xml — an RSS feed of drift events: an artifact appearing,
 *   a status moving (deprecated → retired), or a provider moving a shutdown
 *   date. Date moves are a first-class event because they really happen —
 *   Vercel's legacy build image and Firebase's Imagen retirement both slid —
 *   and a subscriber who planned around the old date needs the move more
 *   than the original announcement.
 *
 * Change detection needs yesterday's state, which lives in
 * feed/changelog.json beside the events it produced. The whole file derives
 * from feed.json plus its own previous run; there is no clock in here.
 * Every date is feed.json's generated_on, so rerunning against an unchanged
 * feed rewrites every byte identically and the sweep's "nothing moved today"
 * check stays honest.
 *
 * Zero dependencies, same reason as the CLI: this runs unattended and its
 * output is served to strangers, so it should be auditable in one sitting.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FEED = path.join(HERE, "..", "feed", "feed.json");
const CHANGELOG = path.join(HERE, "..", "feed", "changelog.json");
const ICS = path.join(HERE, "..", "feed", "calendar.ics");
const RSS = path.join(HERE, "..", "feed", "changes.xml");

const REPO_URL = "https://github.com/nilaypatell/driftcite";
const RSS_ITEM_CAP = 100;

// ----------------------------------------------------------------- changelog

/**
 * Diff the feed against the state the last run recorded and return the new
 * events plus the state to record now. An artifact leaving the feed is an
 * event too ("withdrawn"): the two precision rules have deleted artifacts
 * before, and a feed that forgets it ever said something is not citable.
 */
export function updateChangelog(feed, prev) {
  const today = feed.generated_on;
  const state = prev?.state ?? {};
  const events = [...(prev?.events ?? [])];
  const nextState = {};
  const seen = new Set();

  for (const art of feed.artifacts) {
    seen.add(art.id);
    nextState[art.id] = { status: art.status, retires_on: art.retires_on ?? null };
    const before = state[art.id];
    if (!before) {
      events.push({ date: today, id: art.id, type: "appeared", status: art.status });
      continue;
    }
    if (before.status !== art.status) {
      events.push({
        date: today, id: art.id, type: "status_changed",
        from: before.status, status: art.status,
      });
    }
    const was = before.retires_on ?? null;
    const now = art.retires_on ?? null;
    if (was !== now && (was || now)) {
      events.push({
        date: today, id: art.id, type: "date_changed", from: was, to: now,
      });
    }
  }

  for (const id of Object.keys(state)) {
    if (!seen.has(id)) {
      events.push({ date: today, id, type: "withdrawn", status: state[id].status });
    }
  }

  return {
    note: "Appended by scripts/build_feed_extras.mjs on each sweep. "
        + "state is the last-seen shape per artifact; events is every change "
        + "since this file began. changes.xml is built from events.",
    state: nextState,
    events,
  };
}

// ----------------------------------------------------------------- calendar

const escapeIcs = (s) =>
  String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

/** RFC 5545 folds at 75 octets, continuation lines start with a space. */
function fold(line) {
  const out = [];
  let rest = line;
  let width = 75;
  while (Buffer.byteLength(rest, "utf8") > width) {
    let cut = width;
    while (cut > 1 && Buffer.byteLength(rest.slice(0, cut), "utf8") > width) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
    width = 74;
  }
  out.push(rest);
  return out.join("\r\n");
}

const dayAfter = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function buildIcs(feed) {
  const dated = feed.artifacts
    .filter((a) => a.retires_on)
    .sort((a, b) =>
      a.retires_on === b.retires_on
        ? a.id.localeCompare(b.id)
        : a.retires_on.localeCompare(b.retires_on));

  const stamp = `${feed.generated_on.replace(/-/g, "")}T000000Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//driftcite//feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:driftcite — API shutdowns",
    "X-WR-CALDESC:Every event is a provider-announced API shutdown\\, with the "
      + "provider's own page as the source. Built from feed.json; nothing here "
      + "is a guess.",
  ];

  for (const art of dated) {
    // id is provider/kind/rest; the rest is what a human recognises.
    const rest = art.id.split("/").slice(2).join("/");
    const verb = art.status === "deprecated" ? "shuts down" : "shut down";
    const desc = [
      art.note,
      art.replacement ? `Use instead: ${art.replacement}` : null,
      art.evidence ? `Evidence: ${art.evidence}` : null,
    ].filter(Boolean).join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(art.id)}@driftcite`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${art.retires_on.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${dayAfter(art.retires_on).replace(/-/g, "")}`,
      `SUMMARY:${escapeIcs(`${art.provider}: ${rest} ${verb}`)}`,
      `DESCRIPTION:${escapeIcs(desc)}`,
      ...(art.evidence ? [`URL:${escapeIcs(art.evidence)}`] : []),
      `CATEGORIES:${escapeIcs(art.provider)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------- rss

const escapeXml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const rfc1123 = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, "0")} `
       + `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} 00:00:00 GMT`;
};

function itemTitle(ev) {
  switch (ev.type) {
    case "appeared": return `${ev.id} — ${ev.status}`;
    case "status_changed": return `${ev.id} — ${ev.from} → ${ev.status}`;
    case "date_changed":
      return `${ev.id} — retirement moved ${ev.from ?? "unset"} → ${ev.to ?? "unset"}`;
    case "withdrawn": return `${ev.id} — withdrawn from the feed`;
    default: return `${ev.id} — ${ev.type}`;
  }
}

export function buildRss(changelog, feed) {
  const byId = new Map(feed.artifacts.map((a) => [a.id, a]));
  // Newest first; within a day, keep append order so related events read in
  // the order they were detected.
  const items = [...changelog.events]
    .map((ev, i) => ({ ev, i }))
    .sort((a, b) => b.ev.date.localeCompare(a.ev.date) || b.i - a.i)
    .slice(0, RSS_ITEM_CAP);

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0">`,
    `<channel>`,
    `<title>driftcite — provider drift</title>`,
    `<link>${REPO_URL}</link>`,
    `<description>Third-party API surface dying, as the providers announce it. `
      + `Every entry cites the provider's own page.</description>`,
    `<lastBuildDate>${rfc1123(feed.generated_on)}</lastBuildDate>`,
  ];

  for (const { ev } of items) {
    const art = byId.get(ev.id);
    const desc = art
      ? [art.note, art.replacement ? `Use instead: ${art.replacement}` : null]
          .filter(Boolean).join(" ")
      : "No longer in the feed.";
    xml.push(
      `<item>`,
      `<title>${escapeXml(itemTitle(ev))}</title>`,
      `<link>${escapeXml(art?.evidence || REPO_URL)}</link>`,
      `<guid isPermaLink="false">${escapeXml(`${ev.id}|${ev.type}|${ev.date}`)}</guid>`,
      `<pubDate>${rfc1123(ev.date)}</pubDate>`,
      `<description>${escapeXml(desc)}</description>`,
      `</item>`,
    );
  }

  xml.push(`</channel>`, `</rss>`);
  return xml.join("\n") + "\n";
}

// --------------------------------------------------------------------- main

async function main() {
  const feed = JSON.parse(await readFile(FEED, "utf8"));
  let prev = null;
  try {
    prev = JSON.parse(await readFile(CHANGELOG, "utf8"));
  } catch {
    // First run: every current artifact becomes an "appeared" event dated
    // generated_on. That is an honest description of the bootstrap.
  }

  const changelog = updateChangelog(feed, prev);
  await writeFile(CHANGELOG, JSON.stringify(changelog, null, 1) + "\n");
  await writeFile(ICS, buildIcs(feed));
  await writeFile(RSS, buildRss(changelog, feed));

  const fresh = changelog.events.length - (prev?.events.length ?? 0);
  console.log(
    `feed extras: ${fresh} new event(s), `
    + `${feed.artifacts.filter((a) => a.retires_on).length} calendar event(s)`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`build_feed_extras: ${err.message}`);
    process.exitCode = 1;
  });
}
