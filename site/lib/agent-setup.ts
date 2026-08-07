/* ═══════════════════════════════════════════════════════════════════════
   The setup prompt for coding agents, in one place.

   Three surfaces serve this exact string and must never disagree:
     - the "Setup for agents" hero button copies it to the clipboard
     - /setup.md serves it as a file (app/setup.md/route.ts)
     - /llms.txt points agents at that file

   Two deliberate constraints on the text itself:

   Pure printable ASCII. This string's whole life is being pasted through
   clipboards into terminal UIs. Em-dashes, curly quotes and non-breaking
   spaces are exactly the characters that arrive mangled or invisible, and
   an invisible character in a command is a command that fails. The
   postbuild check (scripts/verify-agent-artifacts.mjs) enforces this.

   No backticks. Indented code blocks instead of fences, plain flag names
   instead of inline code. The string lives in a template literal, and one
   unescaped backtick would truncate it silently at authoring time.

   The version pin is deliberate: a drift-detection tool that publishes a
   floating install command would be describing itself. The postbuild check
   asserts this pin matches the repository's package.json, so bumping the
   version without updating the prompt fails the site build instead of
   shipping instructions for a CLI nobody can fetch.
   ═══════════════════════════════════════════════════════════════════════ */

const PIN = "0.2.1";

export const AGENT_SETUP_PROMPT = `Set up driftcite in this repository.

OBJECTIVE: Scan this repo for API identifiers the providers have already
retired, show me every finding with its citation, and - only with my
approval - wire driftcite into CI.

DONE WHEN: the scan in Step 1 has run and I have seen one table row per
finding with the provider's evidence URL reproduced exactly.

RULES
- Do not run --fix --write or --write-baseline until I approve.
- Do not create or edit any file until I have seen the diff and said yes.
- Report findings as-is: no triage, no re-ranking, no rewording, and no
  findings of your own. Every finding is asserted by a provider's own
  published page; model judgement does not belong in this loop.
- If a command fails, stop and show me its output. Do not work around it.

TODO
- [ ] Step 0 - check for an existing install
- [ ] Step 1 - run the scan (read-only)
- [ ] Step 2 - report the findings
- [ ] Step 3 - propose fixes, a baseline, and CI, then wait
- [ ] Step 4 - hand the GitHub App install back to me

Step 0 - check for an existing install

Look for a driftcite step in .github/workflows/, a .driftcite-baseline.json,
and a .driftciteignore. If any exist, tell me which, then do Steps 1 and 2
only and stop. Change nothing.

Step 1 - run the scan (read-only)

    npx -y driftcite@${PIN} . --json

It reads source and lockfiles on this machine; nothing is uploaded. It exits
1 when anything breaking was found, so for this scan a non-zero exit is the
expected result, not an error. Verify the pin resolved:

    npx -y driftcite@${PIN} --version

That must print ${PIN}. If it does not, or the registry cannot serve it,
stop and show me.

Step 2 - report the findings

The JSON's top-level keys are root, feed, findings, suppressed, registry.
Each finding carries: artifact, file, line, context, severity, status,
daysLeft, retires_on, replacement, evidence, excerpt, note.

Report one table row per finding:

    artifact | file:line | severity | daysLeft | replacement | evidence

with evidence reproduced character for character as a bare URL. Never
replace the table with a count. If there are no findings, say so and skip
the fix options in Step 3.

Step 3 - propose, then wait

Offer me these, run none of them yet:

    npx -y driftcite@${PIN} . --fix              (prints the swaps, writes nothing)
    npx -y driftcite@${PIN} . --fix --write      (applies only provider-named swaps)
    npx -y driftcite@${PIN} . --write-baseline   (accept today's findings; CI then fails only on new drift)

Most repos with findings want the baseline on day one; a build that fails
forever is a build people delete the check from. Then show me a proposed
.github/workflows/driftcite.yml as a diff and wait for my approval:

    name: driftcite
    on: [push]
    permissions:
      contents: read
    jobs:
      scan:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
          - uses: nilaypatell/driftcite@v${PIN}

Step 4 - this step is mine, not yours

STOP. You cannot install the driftcite GitHub App: it needs my signed-in
browser, a permissions review, and a repository selection. Tell me to open
https://github.com/apps/driftcite and click Install, and do not report this
task complete without saying that.

EXECUTE NOW: start at Step 0. Stop when I have the findings table with every
evidence URL intact.
`;
