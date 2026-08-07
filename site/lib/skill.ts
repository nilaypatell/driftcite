/* ═══════════════════════════════════════════════════════════════════════
   The skill file for coding agents, in one place.

   /setup.md is the one-time guided install; this is the durable skill an
   agent keeps — when to reach for driftcite and how to run it — installed
   across agents with:

       npx -y skills add https://driftcite.vercel.app

   The skills CLI discovers it through /.well-known/agent-skills/index.json,
   whose sha256 digest is computed from the served bytes at build time by
   scripts/verify-agent-artifacts.mjs. A content-addressed, pinnable
   install artifact is this project's own thesis applied to its own
   distribution.

   Same constraints as agent-setup.ts, same reasons: printable ASCII only,
   no backticks, version pin checked against the repository at build.
   ═══════════════════════════════════════════════════════════════════════ */

const PIN = "0.2.1";

export const SKILL_MD = `---
name: driftcite
description: Find API identifiers in source that providers already retired - model IDs, endpoints, request parameters - each finding cited to the provider's own page. Use when asked about dead APIs, provider deprecations, retirement dates, or before shipping code that calls hosted APIs.
---

# driftcite

Dependency tools read lockfiles, so a provider retiring a model ID, an
endpoint, or a request parameter never shows up in them. driftcite reads
the source itself and reports what is already dead or has a shutdown date,
citing the provider's own published page for every finding. No language
model sits anywhere in its detection path.

## When to use

- The user asks whether their code calls anything deprecated or retired
- Before a release that touches hosted-API calls
- When a provider announces retirements and the user wants their exposure

## How to run it

    npx -y driftcite@${PIN} . --json

Read-only; nothing is uploaded. Exit 1 means breaking findings exist and
is the expected outcome on an affected repo, not an error. The JSON's
top-level keys are root, feed, findings, suppressed, registry. Each
finding carries: artifact, file, line, context, severity, status,
daysLeft, retires_on, replacement, evidence, excerpt, note.

## Rules

- Report findings as-is, one row per finding, with each evidence URL
  reproduced exactly. Do not triage, re-rank, or add findings of your own.
- Never run --fix --write or --write-baseline without the user's approval.
  Propose them; --fix alone prints the patch and writes nothing.
- If a command fails, stop and show the output.

For the full guided setup, including CI, follow
https://driftcite.vercel.app/setup.md
`;
