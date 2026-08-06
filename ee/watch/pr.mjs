/**
 * Branch names, PR bodies, and the workflows guard. Same voice and same
 * rules as the opt-in workflow in .github/workflows/driftcite-autofix.yml:
 * every claim carries the provider's own evidence URL, and the body says
 * plainly how to make the PRs stop.
 */

export const PR_TITLE = "fix: update API identifiers retired by their providers";

export const BRANCH_PREFIX = "driftcite/";

export const branchName = (day) => `${BRANCH_PREFIX}${day}`;

/**
 * The branch this sweep has already pushed to a repository, if any, read out
 * of `git ls-remote --heads` output.
 *
 * The branch name carries the day it was opened, and the check for "have we
 * been here before" used to ask the remote for today's name only. It found
 * nothing every morning after, so a repository whose providers moved on
 * Tuesday and again on Wednesday collected two pull requests with the same
 * diff, then a third on Thursday. The prefix is the part of the name that
 * does not move, so the prefix is what to ask about.
 */
export function existingBranch(lsRemote) {
  const head = "refs/heads/";
  for (const line of (lsRemote || "").split("\n")) {
    const ref = (line.split("\t")[1] || "").trim();
    if (ref.startsWith(head + BRANCH_PREFIX)) return ref.slice(head.length);
  }
  return null;
}

export function prBody(findings) {
  // One row per artifact however many call sites it has: a retired model
  // used in five files is one problem, not five.
  const seen = new Map();
  for (const f of findings) {
    if (f.severity !== "breaking") continue;
    if (!seen.has(f.artifact)) seen.set(f.artifact, f);
  }
  const rows = [...seen.values()].map((f) => {
    const days = f.daysLeft ?? f.days_left;
    const age = days == null ? ""
      : days < 0 ? ` retired ${Math.abs(days)} days ago`
      : ` retires in ${days} days`;
    return `- \`${f.artifact.split("/").pop()}\`${age}` +
      (f.evidence ? `  \n  evidence: ${f.evidence}` : "");
  });
  return [
    "A provider retired something this repository calls, so these calls now fail.",
    "",
    ...rows,
    "",
    "Each change swaps the retired value for the replacement the provider itself",
    "named. Anything the provider did not name a replacement for was left alone",
    "and is not in this diff.",
    "",
    "Opened by [driftcite](https://github.com/nilaypatell/driftcite), which is",
    "installed on this repository. Uninstall the app to stop these.",
  ].join("\n");
}

/**
 * The App holds contents and pull-requests, never workflows. GitHub rejects
 * a push that changes .github/workflows/ without that scope, so these edits
 * are split out and reverted before anything is committed. The scanner never
 * descends into dot-directories today, which makes this a tripwire for the
 * day that changes rather than a path that runs.
 */
export function splitWorkflowEdits(files) {
  const isWorkflow = (f) => f.startsWith(".github/workflows/");
  return {
    allowed: files.filter((f) => !isWorkflow(f)),
    refused: files.filter(isWorkflow),
  };
}
