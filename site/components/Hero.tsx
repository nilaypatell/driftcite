import CopyCommand from "@/components/CopyCommand";
import { EdgeNote, Tag } from "@/components/primitives";
import { LINKS } from "@/lib/data";

export default function Hero() {
  return (
    <div className="dc-bleed">
      <div className="dc-aurora" aria-hidden="true">
        <b />
        <b />
        <b />
      </div>
      <EdgeNote at="tl">[ STATIC ANALYSIS ]</EdgeNote>
      <EdgeNote at="tr">[ NO LLM ]</EdgeNote>
      {/* dc-hero is the animation hook — Motion staggers the four direct
          children below. The layout the source gave `.hero` lives here,
          since globals.css only carries the animation half of the class. */}
      <div
        className="dc-hero dc-wrap text-center"
        style={{ padding: "82px var(--gutter) 30px" }}
      >
        <div>
          <Tag>Drift detection for API identifiers</Tag>
        </div>
        <h1 className="dc-h1">
          Your lockfile is <span className="dc-mk">green</span>.
          <br />
          Three of your API calls are dead.
          <span className="run">
            Dependency tools read your manifest, so they see versions. They
            cannot see <code>&quot;gpt-4-turbo&quot;</code> — a string in your
            source, pinned by nothing, with no version to bump. driftcite reads
            the call sites themselves, and cites the provider&apos;s own page
            for every finding.
          </span>
        </h1>
        <div className="mt-[32px] flex flex-wrap justify-center gap-[10px]">
          <CopyCommand />
          <a className="dc-btn lg" href={LINKS.app}>
            Install the GitHub App
          </a>
        </div>
        <p
          className="mt-[18px]"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: ".7px",
            color: "var(--color-faint)",
          }}
        >
          no install · no account · nothing leaves your machine · apache&#8209;2.0
        </p>
      </div>
    </div>
  );
}
