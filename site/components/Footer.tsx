import { Mark, Wrap } from "@/components/primitives";
import { LINKS } from "@/lib/data";

/* One footer, used once — so like the header it carries its own utilities
   rather than adding `footer .top` / `.btm` to the global sheet. */

const H4 =
  "mb-[13px] font-mono text-[10.5px] font-normal uppercase tracking-[1.5px] text-faint";
const A = "text-[13.5px] text-dim no-underline hover:text-live";

const COLUMNS: readonly { heading: string; links: readonly { label: string; href: string }[] }[] = [
  {
    heading: "Run it",
    links: [
      { label: "CLI", href: LINKS.npm },
      { label: "GitHub Action", href: LINKS.ci },
      { label: "GitHub App", href: LINKS.app },
      { label: "What it watches", href: "#watches" },
    ],
  },
  {
    heading: "Check it",
    links: [
      { label: "The corpus", href: "#corpus" },
      { label: "report.json", href: LINKS.report },
      { label: "A real PR", href: LINKS.pr },
      { label: "providers.yaml", href: LINKS.providersYaml },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "GitHub", href: LINKS.repo },
      { label: "Architecture", href: LINKS.architecture },
      { label: "Contributing", href: LINKS.contributing },
      { label: "Security", href: LINKS.security },
    ],
  },
];

const BOTTOM = [
  "© 2026 driftcite",
  "apache-2.0",
  "no llm in the detection path",
  "nothing uploaded",
];

export default function Footer() {
  return (
    <footer className="border-t border-rule-2">
      <Wrap>
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-[40px] pt-[50px] pb-[42px] max-[900px]:grid-cols-2 max-[900px]:gap-[30px] max-[560px]:grid-cols-1">
          <div>
            <Mark size={23} />
            <p className="mt-[13px] max-w-[16em] text-[14.5px] leading-[1.5]">
              Static analysis for the strings your dependency tools never look
              at.
            </p>
            <div className="mt-[15px] font-mono text-[11px] tracking-[0.5px] text-faint">
              apache-2.0 · the feed is public
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className={H4}>{col.heading}</h4>
              <ul className="grid list-none gap-[8px]">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a className={A} href={link.href}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-[20px] border-t border-rule-2 py-[18px] font-mono text-[11px] tracking-[0.5px] text-faint">
          {BOTTOM.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </Wrap>
    </footer>
  );
}
