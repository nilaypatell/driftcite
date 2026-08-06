import CopyCommand from "@/components/CopyCommand";
import { EdgeNote, Lede, Tag } from "@/components/primitives";
import { LINKS } from "@/lib/data";

export default function CtaBand() {
  return (
    <div className="dc-bleed">
      <EdgeNote at="tl">[ SCAN ]</EdgeNote>
      <EdgeNote at="tr">[ CITE ]</EdgeNote>
      <EdgeNote at="bl">[ FIX ]</EdgeNote>
      <EdgeNote at="br">[ PR ]</EdgeNote>
      {/* the padding is inline because .dc-wrap sets the `padding`
          shorthand, which an unlayered rule wins over a utility class */}
      <div
        className="dc-wrap text-center"
        style={{ padding: "96px var(--gutter)" }}
      >
        <div className="dc-rv">
          <Tag center>Nine seconds on a 1,200-file repository</Tag>
          <h2 className="dc-h2">Find out either way.</h2>
          <Lede style={{ margin: "16px auto 0", maxWidth: "26em" }}>
            If your call sites are clean it prints nothing and exits zero. If
            they aren&apos;t, you&apos;d want to know today.
          </Lede>
          <div className="mt-[30px] flex flex-wrap justify-center gap-[10px]">
            <CopyCommand />
            <a className="dc-btn lg" href={LINKS.app}>
              Install the GitHub App
            </a>
          </div>
          <a
            className="group mt-[20px] block no-underline"
            href={LINKS.readme}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11.5px",
              letterSpacing: ".4px",
              color: "var(--color-faint)",
            }}
          >
            agent?{" "}
            <b className="font-normal text-dim group-hover:text-live">
              the machine-readable setup is in the readme →
            </b>
          </a>
        </div>
      </div>
    </div>
  );
}
