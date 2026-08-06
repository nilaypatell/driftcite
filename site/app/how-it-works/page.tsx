import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Column, Kicker } from "@/components/primitives";
import { LINKS, PRECISION } from "@/lib/data";
import { ArrowRight } from "@/components/icons";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "A manifest asserts. A scanner locates. The record is public. No language model sits anywhere in the detection or fix path — the polling runs as public CI, the record is git history, and the scanner is one auditable file.",
};

/* ── shared inline values, read straight off the handoff ────────────── */

const MUTED = "color-mix(in srgb, var(--color-ink) 78%, transparent)";

const LINK_STYLE: CSSProperties = { color: "var(--color-accent-700)" };

/** inline code inside prose */
const CODE: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "0.9em" };

/** code inside a table cell */
const CODE_CELL: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
};

/** right-aligned figure column */
const NUM_CELL: CSSProperties = {
  textAlign: "right",
  fontFeatureSettings: "'tnum' 1",
};

const H2: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "clamp(24px, 2.6vw, 34px)",
  lineHeight: 1.15,
  letterSpacing: "-0.02em",
};

const ACCENT: CSSProperties = { color: "var(--color-accent)" };

const TABLE: CSSProperties = { marginTop: 32, maxWidth: 880 };

const BODY: CSSProperties = {
  fontSize: 15.5,
  lineHeight: "26px",
  color: MUTED,
  maxWidth: "62ch",
};

/* ── the five stages ────────────────────────────────────────────────── */

const STEPS: { n: string; title: string; body: ReactNode }[] = [
  {
    n: "01",
    title: "The watch",
    body: (
      <>
        A scheduled job polls each source at the cadence that source actually
        supports — conditional GETs against spec repositories, one change cursor
        for all of npm, one header for all of PyPI, a content hash for
        documentation pages with no spec. Webhooks are not an option on
        repositories we do not own; polling is the honest mechanism, so it is
        tuned per source rather than pretended away.
      </>
    ),
  },
  {
    n: "02",
    title: "The record",
    body: (
      <>
        What changed is diffed from the provider’s own published spec — removed
        endpoints, dropped parameters, retired enum values — and committed to
        the repository as a manifest, in the open. Storage is git, deployment is
        nothing, and trust is automatic: every fact traces to a commit produced
        by a public CI run whose logs anyone can read. Two years of recorded
        observations cannot be regenerated at any speed, by anyone — a
        competitor starting in 2027 starts their history in 2027.
      </>
    ),
  },
  {
    n: "03",
    title: "The scan",
    body: (
      <>
        On your machine, the CLI matches manifests against your call sites —
        line 309 of <code style={CODE}>ai-providers.js</code>, not an abstract
        advisory. Each artifact kind matches only in the shape it takes when
        actually sent to a provider, and most kinds require the file to
        reference that provider at all. Comment lines are skipped; vendored
        manifests are ignored.
      </>
    ),
  },
  {
    n: "04",
    title: "The verdict",
    body: (
      <>
        Severity is computed against today, not frozen when a manifest was
        written. An entry reading “deprecated, retires 2026-10-23” reports as{" "}
        <i>breaks in 88 days</i> before that date and as <i>retired</i> after
        it, and findings sort by time remaining. No dependency tool has a field
        for that.
      </>
    ),
  },
  {
    n: "05",
    title: "The pull request",
    body: (
      <>
        Only when you asked for it. The App applies the swap the provider itself
        named, inside your existing quoting, cites the provider’s page in the PR
        body, and refuses everything that needs judgment — out loud. One pull
        request per repository, opened serially, and never reopened once you
        have closed it. Automatic PRs are welcome when you asked for them and
        spam when you did not.
      </>
    ),
  },
];

/* ── the cadence table ──────────────────────────────────────────────── */

const CADENCE: { source: ReactNode; mechanism: ReactNode; cadence: string }[] = [
  {
    source: "Spec repos in git",
    mechanism: (
      <>
        <code style={CODE_CELL}>releases.atom</code> conditional GET — 304s cost
        nothing
      </>
    ),
    cadence: "5 min",
  },
  {
    source: "Spec repos, fallback",
    mechanism: "GitHub REST, conditional requests",
    cadence: "hourly",
  },
  {
    source: "npm — 4,230,819 packages",
    mechanism: (
      <>
        one <code style={CODE_CELL}>_changes</code> sequence cursor, keyless
      </>
    ),
    cadence: "5 min",
  },
  {
    source: "PyPI",
    mechanism: (
      <>
        one <code style={CODE_CELL}>X-PyPI-Last-Serial</code> header
      </>
    ),
    cadence: "10 min",
  },
  {
    source: "Docs without a spec",
    mechanism: "fetch plus content hash",
    cadence: "daily",
  },
];

/* ── the match-shape table ──────────────────────────────────────────── */

const SHAPES: { kind: ReactNode; matches: string }[] = [
  {
    kind: <code style={CODE_CELL}>enum_value</code>,
    matches: "a quoted string literal",
  },
  {
    kind: <code style={CODE_CELL}>request_param</code>,
    matches: "a quoted literal or an object key",
  },
  {
    kind: (
      <>
        <code style={CODE_CELL}>model_id</code> ·{" "}
        <code style={CODE_CELL}>endpoint</code>
      </>
    ),
    matches: "a quoted literal or a bounded token",
  },
];

export default function HowItWorks() {
  return (
    <Column>
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
          [ Method ]
        </span>
        <h1
          className="dc-rise"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(32px, 3.8vw, 50px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            maxWidth: "20em",
          }}
        >
          A manifest asserts. A scanner locates.{" "}
          <span style={ACCENT}>The record is public.</span>
        </h1>
        <p
          className="dc-rise"
          style={{
            fontSize: 16.5,
            lineHeight: "28px",
            color: MUTED,
            maxWidth: "62ch",
            marginTop: 20,
          }}
        >
          No language model sits anywhere in the detection or fix path. Every
          stage below is observable: the polling runs as public CI, the record
          is git history, and the scanner is one auditable file. The numbers
          come from{" "}
          <a href={LINKS.architecture} style={LINK_STYLE}>
            ARCHITECTURE.md
          </a>
          , each verified against a live endpoint.
        </p>
      </header>

      <section style={{ padding: "42px 0 56px" }}>
        {STEPS.map((step, i) => (
          <div
            key={step.n}
            className="dc-rv grid grid-cols-[96px_1fr] max-[900px]:grid-cols-[60px_1fr]"
            style={{
              gap: "20px 28px",
              padding: "28px 0",
              borderBottom:
                i === STEPS.length - 1
                  ? undefined
                  : "1px solid var(--color-divider)",
              alignItems: "start",
            }}
          >
            <span
              className="dc-mono"
              style={{
                fontWeight: 500,
                fontSize: 24,
                lineHeight: 1.2,
                color: "var(--color-accent)",
              }}
            >
              {step.n}
            </span>
            <div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 24,
                  lineHeight: 1.2,
                  letterSpacing: "-0.015em",
                }}
              >
                {step.title}
              </h2>
              <p style={{ ...BODY, marginTop: 12 }}>{step.body}</p>
            </div>
          </div>
        ))}
      </section>

      <hr className="dc-hr" />

      <section className="dc-rv" style={{ padding: "70px 0" }}>
        <div style={{ marginBottom: 16 }}>
          <Kicker n={1} total={3} label="The cadence" />
        </div>
        <h2 style={H2}>
          Set by what each source{" "}
          <span style={ACCENT}>actually supports.</span>
        </h2>
        <table className="dc-table" style={TABLE}>
          <thead>
            <tr>
              <th>Source</th>
              <th>Mechanism</th>
              <th style={{ textAlign: "right" }}>Cadence</th>
            </tr>
          </thead>
          <tbody>
            {CADENCE.map((row) => (
              <tr key={row.cadence + String(row.source)}>
                <td>{row.source}</td>
                <td>{row.mechanism}</td>
                <td style={NUM_CELL}>{row.cadence}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: "22px",
            color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
            marginTop: 18,
            maxWidth: "62ch",
          }}
        >
          The registries need no per-provider work at all: millions of packages
          for two requests every five minutes. npm is followed incrementally,
          always — never full-crawled.
        </p>
      </section>

      <hr className="dc-hr" />

      <section className="dc-rv" style={{ padding: "70px 0" }}>
        <div style={{ marginBottom: 16 }}>
          <Kicker n={2} total={3} label="The match shapes" />
        </div>
        <h2 style={H2}>
          Each kind matches only in the shape it is{" "}
          <span style={ACCENT}>actually sent.</span>
        </h2>
        <table className="dc-table" style={TABLE}>
          <thead>
            <tr>
              <th style={{ width: 240 }}>Kind</th>
              <th>Matches as</th>
            </tr>
          </thead>
          <tbody>
            {SHAPES.map((row) => (
              <tr key={row.matches}>
                <td>{row.kind}</td>
                <td>{row.matches}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p
          style={{
            fontSize: 15,
            lineHeight: "26px",
            color: MUTED,
            marginTop: 20,
            maxWidth: "62ch",
          }}
        >
          Kinds other than model IDs also require the file to reference that
          provider at all — the <code style={CODE}>markers</code> in{" "}
          <Link href="/coverage#add" style={LINK_STYLE}>
            providers.yaml
          </Link>
          . This is what took one real repository from {PRECISION.before}{" "}
          findings at roughly 25% true to {PRECISION.after} at 100%, and that
          ratio is the whole product: a tool that is wrong three times out of
          four gets muted, then deleted.
        </p>
      </section>

      <hr className="dc-hr" />

      <section className="dc-rv" style={{ padding: "70px 0 84px" }}>
        <div style={{ marginBottom: 16 }}>
          <Kicker n={3} total={3} label="Built in the open" />
        </div>
        <h2 style={H2}>
          The pipeline is the <span style={ACCENT}>argument.</span>
        </h2>
        <p style={{ ...BODY, marginTop: 20 }}>
          The ingest runs as a scheduled GitHub Action in the public repository
          and commits the manifests back to it. Storage is git. Deployment is
          nothing. And there is no reason to ever discard history — which
          matters, because the history is the thing a fresh clone can never
          have.
        </p>
        <p style={{ ...BODY, marginTop: 14 }}>
          The hosted watch keeps the same posture: exactly two permissions —
          contents and pull requests — and it stores the artifact IDs your code
          matched, a few hundred strings, never files. Everything it does, the
          public CLI can do; it just does it while your laptop is asleep.
        </p>
        <div
          style={{
            display: "flex",
            gap: 13.8,
            marginTop: 28,
            flexWrap: "wrap",
          }}
        >
          <a className="dc-btn dc-btn-primary" href={LINKS.app}>
            Install the App
          </a>
          <a className="dc-btn dc-btn-ghost" href={LINKS.architecture}>
            Read ARCHITECTURE.md<ArrowRight className="dc-arrow" size={14} />
          </a>
        </div>
      </section>
    </Column>
  );
}
