import type { CSSProperties } from "react";
import { Kicker } from "@/components/primitives";
import { TOTAL_ARTIFACTS } from "@/lib/data";

/* 06 / 06 — The comparison. Not a scoreboard: a different layer. Lockfiles
   do not move when a provider deletes an endpoint, so no manifest reader
   can ever see this. The driftcite column carries the accent tint. */

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

const TINT = "color-mix(in srgb, var(--color-accent-100) 55%, transparent)";

/** the driftcite column: tinted, and its type takes the deep accent */
const ours: CSSProperties = { background: TINT, color: "var(--color-accent-800)" };

/** the row label column */
const label: CSSProperties = {
  color: "color-mix(in srgb, var(--color-ink) 70%, transparent)",
};

/** an em dash standing in for "it cannot see this" */
const none: CSSProperties = {
  color: "color-mix(in srgb, var(--color-ink) 38%, transparent)",
};

export default function SectionComparison() {
  return (
    <>
      <section style={{ padding: "84px 0" }}>
        <div className="dc-rv">
          <Kicker n={6} label="The comparison" twin="vs. Dependabot" />
          <h2 style={h2}>
            A <span style={{ color: "var(--color-accent)" }}>different layer</span>{" "}
            than Dependabot.
          </h2>
          <p style={lede}>
            Nothing against either tool &#8212; they watch a different layer. Your
            lockfile does not move when a provider removes an endpoint or shuts
            down a model. Every dependency tool reads manifests, so every
            dependency tool is blind to this by construction.
          </p>
        </div>

        <div className="dc-rv" style={{ overflowX: "auto", marginTop: 44 }}>
          <table className="dc-table" style={{ maxWidth: 880, minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ width: "34%" }} />
                <th>Dependabot</th>
                <th>npm audit</th>
                <th style={ours}>driftcite</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={label}>What it reads</td>
                <td>Manifests, lockfiles</td>
                <td>Advisory database</td>
                <td style={{ background: TINT }}>Your call sites</td>
              </tr>
              <tr>
                <td style={label}>
                  Hosted API drift &#8212; removed endpoints, dead models
                </td>
                <td style={none}>&#8212;</td>
                <td style={none}>&#8212;</td>
                <td style={ours}>
                  &#10003;&#8202; {TOTAL_ARTIFACTS} artifacts, ten providers
                </td>
              </tr>
              <tr>
                <td style={label}>Time remaining as a first-class field</td>
                <td style={none}>&#8212;</td>
                <td style={none}>&#8212;</td>
                <td style={ours}>&#10003;&#8202; &#8220;breaks in 88 days&#8221;</td>
              </tr>
              <tr>
                <td style={label}>Evidence link on every finding</td>
                <td style={none}>&#8212;</td>
                <td>Advisory page</td>
                <td style={ours}>&#10003;&#8202; the provider&#8217;s own page</td>
              </tr>
              <tr>
                <td style={label}>Opens the fixing PR</td>
                <td>&#10003;&#8202; version bumps</td>
                <td style={none}>&#8212;</td>
                <td style={ours}>&#10003;&#8202; the swap the provider named</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <hr className="dc-hr" />
    </>
  );
}
