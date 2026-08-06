import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Mark } from "@/components/primitives";
import { GitHub, Npm } from "@/components/icons";
import { LINKS, SHOW_PRICING } from "@/lib/data";

/* ═══════════════════════════════════════════════════════════════════════
   The footer. Server component — nothing here moves.

   It sits outside .dc-col: the handoff gives it a full-bleed top hairline
   and its own 1200px inner box with no side rules, so the column's
   vertical edges stop where the page ends.
   ═══════════════════════════════════════════════════════════════════════ */

/* 74% ink, accent-700 on hover. Both states have to be utilities — an
   inline colour would outrank the hover rule. */
const LINK_CLASS =
  "dc-flink text-[14px] no-underline " +
  "text-[color:color-mix(in_srgb,var(--color-ink)_74%,transparent)] " +
  "hover:text-accent-700";

const HEADING: CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
  marginBottom: 5,
};

const COLUMN: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 9,
};

/** Repository files the footer points at that have no entry in LINKS. */
const MANIFEST_SPEC = `${LINKS.repo}/blob/main/spec/MANIFEST.md`;
const DATA_LICENSE = `${LINKS.repo}/blob/main/manifests/LICENSE.md`;
const ADVISORY = `${LINKS.repo}/security/advisories/new`;
const LICENSE = `${LINKS.repo}/blob/main/LICENSE`;

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={COLUMN}>
      <span style={HEADING}>{title}</span>
      {children}
    </div>
  );
}

export default function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--color-divider)",
        marginTop: 84,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "70px clamp(20px, 5vw, 72px) 56px",
        }}
      >
        {/* The handoff ships no footer breakpoint, and its five-track grid has
            a ~884px floor — below that the last columns are pushed off-screen
            and silently clipped by `body { overflow-x: hidden }`. Measured at
            390px it overflowed the page by 514px. Collapsing to two tracks,
            then one, is the smallest fix that keeps the desktop layout exactly
            as drawn. */}
        <div
          className="grid gap-x-[36px] gap-y-[42px] grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(130px,1fr))] max-[900px]:grid-cols-2 max-[520px]:grid-cols-1"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 19,
                lineHeight: 1,
              }}
            >
              <Mark size={20} />
              <span>driftcite</span>
            </span>
            <p
              style={{
                margin: "4px 0 0",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 23,
                lineHeight: 1.3,
                letterSpacing: "-0.015em",
                maxWidth: "15ch",
              }}
            >
              The API maintenance nobody should be doing by hand.
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: "21px",
                color: "color-mix(in srgb, var(--color-ink) 62%, transparent)",
                maxWidth: "24ch",
              }}
            >
              Every fact cites the provider who published it.
            </p>
          </div>

          <FooterColumn title="Product">
            <Link className={LINK_CLASS} href="/">
              Overview
            </Link>
            {/* Kept, not deleted — see SHOW_PRICING in lib/data.ts. */}
            {SHOW_PRICING && (
              <Link className={LINK_CLASS} href="/pricing">
                Pricing
              </Link>
            )}
            <Link className={LINK_CLASS} href="/changelog">
              Changelog
            </Link>
            <Link className={LINK_CLASS} href="/security">
              Security &amp; privacy
            </Link>
          </FooterColumn>

          <FooterColumn title="Documentation">
            <Link className={LINK_CLASS} href="/docs">
              Getting started
            </Link>
            <Link className={LINK_CLASS} href="/docs#ci">
              The GitHub Action
            </Link>
            <Link className={LINK_CLASS} href="/docs#app">
              The App
            </Link>
            <Link className={LINK_CLASS} href="/docs#cli">
              CLI reference
            </Link>
            <a target="_blank" rel="noopener" className={LINK_CLASS} href={MANIFEST_SPEC}>
              Manifest spec
            </a>
          </FooterColumn>

          <FooterColumn title="Coverage">
            <Link className={LINK_CLASS} href="/coverage">
              Providers
            </Link>
            <Link className={LINK_CLASS} href="/coverage#feed">
              The feed
            </Link>
            <Link className={LINK_CLASS} href="/coverage#add">
              Adding a provider
            </Link>
            <a target="_blank" rel="noopener" className={LINK_CLASS} href={DATA_LICENSE}>
              Data license
            </a>
          </FooterColumn>

          <FooterColumn title="Project">
            <a target="_blank" rel="noopener" className={LINK_CLASS} href={LINKS.repo}>
              GitHub
            </a>
            <a target="_blank" rel="noopener" className={LINK_CLASS} href={LINKS.npm}>
              npm
            </a>
            <a target="_blank" rel="noopener" className={LINK_CLASS} href={LINKS.contributing}>
              Contributing
            </a>
            <a target="_blank" rel="noopener" className={LINK_CLASS} href={ADVISORY}>
              Report a vulnerability
            </a>
            <a target="_blank" rel="noopener" className={LINK_CLASS} href={LICENSE}>
              License
            </a>
          </FooterColumn>
        </div>

        <hr className="dc-hr" style={{ margin: "52px 0 0" }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
            paddingTop: 16,
            fontSize: 12.5,
            color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
          }}
        >
          <span>© 2026 driftcite · Apache-2.0</span>
          <span>Runs on your machine. Nothing is uploaded. No account.</span>
          <span>The feed is public and free to read.</span>

          {/* The two places the project actually lives. Marks, not words:
              the column above already spells both out as links, and this row
              is the one that has to survive being glanced at. Each carries
              its own label for anyone who cannot see the glyph. */}
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              marginBlock: -8,
            }}
          >
            <a
              className="dc-social"
              href={LINKS.repo}
              target="_blank"
              rel="noopener"
              aria-label="driftcite on GitHub"
            >
              <GitHub size={17} />
            </a>
            <a
              className="dc-social"
              href={LINKS.npm}
              target="_blank"
              rel="noopener"
              aria-label="driftcite on npm"
            >
              <Npm size={17} />
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
