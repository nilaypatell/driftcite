import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMAND, CORPUS } from "@/lib/data";

/* `output: export` has no server to re-run this on, so the card is rendered
   once during the build and written to out/og.png as a plain file. */
export const dynamic = "force-static";

/**
 * The social card, drawn from lib/data.ts.
 *
 * It used to be a hand-written HTML file rasterised through headless Chrome,
 * with "39.2%" typed into it. Every other figure on this site is read out of
 * lib/data.ts, whose own header says that a figure not in that file does not
 * belong on the page — and the card was the one thing quietly holding a
 * second copy. It agreed with the source on the day it was made and nothing
 * whatsoever kept it agreeing. For a project that exists to catch values
 * which have drifted away from what published them, that is the one bug it
 * cannot be caught shipping.
 *
 * A route rather than the `opengraph-image` file convention, because that
 * convention publishes at a per-build hashed query. The address a preview is
 * cached under is the address it was fetched from, so a URL that changes
 * every deploy leaves every previously-cached card pointing at a 404. This
 * one is /og.png on the first deploy and on the hundredth.
 *
 * Satori, not a browser: it is bundled with Next, runs anywhere the build
 * runs, and needs no Chrome on the machine. The cost is that it reads a
 * subset of CSS — no masks, and every element holding more than one child
 * must say `display: flex` — which is why the drawing here is flatter than
 * the page's own dotted ground.
 */

const font = (file: string) =>
  readFileSync(join(process.cwd(), "assets", "og-fonts", file));

/* Satori cannot see next/font's build output, so the three faces are
   vendored beside it. Keep the weights in step with globals.css. */
const display = font("space-grotesk-700.ttf");
const body = font("hanken-grotesk-400.ttf");
const mono = font("jetbrains-mono-500.ttf");

const INK = "#0D1220";
const ACCENT = "#3D5AFE";
const GROUND = "#FBFCFE";
const MUTED = "#414A61";
const FAINT = "#5C647B";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: 1200,
          height: 630,
          background: GROUND,
          position: "relative",
        }}
      >
        {/* the accent edge — the ruled column's left rule, thickened */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 10,
            background: ACCENT,
          }}
        />
        {/* No haze behind the headline, and no dotted ground either. Both
            were in the Chrome-rendered card; Satori paints a radial-gradient
            as a dark ellipse whatever its stops are, and cannot repeat a
            background at all. Rather than approximate them badly the card is
            flat — which is closer to the rest of the site than the smudge
            was: a lone glow with no grid under it is decoration, and nothing
            else here is decorated. The accent edge carries the brand. */}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "68px 76px 62px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <svg viewBox="0 0 112 112" width="34" height="34">
                <g transform="scale(1.12 1)">
                  <polygon
                    fill={ACCENT}
                    points="10,0 72,0 100,28 100,55 74,55 74,40 60,26 34,26 34,55 10,55"
                  />
                  <polygon
                    fill={INK}
                    points="0,57 24,57 24,86 50,86 64,72 64,57 90,57 90,84 62,112 0,112"
                  />
                </g>
              </svg>
              <span
                style={{
                  fontFamily: "Space Grotesk",
                  fontSize: 30,
                  color: INK,
                  marginLeft: 13,
                }}
              >
                driftcite
              </span>
            </div>
            <span
              style={{
                fontFamily: "JetBrains Mono",
                fontSize: 18,
                letterSpacing: 2.5,
                color: "#7A8299",
              }}
            >
              [ APACHE-2.0 · OPEN SOURCE ]
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontFamily: "Space Grotesk",
                fontSize: 76,
                lineHeight: 1.06,
                letterSpacing: -1.9,
              }}
            >
              <span style={{ color: INK }}>Catch dead API calls</span>
              <span style={{ color: ACCENT }}>before your users do.</span>
            </div>
            <span
              style={{
                fontFamily: "Hanken Grotesk",
                fontSize: 28,
                lineHeight: 1.42,
                color: MUTED,
                marginTop: 26,
                maxWidth: 760,
              }}
            >
              Static analysis for the model IDs, endpoints and parameters your
              dependency tools never look at.
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#0E1119",
                border: "1px solid #2A3147",
                borderRadius: 12,
                padding: "15px 24px",
                fontFamily: "JetBrains Mono",
                fontSize: 24,
              }}
            >
              <span style={{ color: "#7C90FF" }}>$</span>
              <span style={{ color: "#EDEFF7", marginLeft: 12 }}>{COMMAND}</span>
            </div>
            <span
              style={{
                fontFamily: "JetBrains Mono",
                fontSize: 23,
                color: FAINT,
                marginLeft: 24,
              }}
            >
              {CORPUS.sharePct}% of scanned repos already call one
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Space Grotesk", data: display, weight: 700, style: "normal" },
        { name: "Hanken Grotesk", data: body, weight: 400, style: "normal" },
        { name: "JetBrains Mono", data: mono, weight: 500, style: "normal" },
      ],
    }
  );
}
