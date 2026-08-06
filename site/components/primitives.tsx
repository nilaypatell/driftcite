import type { ReactNode } from "react";
import { CHAPTERS } from "@/lib/data";

/* Shared building blocks. Every section composes these rather than
   re-declaring markup, so the drawing stays consistent. All of them are
   server components — nothing here needs the client. */

export function Wrap({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`dc-wrap ${className}`}>{children}</div>;
}

export function Section({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dc-section relative py-[92px] ${className}`}>
      {children}
    </section>
  );
}

/** ▌ [ 03 / 07 ] · THE CORPUS ................ measured, july 2026
 *  The number is derived from CHAPTERS, so it cannot drift out of sync
 *  the way a hand-written one does. */
export function Rail({ n, id }: { n: number; id?: string }) {
  const chapter = CHAPTERS[n - 1];
  const pad = (v: number) => String(v).padStart(2, "0");
  return (
    <div className="dc-rail" id={id}>
      <Wrap>
        <span className="tk" />
        <span className="idx">
          [ <b>{pad(n)}</b> / {pad(CHAPTERS.length)} ]
        </span>{" "}
        <span className="sep">·</span> <span className="lbl">{chapter.label}</span>
        <span className="end">{chapter.end}</span>
      </Wrap>
    </div>
  );
}

/** A bordered figure with crop marks at all four corners. The `dc-cm`
 *  child is what draws the bottom two. */
export function Plate({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`dc-plate ${className}`}>
      <span className="dc-cm" />
      {children}
    </div>
  );
}

export function Tag({
  children,
  center = false,
}: {
  children: ReactNode;
  center?: boolean;
}) {
  return (
    <span className="dc-tag" style={center ? { justifyContent: "center" } : undefined}>
      {children}
    </span>
  );
}

/** Mono annotations clipped at the viewport edge, like the margin notes
 *  on a drawing. Hidden below 1320px, where there is no margin to sit in. */
export function EdgeNote({
  at,
  children,
}: {
  at: "tl" | "tr" | "bl" | "br";
  children: ReactNode;
}) {
  return <span className={`dc-edge ${at}`}>{children}</span>;
}

export function Lede({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <p className={`dc-lede ${className}`} style={style}>
      {children}
    </p>
  );
}

/** A superscript citation pointing at the evidence list. */
export function Cite({ n }: { n: number }) {
  return (
    <a className="dc-cite" href={`#fn${n}`}>
      [{n}]
    </a>
  );
}

/** The wordmark. Lime is alive, ink is the rest. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 112 112" width={size} height={size} aria-hidden="true">
      <g transform="scale(1.12 1)">
        <polygon
          fill="#84CC16"
          points="10,0 72,0 100,28 100,55 74,55 74,40 60,26 34,26 34,55 10,55"
        />
        <polygon
          fill="#0B0C0E"
          points="0,57 24,57 24,86 50,86 64,72 64,57 90,57 90,84 62,112 0,112"
        />
      </g>
    </svg>
  );
}
