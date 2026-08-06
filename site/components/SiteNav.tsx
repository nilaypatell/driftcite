"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/primitives";
import { GitHub } from "@/components/icons";
import { LINKS, SHOW_PRICING } from "@/lib/data";

/* ═══════════════════════════════════════════════════════════════════════
   The sticky header. Rendered once in app/layout.tsx, which is why it
   has to work out the active route for itself — usePathname() is the
   only reason this file is a client component. Everything else here is
   static markup, the star count included: it arrives as a prop the layout
   resolved at build, so the header has no state and cannot reflow.
   ═══════════════════════════════════════════════════════════════════════ */

/* `when` gates a link without deleting it: /pricing stays in the list and
   the page keeps building, it just isn't linked while paid tiers are off. */
const NAV: { href: string; label: string; when?: boolean }[] = [
  { href: "/docs", label: "Docs" },
  { href: "/coverage", label: "Coverage" },
  { href: "/pricing", label: "Pricing", when: SHOW_PRICING },
  { href: "/how-it-works", label: "How it works" },
  { href: "/changelog", label: "Changelog" },
].filter((item) => item.when !== false);

/* inherit the ink, take the accent on hover and on the current page —
   the hover/aria states cannot be inline, so they are utilities. */
const LINK_CLASS =
  "whitespace-nowrap text-[14px] text-inherit no-underline " +
  "hover:text-accent aria-[current=page]:text-accent max-[920px]:hidden";

export default function SiteNav({ stars }: { stars: number | null }) {
  const pathname = usePathname();
  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-6)",
        paddingTop: 15,
        paddingBottom: 15,
        paddingInline:
          "max(clamp(20px, 5vw, 72px), calc((100% - 1200px) / 2 + clamp(20px, 5vw, 72px)))",
        borderBottom: "1px solid var(--color-divider)",
        background: "color-mix(in srgb, var(--color-bg) 93%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <Link
        href="/"
        className="whitespace-nowrap"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 19,
          letterSpacing: "-0.01em",
          lineHeight: 1,
          color: "var(--color-ink)",
          textDecoration: "none",
          marginRight: "auto",
        }}
      >
        {/* the mark must not shrink when the row gets tight */}
        <span style={{ display: "flex", flex: "none" }}>
          <Mark size={20} />
        </span>
        <span>driftcite</span>
      </Link>

      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          data-navlink="1"
          aria-current={isCurrent(item.href) ? "page" : undefined}
          className={LINK_CLASS}
        >
          {item.label}
        </Link>
      ))}

      {/* The handoff sheds nav chrome as the viewport narrows — links at
          920px, the star count at 560px — but stops there, and below ~430px
          the GitHub button and the primary CTA still overflow the page by
          34px. Continuing the same pattern one step keeps the CTA, which is
          the one that matters. */}
      <a
        target="_blank"
        rel="noopener"
        className="dc-btn dc-btn-quiet whitespace-nowrap max-[430px]:hidden"
        href={LINKS.repo}
        style={{ gap: 9, textDecoration: "none" }}
        aria-label="driftcite on GitHub"
      >
        {/* the mark is the label — the word beside it said what the logo
            already said, twice, in a header with five other links */}
        <GitHub size={17} className="dc-gh-mark" />
        {stars === null ? null : (
          <span className="dc-stars">{stars.toLocaleString("en-US")}</span>
        )}
      </a>

      <a
        target="_blank"
        rel="noopener"
        className="dc-btn dc-btn-primary whitespace-nowrap"
        href={LINKS.app}
        style={{ textDecoration: "none" }}
      >
        Install the App
      </a>
    </nav>
  );
}
