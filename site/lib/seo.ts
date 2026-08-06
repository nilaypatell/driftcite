import type { Metadata } from "next";

/**
 * The one place the production origin is written down. Everything that has
 * to be absolute — canonicals, the sitemap, og:url, JSON-LD — derives from
 * it, so moving the site to its own domain is a one-line change rather than
 * a search for hard-coded hosts.
 */
export const SITE = "https://driftcite.vercel.app";

/**
 * The social card, at a clean and permanent URL.
 *
 * It used to be app/opengraph-image.png, the Next file convention. That
 * convention works, but it publishes the card at a per-build hashed query —
 * /opengraph-image.png?opengraph-image.11zr2voq5tmwu.png — and the address a
 * preview is cached under is the address it was fetched from. A URL that
 * changes on every deploy is a URL no scraper can keep, and an unusual one is
 * a URL some scrapers mishandle. A plain file in public/ has neither problem
 * and is the same picture.
 */
export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "driftcite — catch dead API calls before your users do. Static analysis for the model IDs, endpoints and parameters your dependency tools never look at.",
} as const;

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
 * Three things it fixes that are easy to miss.
 *
 * A page with no `openGraph` of its own does not inherit the parent's
 * *fields* — it inherits the parent's whole object, so without this every
 * route shared the home page's social title and shipped "catch dead API
 * calls before your users do" as the preview for the changelog.
 *
 * The merge is shallow the other way too, and worse: a page that sets
 * `openGraph` REPLACES the root's object entirely, dropping og:image with
 * it — and the root `opengraph-image` file convention does not survive the
 * override either. That shipped: every page but the home page went out with
 * no card at all, verified in the built HTML. So the image has to be
 * re-stated here rather than assumed.
 *
 * And the canonical has to be stated: with `cleanUrls` on, /docs and /docs/
 * and /docs.html are all reachable, and only one of them should be the
 * address search engines keep.
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
      locale: "en_US",
      url: path,
      title: social,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: social,
      description,
      images: [OG_IMAGE],
    },
  };
}
