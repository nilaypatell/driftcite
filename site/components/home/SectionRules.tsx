import type { CSSProperties } from "react";
import { Kicker, Ref } from "@/components/primitives";

/* 02 / 06 — The rules. The trust model, in three hairline-ruled columns:
   cited, dated against today, and it refuses to guess. */

const h2: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "clamp(26px, 3vw, 40px)",
  lineHeight: 1.12,
  letterSpacing: "-0.02em",
  marginTop: 16,
};

const h3: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: 20,
  lineHeight: "26px",
  letterSpacing: "-0.015em",
};

const body: CSSProperties = {
  fontSize: 15,
  lineHeight: "26px",
  color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
  marginTop: 16,
};

export default function SectionRules() {
  return (
    <>
      <section style={{ padding: "84px 0" }}>
        <div className="dc-rv">
          <Kicker n={2} label="The rules" twin="The trust model" />
          <h2 style={h2}>
            Cited, dated, and it{" "}
            <span style={{ color: "var(--color-accent)" }}>never guesses.</span>
          </h2>
        </div>

        <div className="dc-cols3 dc-rv" style={{ gap: "42px 34px", marginTop: 48 }}>
          <div>
            <h3 style={h3}>Every fact cites the provider</h3>
            <p style={body}>
              A manifest asserts, the scanner locates, and no language model sits
              anywhere in the detection path. When driftcite says Stripe removed
              an endpoint, the finding links to Stripe&#8217;s own git compare.
              <Ref n={3} /> Verify it in one click. You should not have to trust
              us.
            </p>
          </div>
          <div>
            <h3 style={h3}>Severity is computed against today</h3>
            <p style={body}>
              An entry reading &#8220;deprecated, retires 2026-10-23&#8221; is a
              countdown, not a footnote, and becomes retired the moment that date
              passes. Findings sort by how long you have left:{" "}
              <i>breaks in 88 days</i> before, <i>died 935 days ago</i> after. No
              dependency tool has a field for time remaining.
            </p>
          </div>
          <div>
            <h3 style={h3}>It refuses to guess</h3>
            <p style={body}>
              Only replacements the provider itself named are applied, inside the
              quoting your code already uses. Comment lines are never edited.
              Anything needing judgment is reported and left alone, out loud:{" "}
              <i>the provider named no replacement.</i>
            </p>
          </div>
        </div>
      </section>

      <hr className="dc-hr" />
    </>
  );
}
