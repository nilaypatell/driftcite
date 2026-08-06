import {
  Cite,
  EdgeNote,
  Lede,
  Plate,
  Section,
  Tag,
  Wrap,
} from "@/components/primitives";
import { BY_POPULARITY, CORPUS, STATS } from "@/lib/data";
import { plotDots } from "@/lib/plot";

export default function Corpus() {
  /* Every dot is in the HTML, from a fixed seed on the server — the picture
     must not change between reloads, and it must exist without JavaScript.
     Motion only fades them in. */
  const dots = plotDots();

  return (
    <Section>
      <EdgeNote at="tl">[ n = {CORPUS.scanned} ]</EdgeNote>
      <EdgeNote at="br">[ REPRODUCIBLE ]</EdgeNote>
      <Wrap>
        <div className="grid grid-cols-2 items-center gap-[54px] max-[900px]:grid-cols-1 max-[900px]:gap-[38px]">
          <div className="dc-rv">
            <Tag>We ran it on {CORPUS.scanned} repositories</Tag>
            <div className="dc-bignum">
              <span data-count={CORPUS.sharePct}>0.0</span>
              <sup>%</sup>
            </div>
            <Lede className="mt-4">
              of them call at least one API that is <b>already dead</b>.
              <Cite n={2} /> Not deprecated, not sunsetting — dead. The request
              fails today, and the repository does not know it.
            </Lede>
          </div>
          <div className="dc-rv">
            <div
              className="dc-plot"
              role="img"
              aria-label={`Dot plot: ${CORPUS.scanned} repositories scanned, ${CORPUS.affected} of them calling an API that is already dead`}
            >
              {dots.map((dead, i) => (
                <b key={i} className={dead ? "hit" : undefined} />
              ))}
            </div>
            <div className="mt-[18px] flex gap-5 font-mono text-[11px] tracking-[.5px] text-faint">
              <span className="inline-flex items-center gap-[7px]">
                <i className="block h-[7px] w-[7px] rounded-full bg-live-mid" />
                {CORPUS.affected} affected
              </span>
              <span className="inline-flex items-center gap-[7px]">
                <i className="block h-[7px] w-[7px] rounded-full bg-rule-3" />
                {CORPUS.scanned - CORPUS.affected} clean
              </span>
            </div>
          </div>
        </div>

        <Plate className="dc-rv mt-[52px]">
          <div className="dc-cells c4">
            {STATS.map((s) => (
              <div className="dc-cell" key={s.label}>
                <div
                  className="text-[29px] font-medium tracking-[-1.2px] tabular-nums"
                  data-count={s.value}
                >
                  0
                </div>
                <div className="mt-[3px] text-[13px] text-dim">{s.label}</div>
              </div>
            ))}
          </div>
        </Plate>

        <Plate className="dc-rv mt-[18px]">
          <div className="dc-cell border-none">
            <p className="dc-claim mb-[18px]">
              <b>The more people depend on you, the worse it is.</b> Popularity
              does not protect a repository here — it correlates with the
              opposite.
            </p>
            <div className="dc-bars" data-bars>
              {BY_POPULARITY.map((b) => (
                <div className="row" key={b.label}>
                  <span className="lab">{b.label}</span>
                  <span className="track">
                    <span className="fill" data-pct={b.pct} />
                  </span>
                  <span className="pct">{b.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </Plate>
      </Wrap>
    </Section>
  );
}
