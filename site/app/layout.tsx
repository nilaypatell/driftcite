import type { Metadata } from "next";
import { Space_Grotesk, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import Motion from "@/components/Motion";
import RouteOnly from "@/components/RouteOnly";
import Announcement from "@/components/home/Announcement";
import { getStars } from "@/lib/stars";
import { SITE } from "@/lib/seo";
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

const MARK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 112 112'%3E%3Cg transform='scale(1.12 1)'%3E%3Cpolygon fill='%233D5AFE' points='10,0 72,0 100,28 100,55 74,55 74,40 60,26 34,26 34,55 10,55'/%3E%3Cpolygon fill='%230D1220' points='0,57 24,57 24,86 50,86 64,72 64,57 90,57 90,84 62,112 0,112'/%3E%3C/g%3E%3C/svg%3E";

const DESCRIPTION =
  "You should be shipping, not tracking which model a provider retired last quarter. driftcite finds the API identifiers in your source that are already dead — models, endpoints, parameters — and opens the pull request that replaces them, citing the provider that published the change.";

/* The social card is app/opengraph-image.png and app/twitter-image.png. As
   files they carry their own dimensions and alt text into the tags, and they
   are served from this deploy — the previous card was a raw.githubusercontent
   URL, which meant every preview on every platform depended on GitHub serving
   an image from a branch, and it was a square app icon rather than a card. */
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
  icons: { icon: MARK },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "driftcite",
    title: "driftcite — catch dead API calls before your users do",
    description:
      "39.2% of 449 scanned repositories call an API that is already dead. driftcite finds the call sites and opens the PR, citing the provider who published the change.",
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "driftcite — dead API calls, found and fixed",
    description:
      "Static analysis for the strings your dependency tools never look at. npx driftcite .",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
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
      logo: `${SITE}/opengraph-image.png`,
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
