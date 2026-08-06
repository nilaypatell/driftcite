import Link from "next/link";
import CopyCommand from "@/components/CopyCommand";
import { LINKS } from "@/lib/data";
import { ArrowRight } from "@/components/icons";

/* The four decorative corner chips. Pure ornament — read by nobody, hidden
   below 980px by `.dc-hero-chip`, and each one a scrap of the scanner's own
   vocabulary rather than decoration for its own sake. */
const CHIPS: { text: string; pos: React.CSSProperties }[] = [
  { text: "[ exit 1 ]", pos: { top: 32, left: 8 } },
  { text: "[ BREAKING ]", pos: { top: 32, right: 8 } },
  { text: "[ .PR ]", pos: { bottom: 28, left: 8 } },
  { text: "[ +935 DAYS ]", pos: { bottom: 28, right: 8 } },
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
[data-hero-pill]:hover { border-color: var(--color-accent); }
@media (max-width: 980px) {
  [data-hero-h1] { font-size: clamp(34px, 7vw, 56px) !important; }
}`;

export default function Hero() {
  return (
    <section
      data-stagger="100"
      style={{
        position: "relative",
        padding: "96px 0 72px",
        textAlign: "center",
        background:
          "radial-gradient(circle at 1px 1px, var(--color-neutral-300) 1px, transparent 0) 0 0 / 26px 26px",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: LOCAL_CSS }} />

      {CHIPS.map((chip) => (
        <span
          key={chip.text}
          className="dc-hero-chip"
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
        {"text‑davinci‑003 died 935 days ago"}
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
        Providers retire endpoints, parameters and models — and your lockfile
        never moves, so no dependency tool notices. driftcite reads your call
        sites, finds what already stopped working, and opens the pull request
        that fixes it.{" "}
        <a href={LINKS.repo} style={{ color: "var(--color-accent-700)" }}>
          It’s all open source.
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
        <a
          className="dc-btn dc-btn-primary"
          href={LINKS.app}
          style={{ minHeight: 44, paddingInline: 24, fontSize: 15 }}
        >
          Start for free
        </a>
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
      </div>
    </section>
  );
}
