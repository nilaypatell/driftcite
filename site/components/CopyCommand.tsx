"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@/components/icons";
import { COMMAND } from "@/lib/data";



/**
 * The `$ npx driftcite .` button. Used twice — hero and CTA band — so the
 * copied state lives per instance rather than on a shared id.
 *
 * The two icons are stacked in one fixed-size box and cross-fade, so the
 * button never changes width and nothing beside it shifts. A rejected
 * clipboard write leaves the icon alone rather than lying about success.
 */
export default function CopyCommand() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    navigator.clipboard
      ?.writeText(COMMAND)
      .then(() => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
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

      {/* the visible state is an icon, so announce the change for screen
          readers rather than leaving them with an unchanged button */}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
