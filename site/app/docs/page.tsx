import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Column } from "@/components/primitives";
import { LINKS } from "@/lib/data";
import { ArrowRight } from "@/components/icons";

/* ═══════════════════════════════════════════════════════════════════════
   Docs — "From zero to a failing build in sixty seconds."

   A sticky anchor rail beside a 760px article. Everything is static, so
   this is a server component end to end; the only client code the page
   touches is the shared Motion observer, via .dc-rise / .dc-rv.
   ═══════════════════════════════════════════════════════════════════════ */

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Everything here runs on your machine with zero dependencies. Node 18 or newer is the only requirement. Nothing is uploaded, and there is no account to create.",
};

/* The handoff's TOC hover state and its ≤980px collapse cannot be
   expressed inline — the media query has to beat the inline
   grid-template-columns, exactly as the handoff's own <style> does. */
const SCOPED = `
[data-toc] a {
  display: block; font-size: 13.5px; line-height: 20px;
  color: color-mix(in srgb, var(--color-ink) 66%, transparent);
  text-decoration: none; padding: 5px 0 5px 14px;
  border-left: 1px solid var(--color-divider);
}
[data-toc] a:hover { color: var(--color-accent-700); border-left-color: var(--color-accent); }
[data-docgrid] section[id] { scroll-margin-top: 96px; }
@media (max-width: 980px) {
  [data-docgrid] { grid-template-columns: 1fr !important; }
  [data-toc] { position: static !important; display: none; }
}
`;

const TOC = [
  ["#start", "Getting started"],
  ["#finding", "Reading a finding"],
  ["#fix", "Fixing it"],
  ["#baseline", "Baseline & ignore file"],
  ["#ci", "The GitHub Action"],
  ["#app", "The App & autofix"],
  ["#offline", "Offline & privacy"],
  ["#cli", "CLI reference"],
] as const;

const CLI = [
  ["npx driftcite .", "scan the current directory"],
  ["--json", "machine-readable output"],
  ["--no-deps", "skip the registry checks"],
  ["--fix", "show the swaps the provider named"],
  ["--fix --write", "apply them"],
  ["--list-deps", "every dependency version resolved, no network"],
  ["--write-baseline", "accept today’s findings, fail on new ones"],
  ["--offline", "use the bundled feed, no fetch"],
  ["--version", "print the version"],
] as const;

const ACTION_INPUTS = [
  ["path", ".", "Directory to scan."],
  ["fail-on-breaking", "true", "Fail the job when breaking drift is found."],
  [
    "check-dependencies",
    "true",
    "Also check whether installed versions were deprecated by their maintainer.",
  ],
  ["offline", "false", "Use the bundled feed instead of fetching the live one."],
] as const;

const h2: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 27,
  lineHeight: 1.25,
  letterSpacing: "-0.02em",
  margin: 0,
};

const h3: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: 19,
  margin: "32px 0 0",
};

const lead: CSSProperties = {
  fontSize: 15.5,
  lineHeight: "26px",
  color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
};

const prose: CSSProperties = {
  fontSize: 15,
  lineHeight: "26px",
  color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
};

const aside: CSSProperties = {
  fontSize: 14,
  lineHeight: "24px",
  color: "color-mix(in srgb, var(--color-ink) 62%, transparent)",
};

const pre: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.7,
  background: "var(--color-neutral-100)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-sm)",
  padding: "14px 18px",
  overflowX: "auto",
};

/* the `# …` trailing comments inside every snippet */
const cmt: CSSProperties = { color: "var(--color-term-label)" };

const rule: CSSProperties = { margin: "48px 0" };

const link: CSSProperties = { color: "var(--color-accent-700)" };

/** Inline code. 0.9em in prose, a fixed 12.5px inside tables. */
function C({
  children,
  size = "0.9em",
}: {
  children: ReactNode;
  size?: string | number;
}) {
  return (
    <code className="dc-mono" style={{ fontSize: size }}>
      {children}
    </code>
  );
}

export default function Docs() {
  return (
    <Column>
      <style dangerouslySetInnerHTML={{ __html: SCOPED }} />

      <header
        className="dc-rise"
        data-stagger=""
        style={{
          padding: "70px 0 42px",
          borderBottom: "1px solid var(--color-divider)",
        }}
      >
        <span
          className="dc-rise dc-mono"
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
          [ Documentation ]
        </span>
        <h1
          className="dc-rise"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(32px, 3.8vw, 50px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          From zero to a failing build in sixty seconds.
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
          Everything here runs on your machine with zero dependencies. Node 18
          or newer is the only requirement. Nothing is uploaded, and there is no
          account to create.
        </p>
      </header>

      <div
        data-docgrid="1"
        style={{
          display: "grid",
          gridTemplateColumns: "220px minmax(0, 1fr)",
          gap: 64,
          alignItems: "start",
          paddingTop: 48,
        }}
      >
        <aside
          data-toc="1"
          aria-label="Contents"
          style={{ position: "sticky", top: 96 }}
        >
          <span
            style={{
              display: "block",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
              marginBottom: 12,
            }}
          >
            Contents
          </span>
          {TOC.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </aside>

        <article style={{ maxWidth: 760, paddingBottom: 42 }}>
          {/* ── getting started ───────────────────────────────────────── */}
          <section id="start" className="dc-rv">
            <h2 style={h2}>Getting started</h2>
            <p style={{ ...lead, margin: "16px 0 0" }}>
              One command, no install step. The scan reads your working tree and
              your lockfiles, matches them against the public drift feed, and
              prints what is already broken — with the provider’s own evidence
              URL on every finding.
            </p>
            <pre className="dc-mono" style={{ ...pre, margin: "20px 0 0" }}>
              npx driftcite .
            </pre>
            <p style={{ ...lead, margin: "24px 0 0" }}>
              Two families of drift are checked in one pass:
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 18,
                marginTop: 18,
              }}
            >
              <div className="dc-card" style={{ padding: 20 }}>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--color-accent)",
                  }}
                >
                  Hosted API drift
                </span>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    lineHeight: "22px",
                    color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
                  }}
                >
                  Removed endpoints, dropped parameters, retired enum values,
                  shut-down models — generated by diffing two versions of the
                  provider’s own published OpenAPI spec. Nothing hand-written,
                  nothing inferred.
                </p>
              </div>
              <div className="dc-card" style={{ padding: 20 }}>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--color-accent)",
                  }}
                >
                  Maintainer-flagged versions
                </span>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    lineHeight: "22px",
                    color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
                  }}
                >
                  npm carries a per-version <C>deprecated</C> string, PyPI a{" "}
                  <C>yanked_reason</C>. Written by the maintainer, public, and
                  unseen after install time.
                </p>
              </div>
            </div>
            <p style={{ ...aside, margin: "20px 0 0" }}>
              Lockfiles read: <C>package-lock.json</C>, <C>pnpm-lock.yaml</C>,{" "}
              <C>yarn.lock</C> (classic and berry), pinned{" "}
              <C>requirements.txt</C>. A format it cannot read yet is named in
              the output instead of silently skipped.
            </p>
          </section>

          <hr className="dc-hr" style={rule} />

          {/* ── reading a finding ─────────────────────────────────────── */}
          <section id="finding" className="dc-rv">
            <h2 style={h2}>Reading a finding</h2>
            <div
              className="dc-term"
              style={{ marginTop: 20, boxShadow: "none" }}
            >
              <div className="body" style={{ padding: "16px 20px" }}>
                <div style={{ whiteSpace: "pre" }}>
                  <span className="brk">[BREAKING]</span>{" "}
                  <span style={{ fontWeight: 600 }}>
                    openai/model_id/gpt-4-turbo
                  </span>{" "}
                  <span className="muted">
                    -- deprecated (breaks in 88 days, 2026-10-23)
                  </span>
                </div>
                <div className="muted" style={{ whiteSpace: "pre" }}>
                  {"  Shutdown announced for 2026-10-23."}
                </div>
                <div className="muted" style={{ whiteSpace: "pre" }}>
                  {"  use instead: "}
                  <span className="ok">gpt-5.6-sol</span>
                </div>
                <div className="faint" style={{ whiteSpace: "pre" }}>
                  {`  evidence: ${LINKS.openaiDeprecations}`}
                </div>
                <div className="faint" style={{ whiteSpace: "pre" }}>
                  {'    models.py:7  CHAT_MODEL = "gpt-4-turbo"'}
                </div>
              </div>
            </div>
            <dl
              style={{
                margin: "24px 0 0",
                display: "grid",
                gridTemplateColumns: "170px 1fr",
                gap: "12px 20px",
                fontSize: 14,
                lineHeight: "23px",
              }}
            >
              <dt
                className="dc-mono"
                style={{ fontSize: 12, color: "var(--color-accent-700)" }}
              >
                provider/kind/artifact
              </dt>
              <dd
                style={{
                  margin: 0,
                  color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
                }}
              >
                The identifier that drifted, in a stable three-part form you can
                pin in an ignore file.
              </dd>
              <dt
                className="dc-mono"
                style={{ fontSize: 12, color: "var(--color-accent-700)" }}
              >
                breaks in 88 days
              </dt>
              <dd
                style={{
                  margin: 0,
                  color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
                }}
              >
                Severity is computed against today. The same entry reports as{" "}
                <i>retired</i> the moment the date passes; findings sort by time
                left.
              </dd>
              <dt
                className="dc-mono"
                style={{ fontSize: 12, color: "var(--color-accent-700)" }}
              >
                evidence:
              </dt>
              <dd
                style={{
                  margin: 0,
                  color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
                }}
              >
                The provider’s own page or spec diff. Every finding carries one;
                you should not have to trust us.
              </dd>
              <dt
                className="dc-mono"
                style={{ fontSize: 12, color: "var(--color-accent-700)" }}
              >
                models.py:7
              </dt>
              <dd
                style={{
                  margin: 0,
                  color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
                }}
              >
                Your call site — file, line, and the code that matched.
                driftcite reports call sites, never abstract advisories.
              </dd>
            </dl>
          </section>

          <hr className="dc-hr" style={rule} />

          {/* ── fixing it ─────────────────────────────────────────────── */}
          <section id="fix" className="dc-rv">
            <h2 style={h2}>Fixing it</h2>
            <pre
              className="dc-mono"
              style={{ ...pre, lineHeight: 1.9, margin: "20px 0 0" }}
            >
              {"npx driftcite . --fix           "}
              <span style={cmt}># show the swaps</span>
              {"\nnpx driftcite . --fix --write   "}
              <span style={cmt}># apply them</span>
            </pre>
            <p style={{ ...lead, margin: "24px 0 0" }}>
              There is no model in this path either. It swaps a string the
              provider retired for the string the provider named, inside the
              quoting your code already uses. When the replacement is prose
              rather than a drop-in token, it refuses and says so:{" "}
              <i>the provider named no replacement.</i>
            </p>
            <div
              style={{
                border: "1px solid var(--color-divider)",
                borderRadius: "var(--radius-md)",
                padding: "18px 22px",
                marginTop: 24,
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--color-accent-700)",
                  marginBottom: 8,
                }}
              >
                Guarantees
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: "24px",
                  color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
                }}
              >
                Comment lines are never edited. Only the lines the scan reported
                may change. If an edit would touch anything else, the file is
                left alone entirely rather than partially written. Run without{" "}
                <C>--write</C> first to see the exact diff.
              </p>
            </div>
          </section>

          <hr className="dc-hr" style={rule} />

          {/* ── baseline & ignore file ────────────────────────────────── */}
          <section id="baseline" className="dc-rv">
            <h2 style={h2}>Adopting it in a codebase that already has drift</h2>
            <p style={{ ...lead, margin: "16px 0 0" }}>
              Most codebases will have findings on day one, and a build that
              fails forever is a build people delete the check from. Two ways to
              accept what is already there without going blind to what arrives
              next.
            </p>
            <h3 style={h3}>A baseline</h3>
            <pre className="dc-mono" style={{ ...pre, margin: "14px 0 0" }}>
              npx driftcite . --write-baseline
            </pre>
            <p style={{ ...prose, margin: "16px 0 0" }}>
              This writes <C>.driftcite-baseline.json</C>. Everything already
              broken is accepted; anything new still fails. Delete an entry once
              you fix it.
            </p>
            <h3 style={h3}>An ignore file, for permanent decisions</h3>
            <pre
              className="dc-mono"
              style={{ ...pre, lineHeight: 1.9, margin: "14px 0 0" }}
            >
              <span style={cmt}># .driftciteignore</span>
              {"\nlegacy/*                                        "}
              <span style={cmt}># a path</span>
              {"\nopenai/model_id/text-davinci-003                "}
              <span style={cmt}># an artifact, anywhere</span>
              {"\nexamples/* :: google/model_id/gemini-2.0-flash  "}
              <span style={cmt}># that artifact, only there</span>
            </pre>
            <p style={{ ...prose, margin: "16px 0 0" }}>
              Suppressed findings are counted and reported as suppressed, never
              silently dropped. A tool that hides things is worse than one that
              annoys.
            </p>
          </section>

          <hr className="dc-hr" style={rule} />

          {/* ── the GitHub Action ─────────────────────────────────────── */}
          <section id="ci" className="dc-rv">
            <h2 style={h2}>The GitHub Action</h2>
            <p style={{ ...lead, margin: "16px 0 0" }}>
              One step. It fails the build on breaking drift and writes the
              findings, with evidence links, into the job summary. The CLI ships
              inside the action itself, so nothing is fetched from npm at run
              time.
            </p>
            <pre
              className="dc-mono"
              style={{ ...pre, lineHeight: 1.9, margin: "20px 0 0" }}
            >
              {`- uses: nilaypatell/driftcite@main
  with:
    path: "."
    fail-on-breaking: "true"`}
            </pre>
            <table className="dc-table" style={{ marginTop: 28 }}>
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Input</th>
                  <th style={{ width: 90 }}>Default</th>
                  <th>What it does</th>
                </tr>
              </thead>
              <tbody>
                {ACTION_INPUTS.map(([input, dflt, what]) => (
                  <tr key={input}>
                    <td>
                      <C size={12.5}>{input}</C>
                    </td>
                    <td>
                      <C size={12.5}>{dflt}</C>
                    </td>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...aside, margin: "20px 0 0" }}>
              Outputs: <C>findings</C> (a JSON array) and <C>breaking-count</C>,
              for downstream steps.
            </p>
          </section>

          <hr className="dc-hr" style={rule} />

          {/* ── the App & the autofix workflow ────────────────────────── */}
          <section id="app" className="dc-rv">
            <h2 style={h2}>Getting a pull request instead of a report</h2>
            <p style={{ ...lead, margin: "16px 0 0" }}>
              Two ways, one outcome: a PR arrives with the fix already applied
              and the provider’s own page cited.
            </p>
            <h3 style={h3}>Install the GitHub App</h3>
            <p style={{ ...prose, margin: "14px 0 0" }}>
              Nothing to copy into your repo. The App holds exactly two
              permissions — contents and pull requests — stores only the
              artifact IDs your code matched, never your code, and opens one PR
              per repository when a provider retires something you call. It only
              ever runs against repositories it is installed in, and it will not
              reopen a pull request you have left sitting.
            </p>
            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                marginTop: 20,
                flexWrap: "wrap",
              }}
            >
              <a
                className="dc-btn dc-btn-primary"
                href={LINKS.app}
                style={{ textDecoration: "none" }}
              >
                Install the App
              </a>
              <a
                className="dc-btn dc-btn-ghost"
                href={LINKS.pr}
                style={{ textDecoration: "none" }}
              >
                See a real PR it opened<ArrowRight className="dc-arrow" size={14} />
              </a>
            </div>
            <h3 style={{ ...h3, margin: "36px 0 0" }}>
              Or keep it entirely in your own CI
            </h3>
            <p style={{ ...prose, margin: "14px 0 0" }}>
              Copy{" "}
              <a
                href={`${LINKS.repo}/blob/main/.github/workflows/driftcite-autofix.yml`}
                style={link}
              >
                <C size="0.92em">driftcite-autofix.yml</C>
              </a>{" "}
              into your own workflows. On a schedule it scans, applies only the
              fixes the provider itself named, and opens the same pull request
              from inside your repository.
            </p>
            <table className="dc-table" style={{ marginTop: 28 }}>
              <thead>
                <tr>
                  <th style={{ width: 240 }}></th>
                  <th style={{ width: 150 }}>Where it runs</th>
                  <th>What you get</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <C size={12.5}>npx driftcite .</C>
                  </td>
                  <td>your machine</td>
                  <td>what is broken right now</td>
                </tr>
                <tr>
                  <td>GitHub Action</td>
                  <td>your CI</td>
                  <td>the same, every PR, exit 1 on breaking</td>
                </tr>
                <tr>
                  <td>Autofix workflow</td>
                  <td>your CI</td>
                  <td>a pull request with the fix already applied</td>
                </tr>
                <tr>
                  <td>The App</td>
                  <td>our sweep</td>
                  <td>
                    a PR in every installed repo when a provider moves — even
                    while your laptop is asleep
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <hr className="dc-hr" style={rule} />

          {/* ── offline & privacy ─────────────────────────────────────── */}
          <section id="offline" className="dc-rv">
            <h2 style={h2}>Offline &amp; privacy</h2>
            <p style={{ ...lead, margin: "16px 0 0" }}>
              Your source code is never transmitted anywhere. The CLI makes
              exactly three kinds of network request, all optional, and registry
              requests send package names only — public identifiers, never file
              contents, paths, or repository names.
            </p>
            <pre className="dc-mono" style={{ ...pre, margin: "20px 0 0" }}>
              {"npx driftcite . --offline --no-deps   "}
              <span style={cmt}># a complete scan, zero network</span>
            </pre>
            <p style={{ ...aside, margin: "20px 0 0" }}>
              The full accounting — every request, why, and how to disable it —
              is on the{" "}
              <Link href="/security" style={link}>
                security &amp; privacy page
              </Link>
              .
            </p>
          </section>

          <hr className="dc-hr" style={rule} />

          {/* ── CLI reference ─────────────────────────────────────────── */}
          <section id="cli" className="dc-rv">
            <h2 style={h2}>CLI reference</h2>
            <table className="dc-table" style={{ marginTop: 24 }}>
              <thead>
                <tr>
                  <th style={{ width: 280 }}>Command</th>
                  <th>What it does</th>
                </tr>
              </thead>
              <tbody>
                {CLI.map(([cmd, what]) => (
                  <tr key={cmd}>
                    <td>
                      <C size={12.5}>{cmd}</C>
                    </td>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...aside, margin: "24px 0 0" }}>
              Exit codes: <C>1</C> when breaking drift is found, <C>0</C>{" "}
              otherwise — so the bare command is already CI-ready.
            </p>
          </section>
        </article>
      </div>
    </Column>
  );
}
