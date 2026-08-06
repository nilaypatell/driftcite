import type { Metadata } from "next";

/**
 * The one place the production origin is written down. Everything that has
 * to be absolute — canonicals, the sitemap, og:url, JSON-LD — derives from
 * it, so moving the site to its own domain is a one-line change rather than
 * a search for hard-coded hosts.
 */
export const SITE = "https://driftcite.vercel.app";

/** Every route the site publishes, in the order the nav lists them. */
export const ROUTES = [
  "/",
  "/docs",
  "/coverage",
  "/how-it-works",
  "/changelog",
  "/security",
] as const;

/**
 * Per-page metadata, built from the one title and description the page
 * already has to write.
 *
 * Two things it fixes that are easy to miss. A page with no `openGraph` of
 * its own does not inherit the parent's *fields* — it inherits the parent's
 * whole object, so without this every route shared the home page's social
 * title and shipped "catch dead API calls before your users do" as the
 * preview for the changelog. And the canonical has to be stated: with
 * `cleanUrls` on, /docs and /docs/ and /docs.html are all reachable, and
 * only one of them should be the address search engines keep.
 */
export function pageMeta({
  path,
  title,
  description,
}: {
  path: string;
  title: string;
  description: string;
}): Metadata {
  /* the layout's title template, applied by hand — og:title does not go
     through it, and a bare "Coverage" is not a page title anywhere else */
  const social = `${title} — driftcite`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "driftcite",
      url: path,
      title: social,
      description,
    },
    twitter: { card: "summary_large_image", title: social, description },
  };
}
