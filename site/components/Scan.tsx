"use client";

import { useEffect, useRef, useState } from "react";
import { Lede, Plate, Section, Tag, Wrap } from "@/components/primitives";
import { LINKS } from "@/lib/data";

/* The one section that genuinely needs the client: three panes behind a
   tab strip, and copy buttons. */

/** The slug and host shown in the panes are the same strings the buttons
 *  copy, derived from the canonical links so they cannot drift apart. */
const REPO = LINKS.repo.replace(/^https:\/\/github\.com\//, "");
const APP = LINKS.app.replace(/^https:\/\//, "");

const TABS = [
  { id: "tab-cli", panel: "p-cli", label: "Terminal" },
  { id: "tab-ci", panel: "p-ci", label: "CI" },
  { id: "tab-app", panel: "p-app", label: "Unattended" },
] as const;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className="dc-cbtn"
      onClick={() => {
        // No clipboard (insecure context, or the user said no) is not an
        // error worth reporting — the text is on screen either way.
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1300);
          })
          .catch(() => {});
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

export default function Scan() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + TABS.length) % TABS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const panel = (i: number) => ({
    role: "tabpanel" as const,
    id: TABS[i].panel,
    "aria-labelledby": TABS[i].id,
    hidden: active !== i,
  });

  const paneClass = "dc-split dc-pane";
  const leftHalf = { borderRight: "1px solid var(--color-rule-2)" };

  return (
    <Section>
      <Wrap>
        <div className="dc-rv mx-auto mb-10 max-w-[44em] text-center">
          <Tag center>Read the source, not the manifest</Tag>
          <h2 className="dc-h2">Point it at a repository.</h2>
          <Lede className="mx-auto mt-[18px]">
            It walks your files, extracts every provider identifier you
            actually send, and returns each one with a state, a date, a
            replacement and a link.{" "}
            <b>No language model touches the detection path.</b>
          </Lede>
        </div>

        <div className="dc-rv">
          <div
            className="relative z-[2] -mb-px flex flex-wrap"
            role="tablist"
            aria-label="How to run driftcite"
          >
            {TABS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                className="dc-tab"
                role="tab"
                id={t.id}
                aria-controls={t.panel}
                aria-selected={active === i}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div {...panel(0)}>
            <Plate className={paneClass}>
              <div style={leftHalf}>
                <div className="hd">
                  <span>INPUT</span>
                  <CopyButton text="npx driftcite ." />
                </div>
                <pre>
                  <span className="c"># nothing to install</span>
                  {"\nnpx driftcite .\n\n"}
                  <span className="c">
                    # rewrite only what the provider named
                  </span>
                  {"\nnpx driftcite . "}
                  <span className="k">--fix --write</span>
                  {"\n\n"}
                  <span className="c"># pipe it into your own tooling</span>
                  {"\nnpx driftcite . "}
                  <span className="k">--json</span>
                </pre>
              </div>
              <div>
                <div className="hd">
                  <span>OUTPUT</span>
                </div>
                <pre>
                  {"{\n  "}
                  <span className="k">&quot;artifact&quot;</span>
                  {": "}
                  <span className="s">
                    &quot;openai/model_id/text-davinci-003&quot;
                  </span>
                  {",\n  "}
                  <span className="k">&quot;state&quot;</span>
                  {":    "}
                  <span className="x">&quot;dead&quot;</span>
                  {",\n  "}
                  <span className="k">&quot;retired&quot;</span>
                  {":  "}
                  <span className="s">&quot;2024-01-04&quot;</span>
                  {",\n  "}
                  <span className="k">&quot;days&quot;</span>
                  {":     "}
                  <span className="s">935</span>
                  {",\n  "}
                  <span className="k">&quot;replace&quot;</span>
                  {":  "}
                  <span className="s">&quot;gpt-3.5-turbo-instruct&quot;</span>
                  {",\n  "}
                  <span className="k">&quot;cite&quot;</span>
                  {":     "}
                  <span className="s">&quot;developers.openai.com/…&quot;</span>
                  {",\n  "}
                  <span className="k">&quot;site&quot;</span>
                  {":     "}
                  <span className="s">&quot;models.py:6&quot;</span>
                  {"\n}"}
                </pre>
              </div>
            </Plate>
          </div>

          <div {...panel(1)}>
            <Plate className={paneClass}>
              <div style={leftHalf}>
                <div className="hd">
                  <span>WORKFLOW</span>
                  <CopyButton text={`- uses: ${REPO}@main`} />
                </div>
                <pre>
                  <span className="k">- uses</span>
                  {`: ${REPO}@main\n  `}
                  <span className="k">with</span>
                  {":\n    "}
                  <span className="k">fail-on</span>
                  {": dead\n    "}
                  <span className="k">baseline</span>
                  {": .driftcite-baseline.json"}
                </pre>
              </div>
              <div>
                <div className="hd">
                  <span>RESULT</span>
                </div>
                <pre>
                  <span className="x">✗ 3 dead</span>
                  {" "}
                  <span className="c">·</span>
                  {" 2 retiring "}
                  <span className="c">· exit 1</span>
                  {"\n\n"}
                  <span className="c">
                    {"# The build stops. Evidence links\n# land in the job summary. A\n# baseline file keeps day-one debt\n# from failing every build."}
                  </span>
                </pre>
              </div>
            </Plate>
          </div>

          <div {...panel(2)}>
            <Plate className={paneClass}>
              <div style={leftHalf}>
                <div className="hd">
                  <span>INSTALL</span>
                  <CopyButton text={LINKS.app} />
                </div>
                <pre>
                  {`${APP}\n\n`}
                  <span className="c">
                    {"# two permissions\n# stores artifact IDs\n# never stores your code"}
                  </span>
                </pre>
              </div>
              <div>
                <div className="hd">
                  <span>WHAT ARRIVES</span>
                </div>
                <pre>
                  <span className="c">driftcite[bot] opened a PR</span>
                  {"\n\n"}
                  <span className="c">
                    {"# A provider retires something you\n# call. The pull request is already\n# open when you find out, carrying\n# the replacement they named and\n# the page they named it on."}
                  </span>
                </pre>
              </div>
            </Plate>
          </div>
        </div>
      </Wrap>
    </Section>
  );
}
