"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Every bit of motion on the site, in one place.
 *
 * Purely additive. The markup it animates is already complete and visible in
 * the HTML — this only adds the `anim` class that unlocks the CSS, so a
 * crawler, a reader with JavaScript off, or anyone with reduced motion on
 * gets the finished page rather than a blank one.
 *
 * Pages opt in by naming classes, never by importing this:
 *   .dc-rise         staggered entry, index read off DOM order in its group
 *   [data-stagger]   container whose .dc-rise children stagger ~120ms apart
 *   .dc-rv           fade, rise and focus when scrolled into view
 *   .dc-hr           hairline that draws itself from the left
 *   .dc-kick-lead    the kicker's dotted leader, same draw
 *   [data-bar]       measured bar, grows from its axis to --w
 *   .dc-term         transcript panel, one light pass on first sight
 *   [data-count]     count up to data-count on entry
 *   [data-parallax]  drifts against the scroll by up to N px
 */
export default function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    root.classList.add("anim");

    const observers: IntersectionObserver[] = [];

    const once = (
      cb: (el: Element) => void,
      opts?: IntersectionObserverInit
    ): IntersectionObserver => {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            cb(e.target);
            obs.unobserve(e.target);
          }
        });
      }, opts);
      observers.push(io);
      return io;
    };

    /* ── entry stagger ──────────────────────────────────────────────
       Each group counts its own children, so a page with several
       staggered blocks does not accumulate one long delay. */
    document.querySelectorAll<HTMLElement>("[data-stagger]").forEach((group) => {
      const step = Number(group.dataset.stagger) || 120;
      group.querySelectorAll<HTMLElement>(".dc-rise").forEach((el, i) => {
        el.style.animationDelay = `${(i * step) / 1000}s`;
      });
    });

    /* ── reveal on scroll ───────────────────────────────────────────
       The delay is the element's position among its own siblings, not
       its position in the document. A row of three cards arrives as a
       row of three; the section under it starts from zero again, which
       an index taken across the whole page could not express. */
    const inGroup = new Map<Element | null, number>();
    const reveal = once((el) => el.classList.add("in"), {
      threshold: 0.1,
      rootMargin: "0px 0px -60px 0px",
    });
    document.querySelectorAll<HTMLElement>(".dc-rv").forEach((el) => {
      const parent = el.parentElement;
      const i = inGroup.get(parent) ?? 0;
      inGroup.set(parent, i + 1);
      el.style.transitionDelay = `${Math.min(i, 5) * 80}ms`;
      reveal.observe(el);
    });

    /* ── rules, bars and the transcript ─────────────────────────────
       All three are the same gesture — hold the finished state back,
       then hand it over when the reader gets there — so they share one
       observer and differ only in what the CSS does with `.in`. */
    const draw = once((el) => el.classList.add("in"), {
      threshold: 0.15,
      rootMargin: "0px 0px -40px 0px",
    });
    document
      .querySelectorAll(".dc-hr, .dc-kick-lead, [data-bar], .dc-term")
      .forEach((el) => draw.observe(el));

    /* ── count up ───────────────────────────────────────────────────
       Grouping is applied at every frame, not only the last, so a
       four-digit figure never flickers between grouped and ungrouped. */
    const countUp = (el: Element, end: number, dp: number) => {
      const t0 = performance.now();
      const dur = 1100;
      const tick = (t: number) => {
        const p = Math.min((t - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (end * eased)
          .toFixed(dp)
          .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const counter = once(
      (el) => {
        const raw = (el as HTMLElement).dataset.count;
        if (raw === undefined) return;
        const end = Number(raw);
        countUp(el, end, Number.isInteger(end) ? 0 : 1);
      },
      { threshold: 0.5 }
    );
    document.querySelectorAll("[data-count]").forEach((el) => counter.observe(el));

    /* ── scroll: header state, read progress, parallax ──────────────
       One passive listener, one rAF, one write pass. Reading layout
       inside the frame rather than inside the event is what keeps this
       off the scrolling thread's critical path. */
    const drifters = Array.from(
      document.querySelectorAll<HTMLElement>("[data-parallax]")
    );

    let frame = 0;
    const paint = () => {
      frame = 0;
      const y = window.scrollY;
      const vh = window.innerHeight;

      root.toggleAttribute("data-scrolled", y > 8);

      const max = document.body.scrollHeight - vh;
      root.style.setProperty(
        "--dc-progress",
        max > 0 ? String(Math.min(Math.max(y / max, 0), 1)) : "0"
      );

      /* Distance from the viewport's centre, in viewport heights, times
         the element's own amplitude, clamped to one screen either side.
         An element centred in the window sits exactly where the layout
         put it, and the clamp is what makes `data-parallax="26"` mean
         "never more than 26px from where it was designed to be" rather
         than growing without bound as the page scrolls past. */
      for (const el of drifters) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) continue;
        const amp = Number(el.dataset.parallax) || 0;
        const centre = (r.top + r.height / 2 - vh / 2) / vh;
        const clamped = Math.max(-1, Math.min(1, centre));
        el.style.setProperty("--py", `${(clamped * amp).toFixed(2)}px`);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    paint();

    return () => {
      observers.forEach((io) => io.disconnect());
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      root.removeAttribute("data-scrolled");
      root.style.removeProperty("--dc-progress");
      root.classList.remove("anim");
    };
    // re-run per route: a client navigation swaps the DOM these observe
  }, [pathname]);

  return null;
}
