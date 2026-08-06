import type { Metadata } from "next";
import { Space_Grotesk, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import Motion from "@/components/Motion";
import RouteOnly from "@/components/RouteOnly";
import Announcement from "@/components/home/Announcement";

/* next/font downloads and self-hosts these at build time, so the handoff's
   three Google Fonts become zero external requests and cannot fail to load
   the way a bare font-family name silently did in an earlier build. */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
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

export const metadata: Metadata = {
  metadataBase: new URL("https://driftcite.vercel.app"),
  title: {
    default: "driftcite — catch dead API calls before your users do",
    template: "%s — driftcite",
  },
  description:
    "Providers retire endpoints, parameters and models — and your lockfile never moves, so no dependency tool notices. driftcite reads your call sites, finds what already stopped working, and opens the pull request that fixes it.",
  icons: { icon: MARK },
  openGraph: {
    type: "website",
    siteName: "driftcite",
    title: "driftcite — catch dead API calls before your users do",
    description:
      "39.2% of 449 scanned repositories call an API that is already dead. driftcite finds the call sites and opens the PR, citing the provider who published the change.",
    url: "https://driftcite.vercel.app",
    images: [
      "https://raw.githubusercontent.com/nilaypatell/driftcite/main/.github/app-logo.png",
    ],
  },
  twitter: {
    card: "summary",
    title: "driftcite — dead API calls, found and fixed",
    description:
      "Static analysis for the strings your dependency tools never look at. npx driftcite .",
    images: [
      "https://raw.githubusercontent.com/nilaypatell/driftcite/main/.github/app-logo.png",
    ],
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "driftcite",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  description:
    "Static analysis that finds the API identifiers in your source that providers have already retired — models, endpoints, parameters — and opens the pull request that replaces them. Every finding cites the provider who published the change.",
  url: "https://driftcite.vercel.app",
  installUrl: "https://github.com/apps/driftcite",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  license: "https://www.apache.org/licenses/LICENSE-2.0",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
        <SiteNav />
        {children}
        <SiteFooter />
        <Motion />
      </body>
    </html>
  );
}
