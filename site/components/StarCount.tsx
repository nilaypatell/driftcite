"use client";

import { useEffect, useState } from "react";
import { LINKS } from "@/lib/data";

const API = LINKS.repo.replace(
  "https://github.com/",
  "https://api.github.com/repos/",
);

/** The live star count inside the GitHub chip. It is the only thing in
 *  the header that needs the client, so it is the only thing that is a
 *  client component. Fails silently: an unauthenticated GitHub call is
 *  rate-limited, and a chip that reads "Star" is a fine outcome. */
export default function StarCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    fetch(API)
      .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
      .then((d) => {
        const n =
          d && typeof d === "object"
            ? (d as { stargazers_count?: unknown }).stargazers_count
            : null;
        if (live && typeof n === "number" && n > 0) setCount(n);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <b hidden={count === null} className="font-mono font-medium tabular-nums">
      {count === null ? null : count.toLocaleString()}
    </b>
  );
}
