import type { CSSProperties } from "react";
import { Kicker, Ref } from "@/components/primitives";

/* 01 / 06 — The case.
   The CircleCI post-mortem, set large: they were told, and it broke anyway.
   The 770-day gap is the whole argument, so it carries the breaking red. */

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

export default function SectionCase() {
  return (
    <>
      <section style={{ padding: "84px 0 70px" }}>
        <div className="dc-rv">
          <Kicker n={1} label="The case" twin="Why driftcite exists" />
          <h2 style={h2}>
            Getting notified isn&#8217;t the same as{" "}
            <span style={{ color: "var(--color-accent)" }}>being safe.</span>
          </h2>
          <p style={lede}>
            CircleCI went down for nearly two hours in March 2022 because an API
            endpoint they depended on moved. GitHub had announced the change{" "}
            <b style={{ fontWeight: 600, color: "var(--color-ink)" }}>
              770 days earlier
            </b>
            .
            <Ref n={1} /> Somebody still had to map a prose announcement onto their
            own call sites, and nobody did &#8212; because that job belongs to a
            machine.
          </p>
        </div>

        <figure className="dc-rv" style={{ marginTop: 56 }}>
          <blockquote
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(22px, 2.2vw, 29px)",
              lineHeight: 1.45,
              letterSpacing: "-0.015em",
              maxWidth: "34ch",
              textIndent: "-0.34em",
            }}
          >
            &#8220;We realized during the incident that although we had been
            notified several times about this change,{" "}
            <span style={{ color: "var(--color-accent-700)" }}>
              we had not realized that it would affect us.
            </span>
            &#8221;
          </blockquote>
          <figcaption
            style={{
              fontSize: 15,
              lineHeight: "28px",
              color: "color-mix(in srgb, var(--color-ink) 70%, transparent)",
              marginTop: 24,
              textIndent: "-1.104em",
            }}
          >
            &#8212; CircleCI post-mortem, March 1, 2022
            <Ref n={1} /> &#183; notified January 21, 2020 &#183; broke{" "}
            <span
              style={{ color: "#C4331D", fontFeatureSettings: "'tnum' 1" }}
            >
              770 days
            </span>{" "}
            later
          </figcaption>
        </figure>
      </section>

      <hr className="dc-hr" />
    </>
  );
}
