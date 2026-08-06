import { PLOT } from "./data";

/**
 * The corpus plot: one dot per repository scanned, `hits` of them dead.
 *
 * Generated on the server from a fixed seed, so the scatter is byte-identical
 * on every render and every visit. It is a plot, not a decoration — the
 * picture must not change between reloads, and the dots must exist in the
 * HTML for readers without JavaScript.
 */
export function plotDots(): boolean[] {
  const { total, hits } = PLOT;

  // mulberry32 — small, deterministic, no dependency
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const idx = Array.from({ length: total }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }

  const hit = new Set(idx.slice(0, hits));
  return Array.from({ length: total }, (_, i) => hit.has(i));
}
