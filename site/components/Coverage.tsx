import { Lede, Plate, Section, Tag, Wrap } from "@/components/primitives";
import { DEAD_IDENTIFIERS, PROVIDERS, TOTAL_ARTIFACTS } from "@/lib/data";

/* Section 04 — coverage. The source styled this with a `.prov` scope that
   globals.css deliberately does not carry, so the departures from `.dc-cell`
   live here. `.dc-cell` is unlayered CSS and therefore outranks anything in
   Tailwind's @layer utilities, so the two properties it already sets —
   padding and border — have to be overridden inline; everything it does not
   set is a plain utility. */
const CELL_PAD = { padding: "20px 24px" } as const;

/** The mono second line of a provider cell. */
const CLAIM =
  "mt-[6px] font-mono text-[11px] tracking-[0.4px] text-faint [&>b]:font-medium";

export default function Coverage() {
  return (
    <Section>
      <Wrap>
        <div className="dc-rv mx-auto mb-[38px] max-w-[42em] text-center">
          <Tag center>{TOTAL_ARTIFACTS} retired artifacts, each one sourced</Tag>
          <h2 className="dc-h2">Two ways in, both cited.</h2>
          <Lede className="mx-auto mt-[18px]">
            Seven providers publish a versioned OpenAPI spec, so retirements are
            read straight from the diff between two releases. Model shutdowns
            are never in a spec — they are prose in a docs page — so those are
            curated by hand and carry the URL they came from.
          </Lede>
        </div>

        <Plate className="dc-rv">
          <div className="dc-cells c4">
            {PROVIDERS.map((p) => (
              <div key={p.name} className="dc-cell" style={CELL_PAD}>
                <div className="text-[14.5px] font-medium">{p.name}</div>
                {"watched" in p ? (
                  <div className={`${CLAIM} [&>b]:text-dim`}>
                    <b>spec watched</b> · {p.watched}
                  </div>
                ) : (
                  <div className={`${CLAIM} [&>b]:text-live`}>
                    <b>{p.artifacts}</b> artifacts · {p.findings} found
                  </div>
                )}
              </div>
            ))}
            <div className="dc-cell" style={CELL_PAD}>
              <div className="text-[14.5px] font-medium">npm + PyPI</div>
              <div className={`${CLAIM} [&>b]:text-live`}>
                <b>every</b> package you pin
              </div>
            </div>
            <div
              className="dc-cell"
              style={{ ...CELL_PAD, background: "var(--l8)" }}
            >
              <div className="text-[14.5px] font-medium">Add a provider</div>
              <div className={`${CLAIM} [&>b]:text-live`}>
                <b>4 lines</b> in providers.yaml
              </div>
            </div>
          </div>
        </Plate>

        <Plate className="dc-rv mt-[18px]">
          <div className="dc-cell" style={{ border: "none", paddingBottom: 6 }}>
            <div className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-faint">
              Most-called dead identifiers in the corpus
            </div>
          </div>
          <div>
            {DEAD_IDENTIFIERS.map((d, i) => (
              <div
                key={d.prefix + d.id}
                className={`grid grid-cols-[1fr_auto] items-center gap-[16px] px-[26px] py-[11px] font-mono text-[12px] hover:bg-[var(--l8)] max-[560px]:px-[18px] max-[560px]:text-[11px] ${
                  i > 0 ? "border-t border-rule-1" : ""
                }`}
              >
                <span>
                  <span className="text-faint">{d.prefix}</span>
                  <span className="text-ink">{d.id}</span>
                </span>
                <span className="text-dim tabular-nums">{d.repos}</span>
              </div>
            ))}
          </div>
        </Plate>
      </Wrap>
    </Section>
  );
}
