import type { SVGProps } from "react";

/**
 * Lucide geometry, inlined at stroke 1.8 — the handoff's icon spec, with no
 * package added for three shapes.
 *
 * These replace the `→` and `✓` text glyphs the pages used to carry. A glyph
 * is at the mercy of whichever font renders it: the arrow sat on a different
 * baseline in Space Grotesk than in JetBrains Mono, and its weight never
 * matched the text beside it. An SVG is the same mark everywhere and can be
 * animated on its own.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Icon>
  );
}

export function Copy(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Icon>
  );
}

export function Check(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function GitHub(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </Icon>
  );
}

/** Solid, unlike the others: a star count is a filled star everywhere it
 *  appears, and an outline at 12px reads as a smudge. */
export function Star(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <path d="M12 2.6l2.9 5.87 6.48.95-4.69 4.57 1.11 6.46L12 17.4l-5.8 3.05 1.11-6.46-4.69-4.57 6.48-.95L12 2.6Z" />
    </Icon>
  );
}
