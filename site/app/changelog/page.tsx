import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import type { ReactNode } from "react";
import { Column } from "@/components/primitives";
import { CORPUS, LINKS, PRECISION, TOTAL_ARTIFACTS } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = pageMeta({
  path: "/changelog",
  title: "Changelog",
  description:
    "Releases of the driftcite scanner, Action and GitHub App — what changed, and when. The drift manifests are a separate record, regenerated daily.",
});

/** Inline code, the handoff's treatment: mono, 0.92em of its own line. */
function C({ children }: { children: ReactNode }) {
  return (
    <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.92em" }}>
      {children}
    </code>
  );
}

type Release = {
  /** The version in package.json when this work landed. Written without a
   *  leading `v` for consistency across entries; v0.2.0 and v0.2.1 both exist
   *  as tags, and v0.2.0 was tagged after the fact against the commit whose
   *  bin/ is byte-identical to the tarball npm serves. */
  version: string;
  /** ISO date. Used verbatim as the `datetime`, written out for readers. */
  date: string;
  /** What that date actually is, printed under the version. An entry whose
   *  provenance cannot be stated in four words does not belong here. */
  provenance: string;
  /** Pill beside the version. */
  tag: string;
  /** Accent for what npm serves, neutral for what it does not. */
  tone: "accent" | "neutral";
  title: string;
  notes: ReactNode[];
};

/* Two entries, because driftcite has been published twice. Every date
   below is the npm publish record (`npm view driftcite time --json`), never
   a tag date. An earlier version of this page listed seven releases going
   back to April 2026, none of which existed. */
const RELEASES: readonly Release[] = [
  {
    version: "0.2.1",
    date: "2026-08-07",
    provenance: "published to npm",
    tag: "Latest on npm",
    tone: "accent",
    title: "The resellers, the registries, and a feed that watches itself",
    notes: [
      <>
        Published to npm on August 7, 2026. The work below had been landing
        on <C>main</C> since July 27; the date beside it is now the publish
        record, not a commit.
      </>,
      <>
        An unknown flag is now a hard error that names the flag and exits 2.
        0.2.0 accepted <C>--write-baseline</C> before the flag existed,
        printed <C>No drift found.</C> and exited 0 — confident false
        success, the one failure a scanner must not have. Found while
        writing the agent setup prompt, whose instructions would have hit
        exactly that.
      </>,
      <>
        Azure and Bedrock: the two places enterprises actually call these
        models, on retirement clocks their original vendors do not recognise.
        Both are reported only inside files that name the reseller, because
        Azure retires <C>gpt-4o</C> on a date OpenAI does not, and a right
        answer given to the wrong caller is a wrong answer. Azure&#8217;s 42
        artifacts are curated but held out of the published feed until the
        version on npm is one that can read the field that scopes them — 0.2.0
        predates it, and would cite Microsoft&#8217;s dates at people calling
        OpenAI directly.
      </>,
      <>
        Mistral, Cohere, Plaid, Square, Datadog, Adyen and Asana joined the
        watch, each accruing history from the day it landed.{" "}
        {TOTAL_ARTIFACTS} artifacts across nineteen providers in the published
        feed.
      </>,
      <>
        <C>Cargo.lock</C> and <C>Gemfile.lock</C> are read — 0.2.0 could only
        name them as formats it could not. crates.io publishes a yanked flag
        per version, so it reads like npm and PyPI already did. RubyGems
        publishes none: a yanked gem simply stops being served, so the finding
        says exactly that and never claims a maintainer deprecated anything.
      </>,
      <>
        Endpoints are probed for RFC 8594 <C>Sunset</C> headers, and every
        provider&#8217;s live model list is polled — a retirement can now be
        recorded because the ID stopped being served, not only because a page
        said so. Providers without a configured key are skipped by name.
      </>,
      <>
        Precision, twice. A parameter named <C>body</C>, dropped from 134
        Square operations, would have matched <C>body:</C> in nearly every
        JavaScript file that ever called fetch; parameters now face the
        distinctiveness test enum values always have. And a nullable enum is
        not a mass retirement — reading one as such had published seven of
        Plaid&#8217;s live repayment plans as removed and breaking.
      </>,
      <>
        <C>--write-baseline</C> and <C>.driftciteignore</C>, so a codebase with
        day-one drift can adopt the check without a build that fails forever.
        Suppressed findings are counted and reported as suppressed.
      </>,
      <>
        The corpus study: {CORPUS.scanned} public repositories scanned in July
        2026 — {CORPUS.sharePct}% call at least one API that is already dead.
        Methodology and per-provider counts in <C>corpus/</C>.
      </>,
      <>
        <C>driftcite-autofix.yml</C> and the hosted watch: the same cited pull
        request, opened either from inside your own CI or by our sweep.{" "}
        <a
          target="_blank"
          rel="noopener"
          href={LINKS.pr}
          style={{ color: "var(--color-accent-700)" }}
        >
          The first one it opened
        </a>{" "}
        is public.
      </>,
    ],
  },
  {
    version: "0.2.0",
    date: "2026-07-27",
    provenance: "published to npm",
    tag: "npm",
    tone: "neutral",
    title: "The only published release",
    notes: [
      <>
        npm recorded the publish at 06:01 UTC on {formatDate("2026-07-27")}.
        It was what <C>npx driftcite</C> installed for eleven days, until
        0.2.1.
      </>,
      <>
        A single-file scanner, <C>bin/driftcite.mjs</C>, with zero runtime
        dependencies. Node 18 or newer, and nothing else.
      </>,
      <>
        Manifests committed in the open, and a feed that accumulates history
        rather than replacing it — the git log is the record of what was
        observed, and when.
      </>,
      <>
        Every artifact kind matches only in the shape it takes when actually
        sent to a provider: quoted literals, object keys, bounded tokens, with
        provider markers gating anything that is also an English word. That
        rework took one real 1,200-dependency repository from{" "}
        {PRECISION.before} findings at roughly 25% true to {PRECISION.after} at
        100%.
      </>,
      <>
        <C>--fix</C> swaps the string the provider retired for the string the
        provider named, inside the quoting your code already uses, and refuses
        when the replacement is prose rather than a drop-in token.
      </>,
      <>
        Lockfiles: <C>package-lock.json</C>, <C>pnpm-lock.yaml</C>,{" "}
        <C>yarn.lock</C> (classic and berry) and pinned <C>requirements.txt</C>,
        checked against npm <C>deprecated</C> and PyPI <C>yanked</C>.{" "}
        <C>Cargo.lock</C>, <C>Gemfile.lock</C>, <C>poetry.lock</C>,{" "}
        <C>uv.lock</C>, <C>Pipfile.lock</C> and <C>go.sum</C> are named in the
        output as unread rather than skipped in silence.
      </>,
      <>The GitHub Action: exit 1 on breaking drift.</>,
    ],
  },
];

/* The handoff carries these four rules in a page-level <style> block:
   ::marker and a 760px collapse cannot be expressed as inline style, and
   globals.css is not ours to edit. Scoped to .dc-log so nothing leaks. */
const SCOPED_CSS = `
/* list-style is restated because Tailwind's preflight strips it off ul */
.dc-log ul { margin: 12px 0 0; padding-left: 18px; list-style: disc outside; }
.dc-log li {
  font-size: 14.5px; line-height: 25px; margin-bottom: 6px;
  color: color-mix(in srgb, var(--color-ink) 78%, transparent);
}
.dc-log li::marker { color: var(--color-neutral-500); }
@media (max-width: 760px) {
  .dc-log-entry { grid-template-columns: 1fr !important; gap: 8px !important; }
}
`;

export default function Changelog() {
  return (
    <Column>
      <style dangerouslySetInnerHTML={{ __html: SCOPED_CSS }} />

      <header
        className="dc-rise"
        data-stagger
        style={{
          padding: "70px 0 42px",
          borderBottom: "1px solid var(--color-divider)",
        }}
      >
        <span
          className="dc-mono dc-rise"
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-neutral-600)",
            marginBottom: 16,
          }}
        >
          [ Changelog ]
        </span>
        <h1
          className="dc-rise"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(32px, 3.8vw, 50px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          What changed,{" "}
          <span style={{ color: "var(--color-accent)" }}>and when.</span>
        </h1>
        <p
          className="dc-rise"
          style={{
            fontSize: 16.5,
            lineHeight: "28px",
            color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
            maxWidth: "60ch",
            margin: "20px 0 0",
          }}
        >
          Releases of the tool itself. One version has been published to npm;
          work that has landed since is listed as published and dated. The
          drift manifests are a separate record — they regenerate daily by a
          scheduled workflow, and their history is the{" "}
          <a
            target="_blank"
            rel="noopener"
            href={`${LINKS.repo}/commits/main/manifests`}
            style={{ color: "var(--color-accent-700)" }}
          >
            git log
          </a>
          .
        </p>
      </header>

      <section className="dc-log" style={{ padding: "28px 0 42px" }}>
        {RELEASES.map((r, i) => (
          <article
            key={r.version}
            className="dc-log-entry dc-rv"
            style={{
              display: "grid",
              gridTemplateColumns: "190px 1fr",
              gap: "20px 36px",
              padding: "36px 0",
              alignItems: "start",
              borderBottom:
                i === RELEASES.length - 1
                  ? undefined
                  : "1px solid var(--color-divider)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              {/* written out for readers, ISO for machines */}
              <time
                dateTime={r.date}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--color-neutral-600)",
                }}
              >
                {formatDate(r.date)}
              </time>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  className="dc-mono"
                  style={{ fontWeight: 600, fontSize: 14 }}
                >
                  {r.version}
                </span>
                <span className={`dc-tag dc-tag-${r.tone}`}>{r.tag}</span>
              </div>
              {/* where the date came from, said on every row rather than
                  once at the bottom, because a reader who scrolls to one
                  entry should not have to trust the other */}
              <span
                style={{
                  fontSize: 12,
                  lineHeight: "18px",
                  color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
                }}
              >
                {r.provenance}
              </span>
            </div>

            <div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 22,
                  lineHeight: 1.2,
                  letterSpacing: "-0.015em",
                }}
              >
                {r.title}
              </h2>
              <ul>
                {r.notes.map((note, j) => (
                  <li key={j}>{note}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>

      <p
        style={{
          fontSize: 12.5,
          lineHeight: "21px",
          maxWidth: "72ch",
          color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
          borderTop: "1px solid var(--color-divider)",
          padding: "20px 0 70px",
          margin: 0,
        }}
      >
        Both entries are dated from the npm publish record, not from git
        tags — v0.2.1 is the repository&#8217;s first tag and marks the tree
        the tarball was cut from. Version 0.1.0 sat in the tree for two hours on{" "}
        {formatDate("2026-07-26")} and was never published, which is why it has
        no entry.
      </p>
    </Column>
  );
}
