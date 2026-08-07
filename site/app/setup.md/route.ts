import { AGENT_SETUP_PROMPT } from "@/lib/agent-setup";

/**
 * /setup.md — the agent setup prompt as a fetchable file, byte-identical
 * to what the hero button copies because both read one constant.
 *
 * A Route Handler rather than a file in public/ so the two surfaces cannot
 * drift apart: there is no second copy to forget. Under output:"export"
 * this is emitted at build time as a real file, out/setup.md, and Vercel
 * serves a static .md as text/markdown with inline disposition on its own
 * — cleanUrls only rewrites .html, so the URL keeps its extension. The
 * dotted segment is the same trick app/og.png already uses.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(AGENT_SETUP_PROMPT, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
