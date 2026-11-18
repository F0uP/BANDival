"use client";

import { useEffect } from "react";

function countUp(root: Element) {
  const targets = root.matches("[data-count]") ? [root] : Array.from(root.querySelectorAll("[data-count]"));
  for (const element of targets) {
    const target = Number(element.getAttribute("data-count"));
    if (!Number.isFinite(target)) continue;
    const suffix = element.getAttribute("data-suffix") ?? "";
    const start = performance.now();
    const duration = 1400;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      element.textContent = `${Math.round(target * eased).toLocaleString("de-DE")}${suffix}`;
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/**
 * The only client code of the landing page: reveals on scroll, the pointer spotlight on cards,
 * counting numbers and the glass state of the navigation. Everything else is CSS.
 */
export function LandingEffects() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        if (!reduced) countUp(entry.target);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));

    const onPointerMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.<HTMLElement>("[data-spotlight]");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    };
    document.addEventListener("pointermove", onPointerMove, { passive: true });

    const nav = document.querySelector<HTMLElement>("[data-lp-nav]");
    const onScroll = () => nav?.toggleAttribute("data-scrolled", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <noscript>
      <style>{".lp-reveal{opacity:1!important;transform:none!important;filter:none!important}.lp-type{width:auto!important}.lp-out{opacity:1!important}"}</style>
    </noscript>
  );
}
