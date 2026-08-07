import { SITE } from "@/lib/seo";

/**
 * /llms.txt — a pointer file, not a corpus. Agents fetch this when a user
 * points them at the site; nothing fetches it speculatively, so its one
 * job is to hand over the setup file and the canonical docs in as few
 * bytes as possible. Links, not inlined content, and no llms-full.txt:
 * the sites that ship one well (Stripe, nextjs.org) deliberately stop at
 * the pointer.
 *
 * Spec shape per llmstxt.org: H1, blockquote summary, then link sections.
 */
export const dynamic = "force-static";

const BODY = `# driftcite

> Scans source for API identifiers providers have already retired - model
> IDs, REST endpoints, request parameters - and opens the pull request that
> replaces them. Every finding cites the provider's own published page. No
> language model sits anywhere in the detection path.

## Setup

- [Agent setup instructions](${SITE}/setup.md): paste-ready steps for a coding agent
- [README](https://raw.githubusercontent.com/nilaypatell/driftcite/main/README.md)

## Docs

- [How it works](${SITE}/how-it-works)
- [Coverage](${SITE}/coverage)
- [Security](${SITE}/security)
- [Changelog](${SITE}/changelog)
`;

export function GET() {
  return new Response(BODY, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
