import type { ReactNode } from "react";

/* Shared building blocks. Server components — nothing here needs the client. */

/** The 1200px ruled column every page sits in. */
export function Column({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`dc-col ${className}`}>{children}</div>;
}

/**
 * [ 01 / 06 ] · The case ································ // Why driftcite exists //
 *
 * The right-hand twin label is decorative and hides below 980px.
 */
export function Kicker({
  n,
  total = 6,
  label,
  twin,
}: {
  n: number;
  total?: number;
  label: string;
  twin?: string;
}) {
  const pad = (v: number) => String(v).padStart(2, "0");
  return (
    <div className="dc-kicker">
      <span>
        [ <span className="n">{pad(n)}</span> / {pad(total)} ] &nbsp;·&nbsp; {label}
      </span>
      {twin ? (
        <span className="dc-kick-right" aria-hidden="true">
          // {twin} //
        </span>
      ) : null}
    </div>
  );
}

/** A dagger footnote reference, pointing at the notes list. */
export function Ref({ n }: { n: number }) {
  return (
    <sup>
      <a
        href={`#fn${n}`}
        style={{ color: "var(--color-accent-700)", textDecoration: "none" }}
      >
        †{n}
      </a>
    </sup>
  );
}

/** The wordmark: accent and ink polygons, x-scaled 1.12. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 112 112" width={size} height={size} aria-hidden="true">
      <g transform="scale(1.12 1)">
        <polygon
          fill="#3D5AFE"
          points="10,0 72,0 100,28 100,55 74,55 74,40 60,26 34,26 34,55 10,55"
        />
        <polygon
          fill="#0D1220"
          points="0,57 24,57 24,86 50,86 64,72 64,57 90,57 90,84 62,112 0,112"
        />
      </g>
    </svg>
  );
}

/** A page's opening block: H1 plus a lede, used by every page but home. */
export function PageHead({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="dc-rise" style={{ padding: "72px 0 44px" }}>
      <div
        className="dc-mono"
        style={{
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-neutral-600)",
          marginBottom: "var(--space-3)",
        }}
      >
        {kicker}
      </div>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(32px, 3.6vw, 50px)",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          maxWidth: "18ch",
        }}
      >
        {title}
      </h1>
      {children ? (
        <div
          style={{
            marginTop: "var(--space-4)",
            fontSize: 17,
            lineHeight: "28px",
            maxWidth: "58ch",
            color: "color-mix(in srgb, var(--color-ink) 78%, transparent)",
          }}
        >
          {children}
        </div>
      ) : null}
    </header>
  );
}
