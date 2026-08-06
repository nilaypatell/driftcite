import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* Self-hosted, not a CDN request. The hand-written build shipped for
   weeks naming these families in CSS with no @font-face anywhere, so it
   silently fell back to Avenir Next on macOS and Segoe UI elsewhere.
   next/font/local makes that failure mode impossible. */
const geist = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

const MARK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 112 112'%3E%3Cg transform='scale(1.12 1)'%3E%3Cpolygon fill='%2384CC16' points='10,0 72,0 100,28 100,55 74,55 74,40 60,26 34,26 34,55 10,55'/%3E%3Cpolygon fill='%230B0C0E' points='0,57 24,57 24,86 50,86 64,72 64,57 90,57 90,84 62,112 0,112'/%3E%3C/g%3E%3C/svg%3E";

export const metadata: Metadata = {
  metadataBase: new URL("https://driftcite.vercel.app"),
  title: "driftcite — your lockfile is green, your API calls are dead",
  description:
    "Dependency tools read your manifest. driftcite reads your code — every model ID, endpoint and parameter you actually send — and checks each one against what the provider has already retired. Static analysis, no LLM, nothing uploaded.",
  icons: { icon: MARK },
  openGraph: {
    type: "website",
    title: "driftcite — your lockfile is green, your API calls are dead",
    description:
      "39.2% of 449 scanned repositories call an API that is already dead. Over 10k stars it is 83.3%. driftcite finds the call sites and opens the PR, citing the provider who published the change.",
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
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {children}
      </body>
    </html>
  );
}
