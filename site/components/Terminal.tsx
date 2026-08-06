import { Plate, Wrap } from "@/components/primitives";

/** The hero terminal. A transcript, not a live widget — the whole thing is
 *  one `role="img"` with a written description, because a screen reader
 *  reading fourteen lines of shell output learns nothing from them.
 *
 *  `dc-hero-term` is the hook Motion.tsx animates; the line-by-line typing
 *  is driven off `.dc-term .body > *`, so every output line must stay a
 *  direct child of `.body`. */
export default function Terminal() {
  return (
    <Wrap className="dc-hero-term pb-[36px]">
      <Plate className="dc-term">
        {/* role/aria-label sit on this wrapper rather than the plate itself:
            Plate owns the crop-mark span, which is decoration and does not
            belong inside the described image. */}
        <div
          role="img"
          aria-label="Terminal: driftcite reports a retired OpenAI model at models.py line 6, with the provider's evidence link, then rewrites it in place"
        >
          <div className="bar">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
            <span className="ttl">driftcite</span>
            <span className="rt">9.4s · 1,204 files</span>
          </div>
          <div className="body">
            <div>
              <span className="p">$</span> npx driftcite .
            </div>
            <div>&nbsp;</div>
            <div>
              <span className="brk">DEAD</span>  <span className="art">openai/model_id/text-davinci-003</span>
            </div>
            <div className="in mut">
              retired 2024-01-04 · <span className="brk">935 days ago</span> · requests fail
            </div>
            <div className="in mut">
              replace with <span className="ok">gpt-3.5-turbo-instruct</span> <span className="fnt">(named by the provider)</span>
            </div>
            <div className="in fnt">cite  developers.openai.com/api/docs/deprecations</div>
            <div className="in fnt">site  models.py:6</div>
            <div>&nbsp;</div>
            <div>
              <span className="p">$</span> npx driftcite . --fix --write
            </div>
            <div className="in">
              <span className="brk">-</span> <span className="mut">LEGACY = &quot;text-davinci-003&quot;</span>
            </div>
            <div className="in">
              <span className="ok">+</span> <span className="mut">LEGACY = &quot;gpt-3.5-turbo-instruct&quot;</span>
            </div>
            <div className="in fnt">1 file written · 0 skipped</div>
            <div>&nbsp;</div>
            <div>
              <span className="p">$</span> <span className="dc-cursor" />
            </div>
          </div>
        </div>
      </Plate>
    </Wrap>
  );
}
