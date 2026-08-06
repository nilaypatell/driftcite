import type { MetadataRoute } from "next";
import { ROUTES, SITE } from "@/lib/seo";

/* `output: export` has no server to re-run these on, so both are emitted
   once at build time as plain files. */
export const dynamic = "force-static";

/**
 * The sitemap, generated from the same route list the nav and the canonicals
 * use — a hand-kept second copy is the kind that silently goes stale.
 *
 * /pricing is deliberately absent. It builds and is reachable by URL, but
 * nothing in the chrome links to it while paid tiers are off (see
 * SHOW_PRICING), and submitting a page the site itself will not link to is
 * asking to be indexed for something that cannot be bought yet.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((path) => ({
    url: `${SITE}${path}`,
    changeFrequency: path === "/changelog" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
