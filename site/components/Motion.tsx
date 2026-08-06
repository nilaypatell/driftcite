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
 *   .dc-rv           fade-and-rise when scrolled into view
 *   [data-count]     count up to data-count on entry
 */
export default function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    root.classList.add("anim");

    const observers: IntersectionObserver[] = [];

    // entry stagger: each group counts its own children, so a page with
    // several staggered blocks does not accumulate one long delay
    document.querySelectorAll<HTMLElement>("[data-stagger]").forEach((group) => {
      const step = Number(group.dataset.stagger) || 120;
      group.querySelectorAll<HTMLElement>(".dc-rise").forEach((el, i) => {
        el.style.animationDelay = `${(i * step) / 1000}s`;
      });
    });

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

    const reveal = once((el) => el.classList.add("in"), {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px",
    });
    document.querySelectorAll<HTMLElement>(".dc-rv").forEach((el, i) => {
      el.style.transitionDelay = `${(i % 3) * 70}ms`;
      reveal.observe(el);
    });

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

    return () => {
      observers.forEach((io) => io.disconnect());
      root.classList.remove("anim");
    };
    // re-run per route: a client navigation swaps the DOM these observe
  }, [pathname]);

  return null;
}
