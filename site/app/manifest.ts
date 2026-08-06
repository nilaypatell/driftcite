import type { MetadataRoute } from "next";

/* `output: export` has no server to re-run this on, so it is emitted once at
   build time as a plain file. */
export const dynamic = "force-static";

/**
 * The web app manifest. Next serves it at /manifest.webmanifest and injects
 * the <link rel="manifest"> itself.
 *
 * Nothing here is asking to be an installable app — driftcite is a CLI and a
 * GitHub App, and the site is a document. It exists because Android's "add to
 * home screen" and Chrome's install prompt read icons and colours from here
 * and from nowhere else, and without it they fall back to a screenshot of the
 * page and a grey chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "driftcite — catch dead API calls before your users do",
    short_name: "driftcite",
    description:
      "Static analysis that finds the API identifiers in your source that providers have already retired, and opens the pull request that replaces them.",
    start_url: "/",
    display: "browser",
    background_color: "#FBFCFE",
    theme_color: "#FBFCFE",
    icons: [
      { src: "/icons/favicon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
