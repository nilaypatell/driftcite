"use client";

import { useEffect } from "react";

/**
 * Every bit of motion on the page, in one place.
 *
 * Purely additive. The markup it animates is already complete and visible
 * in the HTML — this only adds the `anim` class that unlocks the CSS, so a
 * crawler, a reader with JavaScript off, or anyone with reduced motion on
 * gets the finished page rather than a blank one.
 *
 * Sections opt in by naming classes, never by importing this:
 *   .dc-rv            fade-and-rise on entry
 *   [data-count]      count up to data-count on entry
 *   [data-bars]       grow each .fill to its data-pct
 *   [data-dimline]    draw the dimension line
 *   .dc-plot          resolve dot by dot, the dead ones landing last
 */
export default function Motion() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The plot is rendered with opacity 0 so it can fade in. If motion is
    // off it must still be visible, so reveal it immediately and stop.
    const plot = document.querySelector<HTMLElement>(".dc-plot");
    if (reduced) {
      plot?.querySelectorAll<HTMLElement>("b").forEach((d) => (d.style.opacity = "1"));
      return;
    }

    const root = document.documentElement;
    root.classList.add("anim");

    const timers: number[] = [];
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

    // the terminal types itself, driven off the line count
    document
      .querySelectorAll<HTMLElement>(".dc-term .body > *")
      .forEach((el, i) => {
        el.style.animationDelay = `${(0.75 + i * 0.1).toFixed(2)}s`;
      });

    // scroll reveals, lightly staggered within each row
    const reveal = once((el) => el.classList.add("in"), {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px",
    });
    document.querySelectorAll<HTMLElement>(".dc-rv").forEach((el, i) => {
      el.style.transitionDelay = `${(i % 3) * 60}ms`;
      reveal.observe(el);
    });

    // numbers earn their size
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

    // the plot resolves dot by dot; the dead ones land last
    if (plot) {
      once(
        (el) => {
          const dots = Array.from(el.children) as HTMLElement[];
          const clean = dots.filter((d) => !d.classList.contains("hit"));
          const hit = dots.filter((d) => d.classList.contains("hit"));
          clean.forEach((d, i) =>
            timers.push(window.setTimeout(() => (d.style.opacity = "1"), i * 1.1))
          );
          hit.forEach((d, i) =>
            timers.push(
              window.setTimeout(() => (d.style.opacity = "1"), 340 + i * 2.2)
            )
          );
        },
        { threshold: 0.25 }
      ).observe(plot);
    }

    // draughtsman's marks draw themselves
    const dim = once((el) => el.classList.add("in"), { threshold: 0.5 });
    document.querySelectorAll("[data-dimline]").forEach((el) => dim.observe(el));

    const bars = once(
      (el) => {
        el.querySelectorAll<HTMLElement>(".fill").forEach((f, i) =>
          timers.push(
            window.setTimeout(() => {
              f.style.width = `${f.dataset.pct}%`;
            }, i * 90)
          )
        );
      },
      { threshold: 0.4 }
    );
    document.querySelectorAll("[data-bars]").forEach((el) => bars.observe(el));

    return () => {
      observers.forEach((io) => io.disconnect());
      timers.forEach((t) => window.clearTimeout(t));
      root.classList.remove("anim");
    };
  }, []);

  return null;
}
