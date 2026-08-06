import { Ref } from "@/components/primitives";
import { CORPUS, TOTAL_ARTIFACTS } from "@/lib/data";

const VALUE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "clamp(34px, 3.4vw, 46px)",
  lineHeight: 1.1,
  fontFeatureSettings: "'tnum' 1",
  margin: 0,
};

const LABEL: React.CSSProperties = {
  fontSize: 13,
  lineHeight: "19px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "color-mix(in srgb, var(--color-ink) 70%, transparent)",
  margin: "12px 0 0",
  maxWidth: "22ch",
};

/* The 2×2 fallback the handoff carries in its own <style> block. `dc-cols3`
   is the wrong grid here — this band is four auto columns pushed apart, not
   three equal ones — so the breakpoint has to be stated locally. */
const LOCAL_CSS = `
@media (max-width: 980px) {
  [data-stats] {
    grid-template-columns: repeat(2, 1fr) !important;
    justify-content: start !important;
  }
}`;

/**
 * The corpus in four figures. Every one is read out of `lib/data.ts`.
 *
 * The band carries the hairline above and below it: in the handoff this is
 * the one place two rules land back to back — closing the figure and opening
 * chapter 01 — and neither neighbour owns them.
 */
export default function Stats() {
  return (
    <>
      <hr className="dc-hr" />

      <section
        aria-label="The corpus, by the numbers"
        style={{ padding: "70px 0" }}
      >
        <style dangerouslySetInnerHTML={{ __html: LOCAL_CSS }} />

        <div
          data-stats=""
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, auto)",
            justifyContent: "space-between",
            gap: "42px 28px",
          }}
        >
          <div>
            <p style={{ ...VALUE, color: "var(--color-accent)" }}>
              <span data-count={CORPUS.sharePct}>{CORPUS.sharePct}</span>%
              <span
                style={{ fontFamily: "var(--font-body)", fontSize: "0.42em" }}
              >
                <Ref n={2} />
              </span>
            </p>
            <p style={{ ...LABEL, maxWidth: "24ch" }}>
              of scanned repositories call an API that is already dead
            </p>
          </div>

          <div>
            <p style={VALUE}>
              <span data-count={CORPUS.scanned}>{CORPUS.scanned}</span>
            </p>
            <p style={LABEL}>public repositories scanned, July 2026</p>
          </div>

          <div>
            <p style={VALUE}>
              <span data-count={CORPUS.breaking}>
                {CORPUS.breaking.toLocaleString("en-US")}
              </span>
            </p>
            <p style={LABEL}>breaking call sites found</p>
          </div>

          <div>
            <p style={VALUE}>
              <span data-count={TOTAL_ARTIFACTS}>{TOTAL_ARTIFACTS}</span>
            </p>
            <p style={LABEL}>artifacts under daily watch, twelve providers</p>
          </div>
        </div>
      </section>

      <hr className="dc-hr" />
    </>
  );
}
