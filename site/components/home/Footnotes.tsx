import type { CSSProperties } from "react";
import { CORPUS, LINKS } from "@/lib/data";

/* [ † ] — notes & sources. Every claim on the page ends here, and every
   note ends at somebody else's page. `dc-fn` lights the row up when a
   dagger jumps to it. */

const item: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "40px 1fr",
  gap: 10,
  fontSize: 13.5,
  lineHeight: "22px",
  color: "color-mix(in srgb, var(--color-ink) 70%, transparent)",
  padding: "2px 4px",
};

const dagger: CSSProperties = {
  color: "var(--color-accent-700)",
  fontFeatureSettings: "'tnum' 1",
};

const cite: CSSProperties = { color: "var(--color-ink)" };

export default function Footnotes() {
  return (
    <section style={{ padding: "70px 0 0" }}>
      <span
        style={{
          display: "block",
          fontSize: 13,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-accent-700)",
          fontFeatureSettings: "'tnum' 1",
          marginBottom: 20,
        }}
      >
        [ &#8224; ]&#160;&#160;&#183;&#160;&#160;Notes &amp; sources
      </span>

      <ol
        style={{
          listStyle: "none",
          display: "grid",
          gap: 12,
          maxWidth: 860,
        }}
      >
        <li id="fn1" className="dc-fn" style={item}>
          <span style={dagger}>&#8224;1</span>
          <span>
            <a href={LINKS.circleci} style={cite}>
              CircleCI post-mortem: workflows not running and jobs failing,
              March 1, 2022
            </a>{" "}
            &#8212; GitHub announced the endpoint migration on January 21, 2020;
            the brownout broke CircleCI on March 1, 2022.
          </span>
        </li>

        <li id="fn2" className="dc-fn" style={item}>
          <span style={dagger}>&#8224;2</span>
          <span>
            <a href={LINKS.report} style={cite}>
              driftcite corpus report &#8212; {CORPUS.scanned} public
              repositories, July 2026
            </a>{" "}
            &#8212; methodology and per-provider counts in the repository;
            reproducible with the public CLI.
          </span>
        </li>

        <li id="fn3" className="dc-fn" style={item}>
          <span style={dagger}>&#8224;3</span>
          <span>
            <a href={LINKS.openaiDeprecations} style={cite}>
              OpenAI deprecations page
            </a>{" "}
            &#8212; one of ten provider sources; spec-diff providers cite the
            provider&#8217;s own git compare, e.g.{" "}
            <a href={LINKS.stripeOpenapi} style={cite}>
              stripe/openapi
            </a>
            .
          </span>
        </li>

        <li id="fn4" className="dc-fn" style={item}>
          <span style={dagger}>&#8224;4</span>
          <span>
            <a href={LINKS.pr} style={cite}>
              Pull request opened by driftcite[bot], August 5, 2026
            </a>{" "}
            &#8212; authored, pushed and opened by the App with no human in the
            loop.
          </span>
        </li>
      </ol>

      <p
        style={{
          fontSize: 12.5,
          color: "color-mix(in srgb, var(--color-ink) 55%, transparent)",
          marginTop: 32,
        }}
      >
        Every number on this page came from a real run against a real codebase.
      </p>
    </section>
  );
}
