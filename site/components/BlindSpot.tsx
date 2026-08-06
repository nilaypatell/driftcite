import { Cite, EdgeNote, Lede, Plate, Section, Tag, Wrap } from "@/components/primitives";

export default function BlindSpot() {
  return (
    <Section>
      <EdgeNote at="tl">[ ANNOUNCED 2020-01-21 ]</EdgeNote>
      <EdgeNote at="br">[ BROKE 2022-03-01 ]</EdgeNote>
      <Wrap>
        <div className="dc-rv">
          <Tag>No version, no bump, no warning</Tag>
          <h2 className="dc-h2">
            An API identifier has
            <br />
            nothing to upgrade.
          </h2>
        </div>
        <Lede className="dc-rv" style={{ marginTop: 20 }}>
          Dependabot watches your manifest. Renovate watches your manifest. Both
          are excellent, and both are looking somewhere else —{" "}
          <b>
            a model name, an endpoint path and a request parameter live in your
            source code, not your dependency graph.
          </b>{" "}
          Nothing pins them, so nothing flags them. They keep working right up
          until the provider turns them off.
        </Lede>
        <Lede className="dc-rv" style={{ marginTop: 16 }}>
          Providers do announce it. That has never been enough. The announcement
          lands in a changelog months or years before the shutdown, and somebody
          still has to map the prose onto their own call sites.
        </Lede>

        {/* The exhibit's own type is not in globals.css, so it is carried
            as utilities here rather than as a new global class. */}
        <Plate className="dc-rv mt-[40px] max-w-[840px] px-[34px] pt-[34px] pb-[30px] max-[560px]:px-[22px] max-[560px]:pt-[26px] max-[560px]:pb-[24px]">
          <figure>
            <blockquote className="max-w-[20em] text-[clamp(20px,2.5vw,28px)] leading-[1.4] font-medium tracking-[-0.5px]">
              CircleCI looked at the changes and{" "}
              <em className="text-dead not-italic">
                mistakenly concluded that they did not apply to them.
              </em>
            </blockquote>
            <figcaption className="mt-[18px] border-t border-rule-1 pt-[16px] font-mono text-[11.5px] tracking-[0.4px] text-faint">
              CircleCI post-mortem · nearly two hours down · 2022-03-01
              <Cite n={1} />
            </figcaption>
            <div className="dc-dimline" data-dimline>
              <span className="cap" />
              <span className="ln" />
              <span className="val">
                GitHub announced it <b>770 days</b> earlier
              </span>
              <span className="ln r" />
              <span className="cap r" />
            </div>
          </figure>
        </Plate>
      </Wrap>
    </Section>
  );
}
