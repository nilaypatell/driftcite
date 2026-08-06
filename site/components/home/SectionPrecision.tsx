import type { CSSProperties } from "react";
import { Kicker } from "@/components/primitives";
import { PRECISION, TOTAL_ARTIFACTS } from "@/lib/data";
import { ArrowRight } from "@/components/icons";

/* 05 / 06 — Signal over noise. 86 findings, a quarter of them real, struck
   through and replaced by 5 that are all real. A tool that cries wolf is a
   tool you mute. */

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

const numeral: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "clamp(54px, 5.6vw, 80px)",
  lineHeight: 1,
  fontFeatureSettings: "'tnum' 1",
};

const caption: CSSProperties = {
  fontSize: 13,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
  marginTop: 12,
};

export default function SectionPrecision() {
  return (
    <>
      <section style={{ padding: "84px 0" }}>
        <div className="dc-rv">
          <Kicker n={5} label="Signal over noise" twin="No noise" />
          <h2 style={h2}>
            <span style={{ color: "var(--color-accent)" }}>Precision</span> is the
            product.
          </h2>
          <p style={lede}>
            The first version reported {PRECISION.before} findings on a real
            1,200-dependency repository, and roughly a quarter were real &#8212;
            the parameter{" "}
            <code className="dc-mono" style={{ fontSize: "0.88em" }}>
              refund
            </code>{" "}
            was matching inside <i>refunded</i>. Every artifact kind now matches
            only in the shape it takes when actually sent to a provider. A tool
            that is wrong three times out of four gets muted, then deleted.
          </p>
        </div>

        <div
          className="dc-rv"
          style={{
            display: "flex",
            gap: 48,
            alignItems: "baseline",
            flexWrap: "wrap",
            marginTop: 44,
          }}
        >
          <div>
            <p
              style={{
                ...numeral,
                color: "color-mix(in srgb, var(--color-ink) 42%, transparent)",
                textDecoration: "line-through",
                textDecorationColor: "#C4331D",
                textDecorationThickness: 3,
              }}
            >
              {PRECISION.before}
            </p>
            <p style={caption}>findings &#183; ~25% true</p>
          </div>

          {/* the 86 → 5 connector. Not a link, so no hover nudge and no
              .dc-arrow — just the same mark at figure scale. */}
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              color: "color-mix(in srgb, var(--color-ink) 35%, transparent)",
            }}
          >
            <ArrowRight size={34} />
          </span>

          <div>
            <p style={{ ...numeral, color: "var(--color-accent)" }}>
              {PRECISION.after}
            </p>
            <p style={caption}>findings &#183; 100% true</p>
          </div>

          <p
            style={{
              fontSize: 14,
              lineHeight: "24px",
              color: "color-mix(in srgb, var(--color-ink) 62%, transparent)",
              maxWidth: "34ch",
            }}
          >
            Growing from 29 artifacts to {TOTAL_ARTIFACTS} since then has produced
            zero new false findings across nine real repositories. Coverage is
            worthless if it arrives with noise.
          </p>
        </div>
      </section>

      <hr className="dc-hr" />
    </>
  );
}
