"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { Check, Copy } from "@/components/icons";
import { AGENT_SETUP_PROMPT } from "@/lib/agent-setup";
import { copyText } from "@/lib/clipboard";

/**
 * The "Setup for agents" hero button. One click puts the whole setup prompt
 * on the clipboard, ready to paste into Claude Code, Cursor, Codex, or any
 * other coding agent. A plain copy, deliberately: a clipboard string works
 * for every agent including ones that do not exist yet, where a deeplink
 * covers two of them and fails silently on desktop Chrome when the handler
 * is not registered — no event fires, so not even a fallback can know.
 *
 * Same mechanics as CopyCommand: the label swaps to "Copied" but both
 * labels occupy one grid cell so the button never changes width, the icon
 * cross-fades, and a failed write leaves the button alone rather than
 * claiming success. The live region sits OUTSIDE the button element —
 * screen readers do not reliably announce inner-text changes of a control,
 * and some re-announce the whole control when a descendant region fires.
 */
export default function SetupForAgents() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    // Synchronous call with a module-level constant — no await sits between
    // the click and the clipboard write. See lib/clipboard.ts for why.
    copyText(AGENT_SETUP_PROMPT).then((ok) => {
      if (!ok) return;
      track("agent_setup_copied");
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <button
        className="dc-btn dc-btn-secondary"
        onClick={copy}
        aria-label="Setup for agents — copy the driftcite setup prompt to your clipboard"
        style={{ minHeight: 44, paddingInline: 24, fontSize: 15 }}
      >
        {/* both labels share one cell; the wider one sets the width once */}
        <span style={{ display: "inline-grid", textAlign: "center" }}>
          <span
            style={{ gridArea: "1 / 1", visibility: copied ? "hidden" : "visible" }}
            aria-hidden={copied || undefined}
          >
            Setup for agents
          </span>
          <span
            style={{ gridArea: "1 / 1", visibility: copied ? "visible" : "hidden" }}
            aria-hidden={!copied || undefined}
          >
            Copied
          </span>
        </span>

        <span className="dc-cmd-icon" data-copied={copied || undefined}>
          <Copy size={15} className="i-copy" />
          <Check size={15} className="i-check" />
        </span>
      </button>

      {/* pre-rendered empty so the region exists before the first message;
          role=status with explicit aria-atomic, per ARIA22 */}
      <span role="status" aria-atomic="true" className="sr-only">
        {copied ? "Setup prompt copied. Paste it into your coding agent." : ""}
      </span>
    </>
  );
}
