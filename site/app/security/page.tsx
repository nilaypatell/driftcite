import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Column, Kicker } from "@/components/primitives";
import { LINKS } from "@/lib/data";

/* ═══════════════════════════════════════════════════════════════════════
   Security & privacy — "Worth stating plainly."

   Every sentence here is a claim about what the tool does with someone's
   private source, so the copy is the handoff's verbatim and matches
   SECURITY.md in the repository. Nothing on this page is softened,
   embellished or rounded up; if a guarantee changes in the repository it
   has to change here in the same commit.
   ═══════════════════════════════════════════════════════════════════════ */

export const metadata: Metadata = pageMeta({
  path: "/security",
  title: "Security & privacy",
  description:
    "Your source code is never transmitted: the scan runs entirely on your machine, with no account, no upload and no telemetry. The three optional network requests, what --fix may write, and the two permissions the GitHub App asks for.",
});

const MUTED = "color-mix(in srgb, var(--color-ink) 78%, transparent)";

/** The section marker under each kicker, and the lede under each H2. */
const H2: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "clamp(24px, 2.6vw, 34px)",
  lineHeight: 1.15,
  letterSpacing: "-0.02em",
};

const LEDE: CSSProperties = {
  fontSize: 15.5,
  lineHeight: "26px",
  color: MUTED,
  marginTop: 20,
};

/** Inline code inside body copy and table cells. */
const CODE: CSSProperties = { fontSize: 12.5 };
const CODE_EM: CSSProperties = { fontSize: "0.92em" };

/** The rules list under `--fix`: 14.5/25, one notch quieter than the lede. */
const RULE: CSSProperties = {
  fontSize: 14.5,
  lineHeight: "25px",
  color: MUTED,
  marginBottom: 6,
};

export default function Security() {
  return (
    <Column>
      <header
        className="dc-rise"
        data-stagger="120"
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
          [ Security &amp; privacy ]
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
          Worth{" "}
          <span style={{ color: "var(--color-accent)" }}>stating plainly.</span>
        </h1>
        <p
          className="dc-rise"
          style={{
            fontSize: 16.5,
            lineHeight: "28px",
            color: MUTED,
            maxWidth: "60ch",
            marginTop: 20,
          }}
        >
          You are being asked to run a scanner over a private codebase. Here is
          exactly what it does with your code — and what it never does.
        </p>
      </header>

      {/* ── 01 · the network ─────────────────────────────────────────── */}
      <section className="dc-rv" style={{ padding: "70px 0" }}>
        <div style={{ marginBottom: 16 }}>
          <Kicker n={1} total={4} label="The network" />
        </div>
        <h2 style={H2}>
          Your source code is{" "}
          <span style={{ color: "var(--color-accent)" }}>
            never transmitted.
          </span>
        </h2>
        <p style={{ ...LEDE, maxWidth: "62ch" }}>
          The scan runs entirely on your machine. There is no account, no
          upload, and no telemetry. The CLI makes exactly three kinds of network
          request, all of them optional — and registry requests send package
          names only: public identifiers, never file contents, paths, or
          repository names.
        </p>

        <table className="dc-table" style={{ marginTop: 28, maxWidth: 880 }}>
          <thead>
            <tr>
              <th>Request</th>
              <th>Why</th>
              <th style={{ width: 160 }}>How to disable</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Fetch{" "}
                <code className="dc-mono" style={CODE}>
                  feed/feed.json
                </code>{" "}
                from the repository
              </td>
              <td>the drift facts to match against</td>
              <td>
                <code className="dc-mono" style={CODE}>
                  --offline
                </code>
              </td>
            </tr>
            <tr>
              <td>
                <code className="dc-mono" style={CODE}>
                  registry.npmjs.org/&lt;package&gt;
                </code>
              </td>
              <td>was a version you installed deprecated by its maintainer</td>
              <td>
                <code className="dc-mono" style={CODE}>
                  --no-deps
                </code>
              </td>
            </tr>
            <tr>
              <td>
                <code className="dc-mono" style={CODE}>
                  pypi.org/pypi/&lt;package&gt;/json
                </code>
              </td>
              <td>was a release you pinned yanked</td>
              <td>
                <code className="dc-mono" style={CODE}>
                  --no-deps
                </code>
              </td>
            </tr>
          </tbody>
        </table>

        <pre
          className="dc-mono"
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            background: "var(--color-neutral-100)",
            border: "1px solid var(--color-divider)",
            borderRadius: "var(--radius-sm)",
            padding: "14px 18px",
            marginTop: 24,
            maxWidth: 844,
            overflowX: "auto",
          }}
        >
          npx driftcite . --offline --no-deps{"   "}
          {/* the handoff's comment grey; #6E7690 is the term-label token */}
          <span style={{ color: "var(--color-term-label)" }}>
            # a complete scan, zero network
          </span>
        </pre>
      </section>

      <hr className="dc-hr" />

      {/* ── 02 · the dependencies  ·  03 · writes ────────────────────── */}
      <section
        className="dc-rv grid grid-cols-1 min-[901px]:grid-cols-2"
        style={{ padding: "70px 0", gap: 56, alignItems: "start" }}
      >
        <div>
          <div style={{ marginBottom: 16 }}>
            <Kicker n={2} total={4} label="The dependencies" />
          </div>
          <h2 style={H2}>
            Zero,{" "}
            <span style={{ color: "var(--color-accent)" }}>by design.</span>
          </h2>
          <p style={{ ...LEDE, maxWidth: "52ch" }}>
            The CLI runs on a stranger’s machine and reads their source, so it
            should be auditable in one sitting and pull nothing in. The entire
            scanner is a single file:{" "}
            <a
              target="_blank"
              rel="noopener"
              href={`${LINKS.repo}/blob/main/bin/driftcite.mjs`}
              style={{ color: "var(--color-accent-700)" }}
            >
              <code className="dc-mono" style={CODE_EM}>
                bin/driftcite.mjs
              </code>
            </a>
            . The Action ships the CLI inside itself — nothing is fetched from
            npm at run time.
          </p>
        </div>

        <div>
          <div style={{ marginBottom: 16 }}>
            <Kicker n={3} total={4} label="Writes" />
          </div>
          <h2 style={H2}>
            What{" "}
            <code
              className="dc-mono"
              style={{ fontSize: "0.82em", color: "var(--color-accent)" }}
            >
              --fix
            </code>{" "}
            may touch.
          </h2>
          {/* preflight strips the disc back off, so the list type is inline */}
          <ul
            className="marker:text-neutral-500"
            style={{ listStyleType: "disc", marginTop: 14, paddingLeft: 18 }}
          >
            <li style={RULE}>
              Files change only when you also pass{" "}
              <code className="dc-mono" style={CODE_EM}>
                --write
              </code>
              ; run without it first to see the exact diff.
            </li>
            <li style={RULE}>
              Only the lines the scan already reported may change, inside the
              existing quoting, swapping one literal for the replacement the
              provider itself named.
            </li>
            <li style={RULE}>Comment lines are never edited.</li>
            <li style={RULE}>
              If an edit would change any other line, the file is left untouched
              rather than partially written.
            </li>
            <li style={RULE}>
              Replacements that are prose rather than a drop-in token are
              refused and reported as needing a human.
            </li>
          </ul>
        </div>
      </section>

      <hr className="dc-hr" />

      {/* ── 04 · the App ─────────────────────────────────────────────── */}
      <section className="dc-rv" style={{ padding: "70px 0" }}>
        <div style={{ marginBottom: 16 }}>
          <Kicker n={4} total={4} label="The App" />
        </div>
        <h2 style={H2}>
          Two permissions.{" "}
          <span style={{ color: "var(--color-accent)" }}>
            A few hundred strings.
          </span>
        </h2>
        <p style={{ ...LEDE, maxWidth: "62ch" }}>
          The GitHub App asks for exactly{" "}
          <code className="dc-mono" style={CODE_EM}>
            Contents: write
          </code>{" "}
          and{" "}
          <code className="dc-mono" style={CODE_EM}>
            Pull requests: write
          </code>
          . No admin, no org-wide read, no workflow scope. It stores the
          artifact IDs your code matched and the repositories it saw them in —
          never file contents, never paths — opens one pull request per
          repository, serially, only against repositories it is installed in,
          and never reopens a pull request you have closed.
        </p>
      </section>

      <hr className="dc-hr" />

      {/* ── reporting ────────────────────────────────────────────────── */}
      <section className="dc-rv" style={{ padding: "70px 0 84px" }}>
        <div
          className="dc-card"
          style={{ maxWidth: 720, padding: "27.6px 28px" }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--color-accent)",
            }}
          >
            Reporting a vulnerability
          </span>
          <p style={{ fontSize: 14.5, lineHeight: "25px", color: MUTED }}>
            Open a private security advisory — please do not open a public issue
            for a vulnerability. Expect a first response within 72 hours. Fixes
            land on the latest release; please upgrade before reporting.
          </p>
          <div style={{ marginTop: 8 }}>
            <a
              target="_blank"
              rel="noopener"
              className="dc-btn dc-btn-primary"
              href={`${LINKS.repo}/security/advisories/new`}
              style={{ textDecoration: "none" }}
            >
              Open a private advisory
            </a>
          </div>
        </div>
      </section>
    </Column>
  );
}
