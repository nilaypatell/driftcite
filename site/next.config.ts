import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The page is one static route with no server data. Exporting it keeps
  // the deploy identical in shape to the hand-written file it replaces:
  // static HTML on a CDN, no functions, no cold starts.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
