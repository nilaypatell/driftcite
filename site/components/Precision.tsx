import type { ReactNode } from "react";
import { Cite, Lede, Plate, Section, Tag, Wrap } from "@/components/primitives";
import { PRECISION } from "@/lib/data";

/* globals.css has no `.prec` and no `.rule`, so the figure's type and the
   dash in front of each rule heading are carried here as utilities rather
   than as new global classes. */

const NUM =
  "text-[clamp(54px,7.5vw,88px)] font-medium leading-none tracking-[-4px] tabular-nums";
const LAB = "mt-[9px] font-mono text-[11px] tracking-[0.5px] text-faint";

/** the 14px hairline that `.rule h3::before` drew in the source */
function Dash() {
  return (
    <span className="mr-[9px] inline-block h-px w-[14px] bg-live-mid align-middle" />
  );
}

const RULES: readonly { title: string; body: ReactNode }[] = [
  {
    title: "Every claim carries its source",
    body: (
      <>
        A finding links to the provider&apos;s own deprecations page or the spec
        diff it came from.
        <Cite n={3} /> One click to check it.{" "}
        <b className="font-medium text-ink">
          You are never asked to trust us, and no language model sits anywhere
          in the detection or fix path.
        </b>
      </>
    ),
  },
  {
    title: "Severity is a countdown",
    body: (
      <>
        &quot;Deprecated, retires 2026-10-23&quot; is not a footnote, it is a
        date getting closer. Findings sort by time remaining —{" "}
        <code className="font-mono text-[0.92em]">88 days left</code> above,{" "}
        <code className="font-mono text-[0.92em]">dead 935 days</code> below.{" "}
        <b className="font-medium text-ink">
          No dependency tool has a field for that.
        </b>
      </>
    ),
  },
  {
    title: "It stops at the guess",
    body: (
      <>
        Only replacements the provider itself named get written, using the
        quoting your file already uses.{" "}
        <b className="font-medium text-ink">
          Anything that needs a judgment call is reported and left alone, and it
          says so out loud.
        </b>
      </>
    ),
  },
];

export default function Precision() {
  return (
    <Section>
      <Wrap>
        <div className="dc-rv">
          <Tag>The only number that decides whether you keep it on</Tag>
          <h2 className="dc-h2">
            A scanner that cries wolf
            <br />
            gets <span className="text-dead">muted</span>, then deleted.
          </h2>
        </div>

        <Lede className="dc-rv" style={{ marginTop: 18 }}>
          An early build reported {PRECISION.before} findings on a real
          1,200-dependency repository. About a quarter were true —{" "}
          <code>refund</code> was matching inside <code>refunded</code>. That
          tool is worse than nothing, because it teaches you to ignore it. Every
          artifact kind now matches only in the exact shape it takes when it is
          actually sent to a provider.
        </Lede>

        <Plate className="dc-rv mt-[36px]">
          {/* the cell is only here for its padding; the rule it would draw
              is the plate's own border a pixel away */}
          <div className="dc-cell" style={{ border: "none" }}>
            <div className="flex flex-wrap items-center gap-[44px]">
              <div>
                <div
                  className={`${NUM} text-ghost line-through decoration-dead decoration-4`}
                >
                  {PRECISION.before}
                </div>
                <div className={LAB}>findings · ~25% true</div>
              </div>
              <div className="font-mono text-[26px] text-ghost">→</div>
              <div>
                <div className={`${NUM} text-ink`}>{PRECISION.after}</div>
                <div className={LAB}>findings · 100% true</div>
              </div>
            </div>
          </div>
        </Plate>

        <Plate className="dc-rv mt-[18px]">
          <div className="dc-cells c3">
            {RULES.map((rule) => (
              <div key={rule.title} className="dc-cell">
                <h3 className="dc-h3">
                  <Dash />
                  {rule.title}
                </h3>
                <p className="mt-[9px] text-[14px] leading-[1.62] text-dim">
                  {rule.body}
                </p>
              </div>
            ))}
          </div>
        </Plate>
      </Wrap>
    </Section>
  );
}
