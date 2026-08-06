"use client";

import { useEffect, useRef, useState } from "react";

const COMMAND = "npx driftcite .";

/** The `$ npx driftcite .` button. Used twice — hero and CTA band — so the
 *  copied state lives per instance rather than on a shared id. A rejected
 *  clipboard write is silent: the label simply never changes. */
export default function CopyCommand() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    navigator.clipboard
      .writeText(COMMAND)
      .then(() => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1300);
      })
      .catch(() => {});
  };

  return (
    <button className="dc-cmd" title="Copy to clipboard" onClick={copy}>
      <span>
        <span className="d">$</span> {COMMAND}
      </span>
      <span className="c">{copied ? "copied" : "copy"}</span>
    </button>
  );
}
