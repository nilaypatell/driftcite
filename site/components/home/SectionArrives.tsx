import type { CSSProperties } from "react";
import Link from "next/link";
import { Kicker } from "@/components/primitives";
import { LINKS, TOTAL_ARTIFACTS } from "@/lib/data";

/* 03 / 06 — How it arrives. Three rungs of the same ladder: the CLI, the
   Action, the App. The third is the product, so it is the one wearing the
   accent border and the pill. */

const h2: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "clamp(26px, 3vw, 40px)",
  lineHeight: 1.12,
  letterSpacing: "-0.02em",
  marginTop: 16,
};

const lede: CSSProperties = {
  fontSize: 16.5,
  lineHeight: "28px",
  color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
  maxWidth: "62ch",
  marginTop: 20,
};

const card: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  padding: "27.6px 24px 24px",
  gap: 12,
};

const corner: CSSProperties = {
  position: "absolute",
  top: 20,
  right: 20,
  fontWeight: 500,
  fontSize: 13,
  color: "var(--color-neutral-400)",
  pointerEvents: "none",
};

const cardTitle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: 18,
  lineHeight: 1.25,
};

const cardBody: CSSProperties = {
  fontSize: 14,
  lineHeight: "24px",
  color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
  flex: 1,
};

const snippet: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.6,
  background: "var(--color-neutral-100)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-sm)",
  padding: "11px 14px",
  marginTop: 4,
  overflowX: "auto",
};

const arrow: CSSProperties = {
  fontSize: 14,
  color: "var(--color-accent-700)",
  textDecoration: "none",
  marginTop: 4,
};

const AUTOFIX = `${LINKS.repo}/blob/main/.github/workflows/driftcite-autofix.yml`;

export default function SectionArrives() {
  return (
    <>
      <section style={{ padding: "84px 0" }}>
        <div className="dc-rv">
          <Kicker n={3} label="How it arrives" twin="Developer first" />
          <h2 style={h2}>
            Start scanning{" "}
            <span style={{ color: "var(--color-accent)" }}>today.</span>
          </h2>
          <p style={lede}>
            One command to try it. One step for CI. One install for the pull
            request that just arrives.
          </p>
        </div>

        <div
          className="grid grid-cols-3 max-[980px]:grid-cols-1 dc-rv"
          style={{ gap: 22, marginTop: 48 }}
        >
          <div className="dc-card" style={card}>
            <span className="dc-mono" aria-hidden="true" style={corner}>
              01
            </span>
            <h3 style={cardTitle}>Scan, right now</h3>
            <p style={cardBody}>
              Zero dependencies, nothing leaves your machine, no account. Ten
              providers, {TOTAL_ARTIFACTS} retired artifacts, plus every npm and
              PyPI package your lockfiles pin.
            </p>
            <pre className="dc-mono" style={snippet}>
              npx driftcite .
            </pre>
            <Link href="/docs" style={arrow}>
              Getting started &#8594;
            </Link>
          </div>

          <div className="dc-card" style={card}>
            <span className="dc-mono" aria-hidden="true" style={corner}>
              02
            </span>
            <h3 style={cardTitle}>Fail the build on drift</h3>
            <p style={cardBody}>
              One step in CI. Exit 1 on breaking findings, evidence links in the
              job summary, and a baseline file so day-one debt does not drown you.
            </p>
            <pre className="dc-mono" style={snippet}>
              - uses: nilaypatell/driftcite@main
            </pre>
            <Link href="/docs#ci" style={arrow}>
              The Action &#8594;
            </Link>
          </div>

          <div
            className="dc-card"
            style={{ ...card, borderColor: "var(--color-accent)" }}
          >
            <span
              className="dc-mono"
              aria-hidden="true"
              style={{ ...corner, color: "var(--color-accent)" }}
            >
              03
            </span>
            <div>
              <span className="dc-tag dc-tag-accent">The product</span>
            </div>
            <h3 style={cardTitle}>The PR just arrives</h3>
            <p style={cardBody}>
              Install the App. When a provider retires something your code calls,
              a pull request shows up with the swap the provider itself named
              &#8212; and its citation. Two permissions. It stores artifact IDs,
              never your code.
            </p>
            <pre className="dc-mono" style={snippet}>
              github.com/apps/driftcite
            </pre>
            <a href={LINKS.app} style={arrow}>
              Install &#8594;
            </a>
          </div>
        </div>

        <p
          style={{
            fontSize: 13.5,
            lineHeight: "22px",
            color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
            marginTop: 20,
          }}
        >
          Prefer to keep it entirely in your own CI? Copy{" "}
          <a href={AUTOFIX} style={{ color: "var(--color-accent-700)" }}>
            <code className="dc-mono" style={{ fontSize: 12 }}>
              driftcite-autofix.yml
            </code>
          </a>{" "}
          into your workflows &#8212; the same pull request, opened from inside
          your repository.
        </p>
      </section>

      <hr className="dc-hr" />
    </>
  );
}
