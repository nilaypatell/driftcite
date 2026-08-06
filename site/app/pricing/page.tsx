import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Column } from "@/components/primitives";
import { LINKS } from "@/lib/data";

/* Kept out of the index as well as out of the sitemap: the page builds and
   is reachable by URL, but while SHOW_PRICING is off nothing links to it and
   none of the tiers on it can actually be bought yet. */
export const metadata: Metadata = {
  ...pageMeta({
    path: "/pricing",
    title: "Pricing",
    description:
      "Per-org flat, never per-seat. The scanner, the Action and the feed are open source and free, forever. Paid tiers buy the hosted watch: private repositories, feed freshness, and the pull request that just arrives.",
  }),
  robots: { index: false, follow: true },
};

/* ═══════════════════════════════════════════════════════════════════════
   THE LAUNCH FLAG.

   The handoff's README lists "pricing paid-tiers visibility" as a
   build-time page flag and says the paid tiers sit behind it *until
   launch* — hosted-watch billing is not live, so quoting $99 / $499 / $16k
   today would be selling something nobody can buy yet. pricing.dc.html
   carries no `sc-if` of its own, so there is no prototype default to
   inherit; the README's "until launch" is the only signal, and we have not
   launched. Hence false.

   The markup below is complete and signed off. On launch day this becomes
   `true` and the full four-card grid returns — nothing else changes.
   ═══════════════════════════════════════════════════════════════════════ */
const SHOW_PAID_TIERS = false;

/* The two media queries and the <details> marker the handoff page carries in
   its own <style> block. They are page-local behaviour, not design tokens,
   so they live here rather than in globals.css (which this page must not
   edit). `!important` mirrors the handoff: it overrides the inline
   grid-template-columns, exactly as the prototype does. */
const PAGE_CSS = `
[data-tiers]:not([data-tiers="1"]) { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 1080px) {
  [data-tiers]:not([data-tiers="1"]) { grid-template-columns: repeat(2, 1fr) !important; }
}
@media (max-width: 640px) {
  [data-tiers]:not([data-tiers="1"]) { grid-template-columns: 1fr !important; }
}
details[data-faq] summary::-webkit-details-marker { display: none; }
details[data-faq] summary::after {
  content: "+";
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--color-accent-700);
  margin-left: auto;
  padding-left: 20px;
}
details[data-faq][open] summary::after { content: "\\2212"; }
details[data-faq] summary:hover { color: var(--color-accent-700); }
`;

type Tier = {
  name: string;
  /** false only for the open-source tier, which always renders. */
  paid: boolean;
  blurb: string;
  price: string;
  cadence: string;
  features: readonly string[];
  cta: { label: string; href: string; primary?: boolean; internal?: boolean };
  recommended?: boolean;
};

const TIERS: readonly Tier[] = [
  {
    name: "Free",
    paid: false,
    blurb: "Everything a public codebase needs.",
    price: "$0",
    cadence: "forever",
    features: [
      "Unlimited public repositories",
      "Unlimited local CLI",
      "Keyless feed, daily refresh",
      "3 private repositories",
      "Findings only",
    ],
    cta: { label: "Start scanning", href: "/docs", internal: true },
  },
  {
    name: "Team",
    paid: true,
    recommended: true,
    blurb: "The watch, for one organization.",
    price: "$99",
    cadence: "per month, per org · unlimited seats",
    features: [
      "25 private repositories",
      "Hourly feed refresh",
      "Pull-request generation",
      "Everything in Free",
    ],
    cta: { label: "Install the App", href: LINKS.app, primary: true },
  },
  {
    name: "Business",
    paid: true,
    blurb: "For fleets of repositories.",
    price: "$499",
    cadence: "per month, per org · unlimited seats",
    features: [
      "200 private repositories",
      "5-minute feed refresh",
      "SSO",
      "Organization-wide rollup",
    ],
    cta: { label: "Install the App", href: LINKS.app },
  },
  {
    name: "Enterprise",
    paid: true,
    blurb: "Behind your own walls.",
    price: "$16k",
    cadence: "from, per year",
    features: [
      "Self-hosted",
      "Private manifests for your own internal APIs",
      "Everything in Business",
    ],
    cta: { label: "Open a conversation", href: `${LINKS.repo}/issues` },
  },
];

const MUTED_78 = "color-mix(in srgb, var(--color-ink) 78%, transparent)";
const MUTED_62 = "color-mix(in srgb, var(--color-ink) 62%, transparent)";
const MUTED_55 = "color-mix(in srgb, var(--color-ink) 55%, transparent)";

const KICKER: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--color-neutral-600)",
  marginBottom: 16,
};

const SUMMARY: CSSProperties = {
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  listStyle: "none",
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: 17,
  padding: "16px 0",
};

const ANSWER: CSSProperties = {
  fontSize: 15,
  lineHeight: "26px",
  color: MUTED_78,
  margin: "0 0 20px",
  maxWidth: "60ch",
};

export default function Pricing() {
  const tiers = TIERS.filter((t) => SHOW_PAID_TIERS || !t.paid);
  const alone = tiers.length === 1;

  return (
    <Column>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      <header
        className="dc-rise"
        data-stagger
        style={{ padding: "70px 0 24px", textAlign: "center" }}
      >
        <span className="dc-mono dc-rise" style={KICKER}>
          [ Pricing ]
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
          Per-org flat. Never per-seat.
        </h1>
        <p
          className="dc-rise"
          style={{
            fontSize: 16.5,
            lineHeight: "28px",
            color: MUTED_78,
            maxWidth: "58ch",
            margin: "20px auto 0",
          }}
        >
          The scanner, the Action and the feed are open source and free,
          forever. Paid tiers buy the hosted watch: private repositories, feed
          freshness, and the pull request that just arrives. Unlimited seats at
          every tier.
        </p>
      </header>

      <section style={{ padding: "42px 0 28px" }}>
        <div
          className="dc-rv"
          data-tiers={tiers.length}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${tiers.length}, 1fr)`,
            gap: 22,
            alignItems: "stretch",
            /* A lone open-source card would stretch the full 1056px column,
               so it keeps a card's width and centres under the centred
               header. Nothing else about the card changes. */
            ...(alone ? { maxWidth: 320, margin: "0 auto" } : null),
          }}
        >
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className="dc-card"
              style={{
                padding: "27.6px 24px",
                gap: 0,
                ...(tier.recommended
                  ? { borderColor: "var(--color-accent)" }
                  : null),
              }}
            >
              {tier.recommended ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <h3 style={{ fontWeight: 600, fontSize: 19 }}>{tier.name}</h3>
                  <span className="dc-tag dc-tag-accent">Recommended</span>
                </div>
              ) : (
                <h3 style={{ fontWeight: 600, fontSize: 19 }}>{tier.name}</h3>
              )}

              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 13,
                  lineHeight: "20px",
                  color: MUTED_62,
                }}
              >
                {tier.blurb}
              </p>

              <p
                className="tnum"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 38,
                  lineHeight: 1,
                  margin: "24px 0 4px",
                }}
              >
                {tier.price}
              </p>
              <p style={{ fontSize: 12, color: MUTED_55, margin: "0 0 20px" }}>
                {tier.cadence}
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                  fontSize: 13.5,
                  lineHeight: "20px",
                  color: MUTED_78,
                  flex: 1,
                }}
              >
                {tier.features.map((f) => (
                  <span key={f}>{f}</span>
                ))}
              </div>

              {tier.cta.internal ? (
                <Link
                  className="dc-btn dc-btn-secondary"
                  href={tier.cta.href}
                  style={{ width: "100%", marginTop: 24 }}
                >
                  {tier.cta.label}
                </Link>
              ) : (
                <a
                  target="_blank"
                  rel="noopener"
                  className={`dc-btn ${
                    tier.cta.primary ? "dc-btn-primary" : "dc-btn-secondary"
                  }`}
                  href={tier.cta.href}
                  style={{ width: "100%", marginTop: 24 }}
                >
                  {tier.cta.label}
                </a>
              )}
            </div>
          ))}
        </div>

        <p
          style={{
            fontSize: 13.5,
            lineHeight: "22px",
            color: MUTED_55,
            margin: "24px 0 0",
            textAlign: "center",
          }}
        >
          Three independent payment triggers: a private repository, feed
          freshness, or an automated pull request. Everything that reads your
          code is Apache-2.0 and runs where you can read it.
        </p>
      </section>

      <hr className="dc-hr" style={{ margin: "42px 0 0" }} />

      <section
        className="dc-rv"
        style={{ padding: "70px 0 28px", maxWidth: 760, margin: "0 auto" }}
      >
        <span className="dc-mono" style={KICKER}>
          Questions
        </span>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(24px, 2.6vw, 34px)",
            lineHeight: 1.12,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
          }}
        >
          Asked often, answered plainly.
        </h2>

        <details
          data-faq="1"
          style={{
            borderTop: "1px solid var(--color-divider)",
            padding: "4px 0",
          }}
        >
          <summary style={SUMMARY}>Is driftcite free?</summary>
          <p style={ANSWER}>
            The CLI, the GitHub Action and the drift feed are free and open
            source — Apache-2.0, no account, no key. Paid tiers exist only for
            the hosted watch: more private repositories, a fresher feed, and
            pull requests opened for you.
          </p>
        </details>

        <details
          data-faq="1"
          style={{
            borderTop: "1px solid var(--color-divider)",
            padding: "4px 0",
          }}
        >
          <summary style={SUMMARY}>Do you ever see my code?</summary>
          <p style={ANSWER}>
            No, at any tier. The scan runs on your machine or in your CI. The
            hosted watch stores only the artifact IDs your code matched — a few
            hundred strings, never files. The full accounting is on the{" "}
            <Link href="/security" style={{ color: "var(--color-accent-700)" }}>
              security page
            </Link>
            .
          </p>
        </details>

        <details
          data-faq="1"
          style={{
            borderTop: "1px solid var(--color-divider)",
            padding: "4px 0",
          }}
        >
          <summary style={SUMMARY}>
            Why flat per organization instead of per seat?
          </summary>
          <p style={ANSWER}>
            A drift check protects a codebase, not a person — charging per
            developer punishes exactly the teams that adopt it widely. The tools
            that sold dependency automation per seat are gone; we priced around
            their grave, deliberately.
          </p>
        </details>

        <details
          data-faq="1"
          style={{
            borderTop: "1px solid var(--color-divider)",
            padding: "4px 0",
          }}
        >
          <summary style={SUMMARY}>What exactly do the paid tiers add?</summary>
          <p style={ANSWER}>
            Private repositories beyond the free three, feed refresh measured in
            minutes instead of days, and the automated pull request — opened
            with the provider’s own citation when something you call is retired.
            Nothing about detection quality is paywalled.
          </p>
        </details>

        <details
          data-faq="1"
          style={{
            borderTop: "1px solid var(--color-divider)",
            padding: "4px 0",
          }}
        >
          <summary style={SUMMARY}>Can I self-host the whole thing?</summary>
          <p style={ANSWER}>
            The scanner already runs entirely on your hardware — that part needs
            no permission. Enterprise adds a self-hosted watch and private
            manifests for your own internal APIs, so retirements you publish
            inside your company get the same treatment Stripe’s get.
          </p>
        </details>

        <details
          data-faq="1"
          style={{
            borderTop: "1px solid var(--color-divider)",
            padding: "4px 0",
          }}
        >
          <summary style={SUMMARY}>What is the license on the feed?</summary>
          <p style={ANSWER}>
            Free to read, use, redistribute and research. The one restriction:
            not for repackaging as a competing feed. The scanner is Apache-2.0
            because we want it embedded everywhere; the work that has to be
            redone every single day is the feed, so that is where the
            restriction sits.
          </p>
        </details>

        <details
          data-faq="1"
          style={{
            borderTop: "1px solid var(--color-divider)",
            borderBottom: "1px solid var(--color-divider)",
            padding: "4px 0",
          }}
        >
          <summary style={SUMMARY}>What happens if I stop paying?</summary>
          <p style={ANSWER}>
            The CLI, the Action and the daily feed keep working — they were
            never behind the meter. You lose the hosted extras: the watch, the
            automated PRs, and the private-repo allowance above the free three.
          </p>
        </details>
      </section>
    </Column>
  );
}
