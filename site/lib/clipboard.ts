/**
 * One clipboard write, shared by the hero's two copy affordances.
 *
 * The contract callers rely on: call this SYNCHRONOUSLY inside the click
 * handler, with a string that already exists. No await may sit between the
 * user's click and the writeText call — Safari's transient-activation
 * window is what authorises the write, and versions before 26.5.2 only
 * forward it across an async hop for one second. A module-level constant
 * costs nothing to keep ready; a fetch here would be a bug.
 *
 * Resolves true only when the text actually reached a clipboard. The old
 * code read `.then` off `navigator.clipboard?.writeText(...)` — on any
 * plain-HTTP origin (previewing the static export over LAN, for instance)
 * `navigator.clipboard` is undefined, the optional chain yields undefined,
 * and reading `.then` threw a synchronous TypeError that no catch saw.
 * There, and when the write is rejected (Chromium refuses while DevTools
 * holds focus), this falls back to the deprecated execCommand path, which
 * is the only mechanism insecure contexts have.
 */
export function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text),
    );
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.readOnly = true;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
