import type { ReactNode } from "react";
import { CORPUS, LINKS, TOTAL_PROVIDERS } from "@/lib/data";

/* The footnotes. globals.css carries no `.evidence`, so the list keeps its
   own drawing here rather than adding another global class name. */

/* `overflow-wrap: anywhere` matters: these are long, unbreakable URLs and
   the citation text is the link. */
const A =
  "text-ink no-underline border-b border-rule-3 hover:border-live-mid [overflow-wrap:anywhere]";

/* li:target — the lime flash when a [n] citation jumps you down here. */
const LI =
  "grid grid-cols-[44px_1fr] gap-[12px] text-[13.5px] text-dim leading-[1.62] px-[10px] py-[13px] target:bg-[var(--l14)]";

const FN = "font-mono text-[11.5px] text-live";

/* The count reads as a word in prose; the figure still comes out of data.ts. */
const WORDS: Record<number, string> = { 7: "seven", 8: "eight", 9: "nine", 10: "ten" };
const providerWord = WORDS[TOTAL_PROVIDERS] ?? String(TOTAL_PROVIDERS);

const NOTES: readonly ReactNode[] = [
  <>
    <a className={A} href={LINKS.circleci}>
      CircleCI post-mortem: workflows not running and jobs failing, March 1,
      2022
    </a>{" "}
    — GitHub announced the endpoint migration on January 21, 2020; the brownout
    broke CircleCI on March 1, 2022.
  </>,
  <>
    <a className={A} href={LINKS.report}>
      driftcite corpus report — {CORPUS.scanned} public repositories, July 2026
    </a>{" "}
    — {CORPUS.attempted} attempted, {CORPUS.scanned} scanned, {CORPUS.failed}{" "}
    failed. Methodology and per-provider counts in the repository; reproducible
    with the public CLI.
  </>,
  <>
    <a className={A} href={LINKS.openaiDeprecations}>
      OpenAI deprecations page
    </a>{" "}
    — one of {providerWord} provider sources; spec-diff providers cite the
    provider&apos;s own git compare, e.g.{" "}
    <a className={A} href={LINKS.stripeOpenapi}>
      stripe/openapi
    </a>
    .
  </>,
  <>
    <a className={A} href={LINKS.pr}>
      Pull request opened by driftcite[bot], August 5, 2026
    </a>{" "}
    — authored, pushed and opened by the App with no human in the loop.
  </>,
];

export default function Evidence() {
  return (
    <div className="border-t border-rule-2 bg-paper-2">
      {/* inline padding: .dc-wrap sets the `padding` shorthand, and an
          unlayered rule beats a utility class */}
      <div
        className="dc-wrap"
        style={{ paddingTop: "58px", paddingBottom: "64px" }}
      >
        <h2 className="text-[20px] font-light leading-[1.16] tracking-[-0.4px]">
          Evidence
        </h2>
        <ol className="mt-[24px] grid list-none gap-[2px]">
          {NOTES.map((note, i) => (
            <li key={i} id={`fn${i + 1}`} className={LI}>
              <span className={FN}>[{i + 1}]</span>
              <span>{note}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
