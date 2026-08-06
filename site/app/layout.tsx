import type { Metadata, Viewport } from "next";
import {
  Space_Grotesk,
  Hanken_Grotesk,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import Motion from "@/components/Motion";
import RouteOnly from "@/components/RouteOnly";
import Announcement from "@/components/home/Announcement";
import { getStars } from "@/lib/stars";
import { OG_IMAGE, SITE } from "@/lib/seo";
import { LINKS } from "@/lib/data";

/* next/font downloads and self-hosts these at build time, so the handoff's
   three Google Fonts become zero external requests and cannot fail to load
   the way a bare font-family name silently did in an earlier build. */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

/* No italic face: nothing on the site sets font-style, so requesting one
   only bought a fourth preloaded woff2 that every page downloaded and no
   page ever drew a glyph from. */
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-hanken-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const DESCRIPTION =
  "Finds the models, endpoints and parameters your code calls that providers have already retired, and opens the pull request that replaces them.";

/* The social card is public/og.png, declared rather than conventional — see
   OG_IMAGE in lib/seo.ts for why the file convention's hashed URL was the
   wrong address for a thing whose whole job is to be cached by strangers. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "driftcite — catch dead API calls before your users do",
    template: "%s — driftcite",
  },
  description: DESCRIPTION,
  applicationName: "driftcite",
  authors: [{ name: "driftcite", url: LINKS.repo }],
  creator: "driftcite",
  publisher: "driftcite",
  category: "technology",
  /* app/icon.svg, app/apple-icon.png and app/favicon.ico are picked up by
     file convention; this adds the raster ladder beside them. The large
     sizes are not redundant — Google's result tile takes the biggest icon
     it is offered and scales it down, so declaring only 32px is how a
     search listing ends up with a blurry tile on a retina screen.

     All of them are the mark on a plate. The bare mark used to be the icon,
     inline as a data URI, and because that drawing is full-bleed by design
     it arrived on every surface with no margin at all — a shape jammed
     edge to edge in a square. See app/icon.svg. */
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/favicon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/favicon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "driftcite",
    title: "driftcite — catch dead API calls before your users do",
    description:
      "39.2% of 449 scanned repositories call an API that is already dead. driftcite finds the call sites and opens the PR, citing the provider who published the change.",
    url: "/",
    locale: "en_US",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "driftcite — dead API calls, found and fixed",
    description:
      "Static analysis for the strings your dependency tools never look at. npx driftcite .",
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

/* The colour the browser paints its own chrome with — the address bar on
   Android, the notch area on iOS. Left unset it picks white, which is a
   shade off the site's ground and shows as a seam above the page. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBFCFE",
};

/* Two graphs, not one. The SoftwareApplication is the product; the
   Organization carries `sameAs`, which is the only place a search engine is
   told that this site, the GitHub repository and the npm package are the
   same project rather than three unrelated results. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#app`,
      name: "driftcite",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      description:
        "Static analysis that finds the API identifiers in your source that providers have already retired — models, endpoints, parameters — and opens the pull request that replaces them. Every finding cites the provider who published the change.",
      url: SITE,
      installUrl: LINKS.app,
      downloadUrl: LINKS.npm,
      softwareHelp: `${SITE}/docs`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      isAccessibleForFree: true,
      publisher: { "@id": `${SITE}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: "driftcite",
      url: SITE,
      logo: `${SITE}/og.png`,
      sameAs: [LINKS.repo, LINKS.npm],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#site`,
      name: "driftcite",
      url: SITE,
      inLanguage: "en",
      publisher: { "@id": `${SITE}/#org` },
    },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* Read once here, at build, and handed down — SiteNav is a client
     component and cannot await anything itself. */
  const stars = await getStars();

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <RouteOnly path="/">
          <Announcement />
        </RouteOnly>
        <SiteNav stars={stars} />
        {children}
        <SiteFooter />
        <Motion />
      </body>
    </html>
  );
}
