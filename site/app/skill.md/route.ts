import { SKILL_MD } from "@/lib/skill";

/**
 * /skill.md — the durable agent skill, served from the same constant the
 * digest in /.well-known/agent-skills/index.json is computed over. The
 * index itself is written at postbuild from the emitted bytes
 * (scripts/verify-agent-artifacts.mjs), so file and digest cannot drift.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(SKILL_MD, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
