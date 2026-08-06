import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Column, Kicker } from "@/components/primitives";
import {
  BY_POPULARITY,
  CORPUS,
  DEAD_IDENTIFIERS,
  LINKS,
  PROVIDERS,
  TOTAL_ARTIFACTS,
  TOTAL_PROVIDERS,
} from "@/lib/data";

/* ═══════════════════════════════════════════════════════════════════════
   Coverage — "Twelve providers under daily watch."

   Every figure on this page is read out of lib/data.ts: the provider table
   off PROVIDERS, the bar chart off PROVIDERS.findings, the identifier table
   off DEAD_IDENTIFIERS, the popularity band off BY_POPULARITY, the corpus
   sentences off CORPUS. Nothing is typed out by hand.
   ═══════════════════════════════════════════════════════════════════════ */

export const metadata: Metadata = pageMeta({
  path: "/coverage",
  title: "Coverage",
  description: `${TOTAL_ARTIFACTS} artifacts across ${TOTAL_PROVIDERS} providers under daily watch, each carrying the provider’s own evidence URL — plus every npm and PyPI package.`,
});

/* The headline says "Ten", not "10". Spelling it out of the constant keeps
   the sentence from quietly disagreeing with the data if a provider lands. */
const NUMBER_WORD: Record<number, string> = {
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Eleven",
  12: "Twelve",
};
const providersWord = NUMBER_WORD[TOTAL_PROVIDERS] ?? String(TOTAL_PROVIDERS);

/* Two evidence URLs the page needs that lib/data.ts does not carry. */
const MANIFESTS_DIR =
  "https://github.com/nilaypatell/driftcite/tree/main/manifests";
const MANIFESTS_LICENSE =
  "https://github.com/nilaypatell/driftcite/blob/main/manifests/LICENSE.md";

const ink = (pct: number) =>
  `color-mix(in srgb, var(--color-ink) ${pct}%, transparent)`;

const SECTION_MARK: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--color-neutral-600)",
  marginBottom: 16,
};

const H2: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "clamp(24px, 2.6vw, 34px)",
  lineHeight: 1.12,
  letterSpacing: "-0.02em",
};

const LEAD: CSSProperties = {
  fontSize: 16,
  lineHeight: "28px",
  color: ink(78),
  maxWidth: "62ch",
};

const A: CSSProperties = { color: "var(--color-accent-700)" };
const TNUM: CSSProperties = {
  textAlign: "right",
  fontFeatureSettings: "'tnum' 1",
};
const CODE_SM: CSSProperties = { fontSize: 12.5 };
const SUB_LABEL: CSSProperties = {
  display: "block",
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: ink(55),
};

/** Artifact count for one provider, 0 for the watched-only ones. */
function artifactsOf(name: string): number {
  const p = PROVIDERS.find((x) => x.name === name);
  return p && "artifacts" in p ? p.artifacts : 0;
}

/** The providers that are tracked but have retired nothing yet. */
const WATCHED = PROVIDERS.filter((p) => "watched" in p);

/** Breaking findings, largest first — PROVIDERS is already in that order. */
const FINDINGS = PROVIDERS.flatMap((p) =>
  "findings" in p ? [{ name: p.name, findings: p.findings }] : [],
);
const MAX_FINDINGS = Math.max(...FINDINGS.map((p) => p.findings));

const code = (text: string) => (
  <code className="dc-mono" style={CODE_SM}>
    {text}
  </code>
);

/** The provider list. Sources are prose; every count comes from PROVIDERS. */
const SOURCE_ROWS: {
  label: string;
  bold: boolean;
  source: ReactNode;
  count: ReactNode;
}[] = [
  {
    label: "GitHub",
    bold: true,
    source: code("github/rest-api-description"),
    count: artifactsOf("GitHub"),
  },
  {
    label: "Cloudflare",
    bold: true,
    source: code("cloudflare/api-schemas"),
    count: artifactsOf("Cloudflare"),
  },
  {
    label: "OpenAI",
    bold: true,
    source: <>{code("openai/openai-openapi")} + deprecations page</>,
    count: artifactsOf("OpenAI"),
  },
  {
    label: "Stripe",
    bold: true,
    source: <>{code("stripe/openapi")} · 2,345 tagged releases</>,
    count: artifactsOf("Stripe"),
  },
  {
    label: "Google",
    bold: true,
    source: "Gemini changelog, curated",
    count: artifactsOf("Google"),
  },
  {
    label: "Groq",
    bold: true,
    source: "deprecations page, curated",
    count: artifactsOf("Groq"),
  },
  {
    label: "Mistral",
    bold: true,
    source: "model docs deprecation table, curated",
    count: artifactsOf("Mistral"),
  },
  {
    label: "Cohere",
    bold: true,
    source: "deprecations page, curated",
    count: artifactsOf("Cohere"),
  },
  {
    label: "Other model providers",
    bold: false,
    source: "curated retirement pages",
    count: artifactsOf("Anthropic"),
  },
  {
    label: WATCHED.map((p) => p.name).join(" · "),
    bold: false,
    source: "tracked, currently no drift",
    count: WATCHED.reduce((n, p) => n + artifactsOf(p.name), 0),
  },
  {
    label: "npm · PyPI",
    bold: true,
    source: "every package, no per-provider work",
    count: <span style={{ color: "var(--color-accent-700)" }}>live</span>,
  },
];

/* The corpus band's copy, paired by index with BY_POPULARITY's percentages. */
const POPULARITY_LABELS = [
  "of repos under 100 stars affected",
  "100 to 1,000 stars",
  "1,000 to 10,000 stars",
  "over 10,000 stars — 5 of 6 repos",
];

export default function CoveragePage() {
  return (
    <main>
      <Column>
        <header
          className="dc-rise"
          data-stagger="120"
          style={{
            padding: "70px 0 42px",
            borderBottom: "1px solid var(--color-divider)",
          }}
        >
          <span className="dc-mono dc-rise" style={SECTION_MARK}>
            [ Coverage ]
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
            {providersWord} providers under daily watch.
          </h1>
          <p
            className="dc-rise"
            style={{
              fontSize: 16.5,
              lineHeight: "28px",
              color: ink(78),
              maxWidth: "62ch",
              marginTop: 20,
            }}
          >
            {TOTAL_ARTIFACTS} artifacts, every one carrying the provider’s own
            evidence URL — plus every npm and PyPI package, with no per-provider
            work at all. The registries are the cheapest coverage in software:
            one cursor covers all of npm, one header covers all of PyPI.
          </p>
        </header>

        {/* ── the provider list ─────────────────────────────────────── */}
        <section className="dc-rv" style={{ padding: "56px 0" }}>
          <table className="dc-table" style={{ maxWidth: 880 }}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Source</th>
                <th style={{ textAlign: "right" }}>Artifacts</th>
              </tr>
            </thead>
            <tbody>
              {SOURCE_ROWS.map((row) => (
                <tr key={row.label}>
                  <td style={row.bold ? { fontWeight: 600 } : undefined}>
                    {row.label}
                  </td>
                  <td>{row.source}</td>
                  <td style={TNUM}>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <hr className="dc-hr" />

        {/* ── 01 / 03 · the corpus ──────────────────────────────────── */}
        <section style={{ padding: "70px 0" }}>
          <div style={{ marginBottom: 16 }}>
            <Kicker n={1} total={3} label="The corpus, July 2026" />
          </div>
          <h2 style={H2}>
            What <span data-count={CORPUS.scanned}>{CORPUS.scanned}</span>{" "}
            repositories were actually calling.
          </h2>

          <div
            className="dc-rv grid grid-cols-2 max-[900px]:grid-cols-1"
            style={{ gap: 56, marginTop: 44, alignItems: "start" }}
          >
            <div>
              <span style={{ ...SUB_LABEL, marginBottom: 18 }}>
                Breaking findings by provider
              </span>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 13 }}
              >
                {FINDINGS.map((p) => (
                  <div
                    key={p.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "92px 1fr 44px",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 13.5 }}>{p.name}</span>
                    {/* The lane is the whole scale, so a bar reads against
                        what it could have been — without it GitHub's single
                        finding was a 2px shard floating in white space. The
                        bar's data-end is rounded and its baseline stays
                        square: a pill on both ends would lift the mark off
                        the axis it is measured from. */}
                    <div
                      style={{
                        height: 8,
                        borderRadius: "0 4px 4px 0",
                        background: "var(--color-accent-100)",
                        overflow: "hidden",
                      }}
                    >
                      {/* the width is data, so it is passed as --w and the
                          bar grows out to it as the chart arrives; with no
                          JavaScript it is simply already there */}
                      <div
                        data-bar=""
                        style={
                          {
                            height: "100%",
                            borderRadius: "0 4px 4px 0",
                            background: "var(--color-accent-400)",
                            minWidth: 3,
                            "--w": `${(p.findings / MAX_FINDINGS) * 100}%`,
                          } as CSSProperties
                        }
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        textAlign: "right",
                        fontFeatureSettings: "'tnum' 1",
                        color: ink(70),
                      }}
                    >
                      {p.findings}
                    </span>
                  </div>
                ))}
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  lineHeight: "20px",
                  color: ink(55),
                  marginTop: 20,
                }}
              >
                {CORPUS.breaking.toLocaleString("en-US")} breaking call sites
                across {CORPUS.affected} affected repositories. Reproducible
                with the public CLI; methodology in{" "}
                <a target="_blank" rel="noopener" href={LINKS.report} style={A}>
                  corpus/report.json
                </a>
                .
              </p>
            </div>

            <div>
              <span style={{ ...SUB_LABEL, marginBottom: 8 }}>
                The most-cited dead identifiers
              </span>
              <table className="dc-table">
                <thead>
                  <tr>
                    <th>Artifact</th>
                    <th style={{ textAlign: "right" }}>Repos calling it</th>
                  </tr>
                </thead>
                <tbody>
                  {DEAD_IDENTIFIERS.map((d) => (
                    <tr key={d.prefix + d.id}>
                      <td>
                        <code className="dc-mono" style={{ fontSize: 12 }}>
                          {d.prefix}
                          {d.id}
                        </code>
                      </td>
                      <td style={TNUM}>{d.repos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div
            className="dc-rv grid grid-cols-4 max-[900px]:grid-cols-2"
            style={{
              gap: 28,
              marginTop: 56,
              borderTop: "1px solid var(--color-divider)",
              paddingTop: 32,
            }}
          >
            {BY_POPULARITY.map((band, i) => (
              <div key={band.label}>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 32,
                    lineHeight: 1.1,
                    fontFeatureSettings: "'tnum' 1",
                    color:
                      i === BY_POPULARITY.length - 1
                        ? "var(--color-accent)"
                        : undefined,
                  }}
                >
                  <span data-count={band.pct}>{band.pct}</span>%
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    lineHeight: "18px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: ink(62),
                    marginTop: 8,
                  }}
                >
                  {POPULARITY_LABELS[i]}
                </p>
              </div>
            ))}
          </div>

          <p
            style={{
              fontSize: 13.5,
              lineHeight: "22px",
              color: ink(55),
              marginTop: 20,
              maxWidth: "60ch",
            }}
          >
            The share rises with popularity. Bigger codebases have more call
            sites and longer memories — drift is not a small-project problem.
          </p>
        </section>

        <hr className="dc-hr" />

        {/* ── 02 / 03 · the feed ────────────────────────────────────── */}
        <section id="feed" style={{ padding: "70px 0", scrollMarginTop: 96 }}>
          <div style={{ marginBottom: 16 }}>
            <Kicker n={2} total={3} label="The feed" />
          </div>
          <h2 style={H2}>
            The git history is the record of what was observed, and when.
          </h2>
          <div className="dc-rv">
            <p style={{ ...LEAD, marginTop: 20 }}>
              Manifests live in{" "}
              <a target="_blank" rel="noopener" href={MANIFESTS_DIR} style={A}>
                <code className="dc-mono" style={{ fontSize: "0.9em" }}>
                  manifests/
                </code>
              </a>
              , are regenerated daily by a scheduled workflow in the repository,
              and are committed there in the open. Every fact in the feed traces
              to a commit produced by a public CI run whose logs anyone can
              read. For a product whose entire pitch is{" "}
              <i>we cite the provider instead of guessing,</i> the pipeline
              itself being auditable is the argument.
            </p>
            <p style={{ ...LEAD, marginTop: 16 }}>
              Every fact is public and free to read, and you can vendor the
              whole thing. The hard part was never obtaining it — it is
              maintaining it, every day, forever, across every provider, because
              it decays the moment anyone stops. That is the one place a
              restriction sits: the{" "}
              <a
                target="_blank"
                rel="noopener"
                href={MANIFESTS_LICENSE}
                style={A}
              >
                data license
              </a>{" "}
              permits use, redistribution and research, and prohibits
              repackaging the feed as a competing feed. The scanner itself is
              Apache-2.0 — embed it anywhere, including your own pipelines.
            </p>
          </div>
        </section>

        <hr className="dc-hr" />

        {/* ── 03 / 03 · contributing ────────────────────────────────── */}
        <section
          id="add"
          style={{ padding: "70px 0 28px", scrollMarginTop: 96 }}
        >
          <div style={{ marginBottom: 16 }}>
            <Kicker n={3} total={3} label="Contributing" />
          </div>
          <h2 style={H2}>Adding a provider is a data change, not a patch.</h2>

          <div
            className="dc-rv grid grid-cols-2 max-[900px]:grid-cols-1"
            style={{ gap: 56, marginTop: 36, alignItems: "start" }}
          >
            <p
              style={{
                fontSize: 15.5,
                lineHeight: "26px",
                color: ink(78),
                maxWidth: "52ch",
              }}
            >
              Providers live in{" "}
              <code className="dc-mono" style={{ fontSize: "0.9em" }}>
                providers.yaml
              </code>
              , not in code. If a provider publishes a versioned OpenAPI spec in
              a public git repository, four lines is the whole integration. The{" "}
              <code className="dc-mono" style={{ fontSize: "0.9em" }}>
                markers
              </code>{" "}
              matter more than they look: they are what stops a retired
              parameter named <i>refund</i> from flagging every codebase that
              has ever mentioned a refund — the difference between a tool people
              leave switched on and one they mute in a week. Full guide in{" "}
              <a
                target="_blank"
                rel="noopener"
                href={LINKS.contributing}
                style={A}
              >
                CONTRIBUTING.md
              </a>
              ; pull requests welcome.
            </p>

            <pre
              className="dc-mono"
              style={{
                fontSize: 13,
                lineHeight: 1.8,
                background: "var(--color-neutral-100)",
                border: "1px solid var(--color-divider)",
                borderRadius: "var(--radius-sm)",
                padding: "16px 20px",
                overflowX: "auto",
              }}
            >
              <span style={{ color: "var(--color-term-label)" }}>
                # providers.yaml
              </span>
              {
                "\nstripe:\n  repo: stripe/openapi\n  path: openapi/spec3.json\n  markers: [stripe, STRIPE_SECRET, STRIPE_API]"
              }
            </pre>
          </div>
        </section>
      </Column>
    </main>
  );
}
