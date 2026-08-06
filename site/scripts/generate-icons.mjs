/**
 * Author-time icon generation. Run it when app/icon.svg changes:
 *
 *     node scripts/generate-icons.mjs
 *
 * app/icon.svg is the source of truth for every raster below. Nothing in the
 * build runs this — the outputs are committed, because a build that shells
 * out to a browser is a build that fails on the one machine without one.
 *
 * It rasterises through headless Chrome rather than adding sharp or resvg to
 * package.json. The site's dependencies are next, react and tailwind and
 * nothing else, and a 40MB native image library that runs zero times per
 * deploy does not earn a place in that list. The same reasoning is why the
 * social card is rendered this way — see .github/og-card.html.
 *
 * Each size is rendered at its own resolution rather than downsampled from
 * 512, so the 16px favicon is a 16px drawing with its own hinting rather
 * than a shrunken large one, which is where small favicons turn to mud.
 *
 * Outputs:
 *   app/apple-icon.png            180, opaque — iOS composites its own
 *                                 corner radius, so alpha there shows as a
 *                                 black square behind the rounding
 *   app/favicon.ico               16 + 32 + 48, for /favicon.ico requests
 *   public/icons/favicon-N.png    16 32 48 96 192 512, declared by size in
 *                                 the layout's `icons` — Google's result
 *                                 tile takes the largest one it is offered
 *                                 and downscales it
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "app", "icon.svg");

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PNG_SIZES = [16, 32, 48, 96, 192, 512];
const ICO_SIZES = [16, 32, 48];
const APPLE = 180;

const work = join(tmpdir(), `driftcite-icons-${process.pid}`);
mkdirSync(work, { recursive: true });
mkdirSync(join(root, "public", "icons"), { recursive: true });

/**
 * Render the source at one size. The SVG goes inside a page whose body is
 * exactly that many pixels with no margin, so the screenshot is the artwork
 * and nothing else.
 *
 * `opaque` paints white under the drawing first. The plate is already white,
 * but its rounded corners are transparent, and iOS treats that transparency
 * as black.
 */
function render(size, out, { opaque = false } = {}) {
  const svg = readFileSync(SOURCE, "utf8");
  const page = join(work, `${size}${opaque ? "-opaque" : ""}.html`);
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8">` +
      `<style>*{margin:0;padding:0}` +
      `html,body{width:${size}px;height:${size}px;` +
      `${opaque ? "background:#fff;" : "background:transparent;"}}` +
      `svg{display:block;width:${size}px;height:${size}px}</style>` +
      svg
  );

  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      ...(opaque ? [] : ["--default-background-color=00000000"]),
      `--window-size=${size},${size}`,
      "--virtual-time-budget=2000",
      `--screenshot=${out}`,
      `file://${page}`,
    ],
    { stdio: "ignore" }
  );
}

/**
 * An ICO is a 6-byte header, one 16-byte directory entry per image, then the
 * images themselves. Since Vista the images may be PNGs verbatim, so the
 * whole format here is bookkeeping around files we already have — which is
 * why this is twenty lines rather than a dependency.
 */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = [];
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette colours
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

for (const size of PNG_SIZES) {
  const out = join(root, "public", "icons", `favicon-${size}.png`);
  render(size, out);
  console.log(`icons/favicon-${size}.png`);
}

render(APPLE, join(root, "app", "apple-icon.png"), { opaque: true });
console.log("app/apple-icon.png");

const icoPath = join(root, "app", "favicon.ico");
writeFileSync(
  icoPath,
  ico(
    ICO_SIZES.map((size) => ({
      size,
      data: readFileSync(join(root, "public", "icons", `favicon-${size}.png`)),
    }))
  )
);
console.log("app/favicon.ico");

rmSync(work, { recursive: true, force: true });
