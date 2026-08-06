import type { ReactNode } from "react";
import { Plate, Section, Tag, Wrap } from "@/components/primitives";
import { LINKS, TOTAL_ARTIFACTS, TOTAL_PROVIDERS } from "@/lib/data";

/* The three rungs: local run, CI gate, unattended App. globals.css has no
   `.rung`, so the rung's own drawing (number, bottom-aligned code block,
   the featured tint and its flag) is carried here as utilities. */

/* The copy spells the provider count as a word. The map keeps the prose
   reading like prose while the figure still comes out of data.ts. */
const WORDS: Record<number, string> = { 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten" };
const providerWord = WORDS[TOTAL_PROVIDERS] ?? String(TOTAL_PROVIDERS);

type Rung = {
  no: string;
  title: string;
  body: ReactNode;
  code: string;
  href: string;
  go: string;
  /** the App: tinted, lime-numbered, flagged unattended */
  featured?: boolean;
};

const RUNGS: readonly Rung[] = [
  {
    no: "01",
    title: "Run it once",
    body: (
      <>
        Zero dependencies. No account, no upload, no telemetry. {providerWord}{" "}
        providers, {TOTAL_ARTIFACTS} retired artifacts, plus every npm and PyPI
        package your lockfiles already pin.
      </>
    ),
    code: "npx driftcite .",
    href: LINKS.npm,
    go: "the package",
  },
  {
    no: "02",
    title: "Make it a gate",
    body: (
      <>
        One step in your workflow. Exit 1 the moment a call site goes dead,
        evidence links in the job summary, and a baseline so existing debt
        doesn&apos;t fail every build from day one.
      </>
    ),
    code: "- uses: nilaypatell/driftcite@main",
    href: LINKS.ci,
    go: "the action",
  },
  {
    no: "03",
    title: "Let it open the PR",
    body: (
      <>
        Install the App and stop checking. When a provider retires something you
        call, the branch is pushed and the pull request is open before you hear
        about it — carrying the replacement the provider named and its citation.
      </>
    ),
    code: "github.com/apps/driftcite",
    href: LINKS.app,
    go: "install it",
    featured: true,
  },
];

export default function Rungs() {
  return (
    <Section>
      <Wrap>
        <div
          className="dc-rv text-center"
          style={{ maxWidth: "40em", margin: "0 auto 38px" }}
        >
          <Tag center>Local, gated, or automatic</Tag>
          <h2 className="dc-h2">
            Start with a command.
            <br />
            End with a pull request.
          </h2>
        </div>

        <Plate className="dc-rv">
          <div className="dc-cells c3">
            {RUNGS.map((rung) => (
              <div
                key={rung.no}
                className="dc-cell relative flex flex-col"
                style={rung.featured ? { background: "var(--l8)" } : undefined}
              >
                {rung.featured && (
                  <span
                    className="absolute top-[24px] right-[24px] px-[7px] py-[3px] font-mono text-[9.5px] tracking-[1.3px] uppercase"
                    style={{
                      color: "var(--color-ink)",
                      background: "var(--color-live-bright)",
                    }}
                  >
                    Unattended
                  </span>
                )}
                <div
                  className="mb-[13px] font-mono text-[10.5px] tracking-[1.6px]"
                  style={{
                    color: rung.featured ? "var(--color-live)" : "var(--color-ghost)",
                  }}
                >
                  [ {rung.no} ]
                </div>
                <h3 className="dc-h3">{rung.title}</h3>
                {/* flex-1 so every code block sits on the same line */}
                <p
                  className="mt-[8px] flex-1 text-[14px] leading-[1.62]"
                  style={{ color: "var(--color-dim)" }}
                >
                  {rung.body}
                </p>
                <pre
                  className="mt-[16px] overflow-x-auto px-[12px] py-[10px] font-mono text-[11.8px]"
                  style={{
                    color: "var(--color-ink)",
                    background: "var(--color-paper-2)",
                    border: "1px solid var(--color-rule-2)",
                  }}
                >
                  {rung.code}
                </pre>
                <a className="dc-go" href={rung.href}>
                  {rung.go}
                </a>
              </div>
            ))}
          </div>
        </Plate>
      </Wrap>
    </Section>
  );
}
