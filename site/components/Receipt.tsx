import { Cite, EdgeNote, Lede, Mark, Plate, Section, Tag, Wrap } from "@/components/primitives";
import { LINKS } from "@/lib/data";

/* The PR the App opened on its own. Every line below is the real diff
   from that pull request, not an illustration of one. */
const DIFF: readonly { kind: "ctx" | "del" | "add"; text: string }[] = [
  { kind: "ctx", text: "underthesea/agent/providers/anthropic_provider.py" },
  { kind: "del", text: '- DEFAULT_MODEL = "claude-sonnet-4-20250514"' },
  { kind: "add", text: '+ DEFAULT_MODEL = "claude-sonnet-5"' },
  { kind: "ctx", text: "underthesea/agent/providers/google_provider.py" },
  { kind: "del", text: '- MODEL = "gemini-2.0-flash"' },
  { kind: "add", text: '+ MODEL = "gemini-3.5-flash"' },
  { kind: "ctx", text: "tests/agent/test_providers.py" },
  { kind: "del", text: '- self.assertEqual(p.model, "gemini-2.0-flash")' },
  { kind: "add", text: '+ self.assertEqual(p.model, "gemini-3.5-flash")' },
];

export default function Receipt() {
  return (
    <Section>
      <EdgeNote at="tl">[ NO HUMAN IN THE LOOP ]</EdgeNote>
      <Wrap>
        <div className="dc-rv">
          <Tag>Not a mockup</Tag>
          <h2 className="dc-h2">It opened this one itself.</h2>
        </div>
        <Lede className="dc-rv" style={{ marginTop: 18 }}>
          On 2026-08-05 the App found three providers&#39; dead models across four
          files in a real repository, wrote the replacements, pushed a branch and
          opened the pull request.
          <Cite n={4} /> Nobody asked it to. The diff below is that PR.
        </Lede>

        {/* The receipt's chrome is not in globals.css — only .dc-diff is —
            so the head and foot are carried as utilities here. */}
        <Plate className="dc-rv mt-[34px] max-w-[840px]">
          <div className="flex items-center gap-[11px] border-b border-rule-2 px-[17px] py-[13px]">
            <span className="inline-flex flex-none">
              <Mark size={21} />
            </span>
            <span className="text-[13.5px] text-dim">
              <b className="font-medium text-ink">driftcite[bot]</b> opened this
              pull request
            </span>
            <span className="ml-auto border border-rule-3 px-[8px] py-[2px] font-mono text-[9.5px] uppercase tracking-[1.2px] text-dim">
              bot
            </span>
          </div>
          <div className="dc-diff">
            {DIFF.map((line) => (
              <span key={line.text} className={line.kind}>
                {line.text}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-[12px] border-t border-rule-2 px-[17px] py-[12px] text-[13px] text-dim">
            <span className="font-mono text-[12px] text-dim">
              fix: update API identifiers retired by their providers
            </span>
            <a className="ml-auto text-live no-underline" href={LINKS.pr}>
              open the PR →
            </a>
          </div>
        </Plate>
      </Wrap>
    </Section>
  );
}
