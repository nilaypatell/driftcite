import { LINKS } from "@/lib/data";

const API = LINKS.repo.replace(
  "https://github.com/",
  "https://api.github.com/repos/",
);

/**
 * Below this, the chip is the GitHub mark and nothing else. A star count
 * is social proof, and a small one is proof of the opposite — it argues
 * against the page it sits on. There is no honest way to dress up single
 * digits, so the fix is not to show them: nothing is claimed until the
 * number can carry the claim itself.
 *
 * Raise it if the repo outgrows it. Nothing else has to change.
 */
const MIN_STARS = 100;

/**
 * The star count, read once at build time rather than once per visitor.
 *
 * It used to be a client fetch, which meant the header shipped without a
 * number and grew a number a moment later — and because the nav is packed
 * against the right edge, that pushed every link beside it sideways after
 * the page had already settled. There is no way to reserve the space for
 * it either: the width of a number nobody has yet is unknowable, and
 * holding a gap open for a count that is usually absent is worse than the
 * shift.
 *
 * Reading it during the build removes the problem rather than papering
 * over it — the number is in the HTML or it is not, and the layout is
 * final the moment it paints. The cost is that it is as fresh as the last
 * deploy, which for a number that moves a few times a week is no cost at
 * all. Every visitor also stops making a call to api.github.com just to
 * render the header.
 *
 * Returns null on anything unexpected — a rate-limited build, an offline
 * one, a repo below the threshold. The caller renders no count and the
 * chip is complete without it.
 */
export async function getStars(): Promise<number | null> {
  try {
    const res = await fetch(API, {
      // force-cache keeps this a build-time read: `output: export` has no
      // server to re-run it on, so an uncached fetch would be a request
      // that never happens rather than a fresher number.
      cache: "force-cache",
      headers: { accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const n =
      data && typeof data === "object"
        ? (data as { stargazers_count?: unknown }).stargazers_count
        : null;
    return typeof n === "number" && n >= MIN_STARS ? n : null;
  } catch {
    return null;
  }
}
