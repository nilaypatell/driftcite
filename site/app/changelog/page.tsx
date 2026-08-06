import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Column } from "@/components/primitives";
import { CORPUS, LINKS, PRECISION, TOTAL_ARTIFACTS } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Releases of the driftcite scanner, Action and GitHub App — what changed, and when. The drift manifests are a separate record, regenerated daily by a scheduled workflow.",
};

/** Inline code, the handoff's treatment: mono, 0.92em of its own line. */
function C({ children }: { children: ReactNode }) {
  return (
    <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.92em" }}>
      {children}
    </code>
  );
}

type Release = {
  /** The tag, as published. */
  version: string;
  /** ISO date. Used verbatim as the `datetime`, written out for readers. */
  date: string;
  /** Optional pill beside the version — "Latest" on the newest entry. */
  tag?: string;
  title: string;
  notes: ReactNode[];
};

/* ═══════════════════════════════════════════════════════════════════════
   PLACEHOLDER RELEASES — NOT YET VERIFIED. REPLACE BEFORE LAUNCH.

   Every entry below is reproduced verbatim from the design handoff
   (design_handoff_driftcite_site/changelog.dc.html), whose README labels
   this page "Release entries, dated Aug 2026+ (placeholder dates —
   replace with real releases)". The versions, dates and notes are design
   filler: none of them has been checked against a git tag, a GitHub
   release or the npm registry.

   Whoever ships this page: replace this array with the real release
   history. The page renders whatever it holds — nothing else on the page
   knows a version number, so editing here is the whole job.
   ═══════════════════════════════════════════════════════════════════════ */
const RELEASES: readonly Release[] = [
  {
    version: "v0.2.0",
    date: "2026-08-05",
    tag: "Latest",
    title: "The pull request arrives",
    notes: [
      <>
        The GitHub App is live: the hosted watch sweeps every installation and
        opens one cited pull request per repository, serially — with the swap
        the provider itself named. It stores artifact IDs, never your code.
      </>,
      <>
        <C>driftcite-autofix.yml</C>: the same pull request, opened from inside
        your own CI on a schedule.
      </>,
      <>
        The corpus study: {CORPUS.scanned} public repositories scanned in July
        2026 — {CORPUS.sharePct}% call at least one API that is already dead.
        Methodology and per-provider counts in <C>corpus/</C>.
      </>,
    ],
  },
  {
    version: "v0.1.3",
    date: "2026-07-14",
    title: "Day-one debt, handled",
    notes: [
      <>
        <C>--write-baseline</C> accepts today’s findings and fails only on new
        ones. Delete an entry once you fix it.
      </>,
      <>
        <C>.driftciteignore</C> with path, artifact, and{" "}
        <C>path :: artifact</C> scoping. Suppressed findings are counted and
        reported, never silently dropped.
      </>,
      <>The Action writes findings, with evidence links, into the job summary.</>,
    ],
  },
  {
    version: "v0.1.2",
    date: "2026-06-09",
    title: "The precision rework",
    notes: [
      <>
        Every artifact kind now matches only in the shape it takes when actually
        sent to a provider: quoted literals, object keys, bounded tokens.
      </>,
      <>
        Provider markers gate non-model artifacts — a retired parameter named{" "}
        <C>refund</C> no longer flags every codebase that has ever mentioned a
        refund.
      </>,
      <>
        {PRECISION.before} findings at roughly 25% true on a real
        1,200-dependency repository became {PRECISION.after} at 100%. Coverage
        grew to ten providers and {TOTAL_ARTIFACTS} artifacts with zero new
        false findings across nine repositories.
      </>,
    ],
  },
  {
    version: "v0.1.1",
    date: "2026-05-18",
    title: "More lockfiles",
    notes: [
      <>
        <C>pnpm-lock.yaml</C> and <C>yarn.lock</C> (classic and berry) join{" "}
        <C>package-lock.json</C> and pinned <C>requirements.txt</C>.
      </>,
      <>
        <C>--list-deps</C> and <C>--offline</C>.
      </>,
      <>
        A lockfile format it cannot read yet is named in the output instead of
        silently skipped.
      </>,
    ],
  },
  {
    version: "v0.1.0",
    date: "2026-04-27",
    title: "First release",
    notes: [
      <>
        A single-file scanner, <C>bin/driftcite.mjs</C>, with zero runtime
        dependencies.
      </>,
      <>
        Manifests committed in the open; the git history is the record of what
        was observed, and when.
      </>,
      <>The GitHub Action: exit 1 on breaking drift.</>,
      <>
        npm <C>deprecated</C> and PyPI <C>yanked</C> checks against your
        lockfiles.
      </>,
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
          What changed, <span style={{ color: "var(--color-accent)" }}>and when.</span>
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
          Releases of the tool itself. The drift manifests are a separate record
          — they regenerate daily by a scheduled workflow, and their history is
          the{" "}
          <a
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
                {r.tag ? (
                  <span className="dc-tag dc-tag-accent">{r.tag}</span>
                ) : null}
              </div>
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
    </Column>
  );
}
