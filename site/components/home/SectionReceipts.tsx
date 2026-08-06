import type { CSSProperties } from "react";
import { Kicker, Ref } from "@/components/primitives";
import { LINKS } from "@/lib/data";
import { ArrowRight } from "@/components/icons";

/* 04 / 06 — Exhibit. A real pull request the App opened with nobody
   watching: four files, three providers, every swap the provider's own. */

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

const line: CSSProperties = { whiteSpace: "pre" };

const path: CSSProperties = {
  ...line,
  color: "var(--color-term-faint)",
};

const removed: CSSProperties = {
  ...line,
  color: "var(--color-term-break)",
  background: "color-mix(in srgb, var(--color-term-break) 9%, transparent)",
};

const added: CSSProperties = {
  ...line,
  color: "var(--color-term-ok)",
  background: "color-mix(in srgb, var(--color-term-ok) 9%, transparent)",
};

export default function SectionReceipts() {
  return (
    <>
      <section style={{ padding: "84px 0" }}>
        <div className="dc-rv">
          <Kicker n={4} label="Exhibit" twin="A real PR" />
          <h2 style={h2}>
            <span style={{ color: "var(--color-accent)" }}>Receipts,</span> not
            promises.
          </h2>
          <p style={lede}>
            A real pull request the App opened, unattended, on August 5, 2026.
            <Ref n={4} /> Three providers&#8217; dead models, four files, every
            change carrying the provider&#8217;s own page.
          </p>
        </div>

        <figure className="dc-rv" style={{ marginTop: 44 }}>
          <div className="dc-term" style={{ maxWidth: 820 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 18px",
                borderBottom: "1px solid var(--color-term-rule)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 26,
                  height: 26,
                  border: "1px solid var(--color-term-border)",
                  borderRadius: "50%",
                  fontFamily: "var(--font-display)",
                  fontSize: 15,
                  color: "var(--color-term-prompt)",
                }}
              >
                &#8224;
              </span>
              <span
                style={{ fontSize: 13.5, color: "var(--color-term-muted)" }}
              >
                <b style={{ fontWeight: 600, color: "var(--color-term-text)" }}>
                  driftcite[bot]
                </b>{" "}
                opened this pull request
              </span>
              <span
                className="dc-mono"
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  border: "1px solid var(--color-term-border)",
                  borderRadius: 20,
                  padding: "2px 10px",
                  color: "var(--color-term-label)",
                }}
              >
                bot
              </span>
            </div>

            <div
              className="dc-mono"
              style={{
                fontSize: 12.5,
                lineHeight: 1.85,
                padding: "16px 20px",
                overflowX: "auto",
              }}
            >
              <div style={path}>
                underthesea/agent/providers/anthropic_provider.py
              </div>
              <div style={removed}>
                {'- DEFAULT_MODEL = "claude-sonnet-4-20250514"'}
              </div>
              <div style={added}>{'+ DEFAULT_MODEL = "claude-sonnet-5"'}</div>
              <div style={{ ...path, marginTop: 12 }}>
                tests/agent/test_providers.py
              </div>
              <div style={removed}>
                {'- self.assertEqual(p.model, "gemini-2.0-flash")'}
              </div>
              <div style={added}>
                {'+ self.assertEqual(p.model, "gemini-3.5-flash")'}
              </div>
            </div>

            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid var(--color-term-rule)",
                fontSize: 13,
                color: "var(--color-term-label)",
              }}
            >
              fix: update API identifiers retired by their providers &#183;{" "}
              <a
                href={LINKS.pr}
                style={{
                  color: "var(--color-term-prompt)",
                  textDecoration: "none",
                }}
              >
                see the PR itself<ArrowRight className="dc-arrow" size={14} />
              </a>
            </div>
          </div>

          <figcaption
            style={{
              fontSize: 12.5,
              lineHeight: "20px",
              marginTop: 12,
              color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
              maxWidth: "60ch",
            }}
          >
            <span
              style={{
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontSize: 11,
                color: "var(--color-accent-700)",
              }}
            >
              Fig. 2
            </span>{" "}
            &#8212; authored, pushed and opened by the App with no human in the
            loop. It fixes what it is certain about and refuses the rest out loud.
          </figcaption>
        </figure>
      </section>

      <hr className="dc-hr" />
    </>
  );
}
