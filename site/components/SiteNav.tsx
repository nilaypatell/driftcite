"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/primitives";
import StarCount from "@/components/StarCount";
import { LINKS, SHOW_PRICING } from "@/lib/data";

/* ═══════════════════════════════════════════════════════════════════════
   The sticky header. Rendered once in app/layout.tsx, which is why it
   has to work out the active route for itself — usePathname() is the
   only reason this file is a client component. Everything else here is
   static markup; the star count brings its own client boundary.
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

export default function SiteNav() {
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
        className="dc-btn dc-btn-secondary whitespace-nowrap max-[430px]:hidden"
        href={LINKS.repo}
        style={{ gap: 8, textDecoration: "none" }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
        <span>GitHub</span>
        {/* the divider and its padding disappear with the count: StarCount
            renders a hidden <b> until a positive number comes back. */}
        <span
          className="max-[560px]:hidden [&:has(b[hidden])]:hidden"
          style={{
            borderLeft: "1px solid var(--color-divider)",
            paddingLeft: 9,
            fontFeatureSettings: "'tnum' 1",
          }}
        >
          <StarCount />
        </span>
      </a>

      <a
        className="dc-btn dc-btn-primary whitespace-nowrap"
        href={LINKS.app}
        style={{ textDecoration: "none" }}
      >
        Install the App
      </a>
    </nav>
  );
}
