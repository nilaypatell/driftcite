"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@/components/icons";
import { COMMAND } from "@/lib/data";
import { copyText } from "@/lib/clipboard";

/**
 * The `$ npx -y driftcite .` button. Used twice — hero and CTA band — so the
 * copied state lives per instance rather than on a shared id.
 *
 * The two icons are stacked in one fixed-size box and cross-fade, so the
 * button never changes width and nothing beside it shifts. A rejected
 * clipboard write leaves the icon alone rather than lying about success;
 * the write itself goes through lib/clipboard.ts, which also covers the
 * insecure-origin case where navigator.clipboard does not exist at all.
 *
 * The status region sits outside the button: screen readers do not
 * reliably announce inner-text changes of a control, and a live region
 * inside one can cause the whole control to re-announce.
 */
export default function CopyCommand() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    copyText(COMMAND).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <button
        className="dc-cmd"
        onClick={copy}
        aria-label={`Copy "${COMMAND}" to the clipboard`}
      >
        <span>
          <span className="p">$</span> {COMMAND}
        </span>

        <span className="dc-cmd-icon" data-copied={copied || undefined}>
          <Copy size={15} className="i-copy" />
          <Check size={15} className="i-check" />
        </span>
      </button>

      <span role="status" aria-atomic="true" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
