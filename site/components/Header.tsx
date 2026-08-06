import { Mark, Wrap } from "@/components/primitives";
import StarCount from "@/components/StarCount";
import { LINKS } from "@/lib/data";

/* The header is not in globals.css on purpose: it is one bar, used once,
   so it carries its own utilities rather than adding two more global
   class names (`header`, `.bar`) for the rest of the page to collide
   with. `.dc-term .bar` already exists and means something else. */

/** Nav links vanish under 560px — at that width the chip and the button
 *  are the only two things worth the room. */
const LNK =
  "max-[560px]:hidden text-[13.5px] text-dim no-underline px-[10px] py-[7px] rounded-[6px] hover:text-ink hover:bg-rule-1";

export default function Header() {
  return (
    <header className="sticky top-0 z-30 bg-paper/84 backdrop-blur-[12px] backdrop-saturate-[140%] border-b border-rule-2">
      <Wrap className="flex items-center gap-[12px] py-[13px]">
        <a href="/" className="flex items-center gap-[9px] no-underline">
          <Mark size={22} />
          <span className="text-[17.5px] font-medium tracking-[-0.5px]">
            driftcite
          </span>
        </a>
        <nav className="ml-auto flex items-center gap-[4px]">
          <a className={LNK} href="#watches">
            What it watches
          </a>
          <a className={LNK} href="#corpus">
            Corpus
          </a>
          <a className={LNK} href={LINKS.readme}>
            Docs
          </a>
          <a
            className="inline-flex items-center gap-[7px] text-[13px] text-dim no-underline border border-rule-3 rounded-[6px] px-[10px] py-[6px] bg-paper hover:border-ghost hover:text-ink"
            href={LINKS.repo}
            aria-label="driftcite on GitHub"
          >
            <svg viewBox="0 0 16 16" width={15} height={15} aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
              />
            </svg>
            <span>Star</span>
            <StarCount />
          </a>
          <a className="dc-btn" href={LINKS.app}>
            Install the App
          </a>
        </nav>
      </Wrap>
    </header>
  );
}
