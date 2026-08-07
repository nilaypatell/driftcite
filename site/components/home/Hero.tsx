import Link from "next/link";
import CopyCommand from "@/components/CopyCommand";
import SetupForAgents from "@/components/SetupForAgents";
import DaysSince from "@/components/DaysSince";
import { LINKS } from "@/lib/data";
import { daysSince } from "@/lib/format";
import { ArrowRight } from "@/components/icons";

/* The day text-davinci-003 stopped answering, per OpenAI's own page — the
   one date on the hero, so the one place its count is computed. It was a
   hardcoded "935" for a while, which on this site is self-parody; now the
   build stamps the day it ships and DaysSince keeps a long-lived tab true. */
const DAVINCI_DIED = "2024-01-04";
const DAYS_AT_BUILD = daysSince(DAVINCI_DIED);

/* The four decorative corner chips. Pure ornament — read by nobody, hidden
   below 980px by `.dc-hero-chip`, and each one a scrap of the scanner's own
   vocabulary rather than decoration for its own sake. */
const CHIPS: { text: string; pos: React.CSSProperties }[] = [
  { text: "[ exit 1 ]", pos: { top: 32, left: 8 } },
  { text: "[ BREAKING ]", pos: { top: 32, right: 8 } },
  { text: "[ .PR ]", pos: { bottom: 28, left: 8 } },
  { text: `[ +${DAYS_AT_BUILD} DAYS ]`, pos: { bottom: 28, right: 8 } },
];

const CHIP_BASE: React.CSSProperties = {
  position: "absolute",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.14em",
  color: "var(--color-neutral-500)",
  userSelect: "none",
};

/* Two rules the handoff carries in its own <style> block and that no `dc-*`
   class covers: the H1's tighter clamp below 980px, and the pill's hover
   border. Neither can be expressed as an inline style. */
const LOCAL_CSS = `
[data-hero-pill] {
  transition: border-color .18s ease, background-color .18s ease, box-shadow .3s ease;
}
[data-hero-pill]:hover {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 9%, transparent);
}
@media (max-width: 980px) {
  [data-hero-h1] { font-size: clamp(34px, 7vw, 56px) !important; }
}`;

export default function Hero() {
  return (
    <section
      data-stagger="100"
      style={{
        position: "relative",
        /* the ground and the haze drift a little; this keeps both inside
           the hero rather than over the bar above and the figure below */
        overflow: "hidden",
        padding: "96px 0 72px",
        textAlign: "center",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: LOCAL_CSS }} />

      {/* The ground and the haze, as layers rather than as a background on
          the section. A background paints with the element it belongs to and
          cannot lag behind the words sitting on it; these can, by a dozen
          pixels, which is the whole of the parallax here. */}
      <div className="dc-hero-grid" data-parallax="26" aria-hidden="true" />
      <div className="dc-hero-glow" data-parallax="-16" aria-hidden="true" />

      {CHIPS.map((chip) => (
        <span
          key={chip.text}
          className="dc-hero-chip"
          data-parallax="14"
          aria-hidden="true"
          style={{ ...CHIP_BASE, ...chip.pos }}
        >
          {chip.text}
        </span>
      ))}

      <Link
        href="/coverage"
        data-hero-pill=""
        className="dc-rise"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          letterSpacing: "0.02em",
          color: "var(--color-accent-800)",
          background: "var(--color-accent-100)",
          border:
            "1px solid color-mix(in srgb, var(--color-accent) 28%, transparent)",
          borderRadius: 999,
          padding: "6px 16px",
          textDecoration: "none",
          marginBottom: 28,
          transition: "border-color .15s ease",
        }}
      >
        {"text‑davinci‑003 died "}
        <DaysSince since={DAVINCI_DIED} initial={DAYS_AT_BUILD} />
        {" days ago"}
        <ArrowRight className="dc-arrow" size={14} />
      </Link>

      <h1
        data-hero-h1=""
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(38px, 4.8vw, 68px)",
          lineHeight: 1.08,
          letterSpacing: "-0.02em",
          margin: "0 auto",
          maxWidth: "13em",
        }}
      >
        <span style={{ display: "block" }}>Catch dead API calls</span>
        <span style={{ display: "block" }}>before your users do.</span>
      </h1>

      <p
        className="dc-rise"
        style={{
          fontSize: 17,
          lineHeight: "28px",
          maxWidth: "56ch",
          margin: "30px auto 0",
        }}
      >
        You should be shipping, not tracking which model a provider retired
        last quarter. driftcite reads your source for the API identifiers that
        are already dead — models, endpoints, parameters — and opens the pull
        request that replaces them, citing the provider that published the
        change.{" "}
        <a target="_blank" rel="noopener" href={LINKS.repo} style={{ color: "var(--color-accent-700)" }}>
          Free and open source.
        </a>
      </p>

      <div
        className="dc-rise"
        style={{
          display: "flex",
          gap: "var(--space-3)",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 33,
        }}
      >
        {/* Two funnels, not two designs for one. The App install needs a
            signed-in browser and a repository picker — an agent cannot do
            it — and the agent prompt cannot be clicked through by a human
            in a hurry. Every shipped precedent (Firecrawl, Clerk, Convex)
            keeps both; removing either closes a door. */}
        <a
          target="_blank"
          rel="noopener"
          className="dc-btn dc-btn-primary"
          href={LINKS.app}
          style={{ minHeight: 44, paddingInline: 24, fontSize: 15 }}
        >
          Start for free
        </a>
        <SetupForAgents />
        <CopyCommand />
        <span
          style={{
            flexBasis: "100%",
            textAlign: "center",
            fontSize: 13,
            color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
            marginTop: 4,
          }}
        >
          Runs on your machine · nothing uploaded · no account · Apache-2.0
        </span>
        <span
          style={{
            flexBasis: "100%",
            textAlign: "center",
            fontSize: 13,
            color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
          }}
        >
          Setup prompt works with Claude Code, Cursor, Codex and Copilot ·{" "}
          <a
            target="_blank"
            rel="noopener"
            href="/setup.md"
            style={{ color: "var(--color-accent-700)" }}
          >
            see what gets copied
          </a>
        </span>
      </div>
    </section>
  );
}
