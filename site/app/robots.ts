import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/* `output: export` has no server to re-run these on, so both are emitted
   once at build time as plain files. */
export const dynamic = "force-static";

/**
 * robots.txt, generated rather than checked in.
 *
 * It replaces public/robots.txt, which could not name a sitemap without
 * repeating the origin in a third place, and which would have silently won
 * over this file had both been left in the tree.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
