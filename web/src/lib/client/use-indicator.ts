"use client";

import { useLayoutEffect, type RefObject } from "react";

function setStyles(element: HTMLElement, styles: Record<string, string>) {
  for (const [property, value] of Object.entries(styles)) element.style.setProperty(property, value);
}

/** Places `bar` over `active` (relative to `root`); without animation for the first placement and on resize. */
function placeIndicator(root: HTMLElement, bar: HTMLElement, selector: string, mode: "box" | "underline", animate: boolean) {
  const active = root.querySelector<HTMLElement>(selector);
  if (!active) {
    setStyles(bar, { opacity: "0" });
    return;
  }
  const rootRect = root.getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  const x = rect.left - rootRect.left - root.clientLeft + root.scrollLeft;
  const y = rect.top - rootRect.top - root.clientTop + root.scrollTop;
  if (!animate) setStyles(bar, { transition: "none" });
  setStyles(bar, {
    opacity: "1",
    width: `${rect.width}px`,
    ...(mode === "box"
      ? { height: `${rect.height}px`, transform: `translate3d(${x}px, ${y}px, 0)` }
      : { transform: `translate3d(${x}px, 0, 0)` }),
  });
  if (!animate) {
    void bar.offsetWidth;
    bar.style.removeProperty("transition");
  }
}

/**
 * Moves an absolutely positioned indicator (class `indicator`) onto the active child of a container –
 * the sliding underline of tabs, the thumb of segmented controls and the highlight in the navigation.
 * Works directly on the DOM, so switching never re-renders anything; the CSS transition does the motion.
 */
export function useSlidingIndicator(
  container: RefObject<HTMLElement | null>,
  indicator: RefObject<HTMLElement | null>,
  activeKey: string | null | undefined,
  options: { selector?: string; mode?: "box" | "underline" } = {},
) {
  const selector = options.selector ?? '[data-active="true"]';
  const mode = options.mode ?? "box";

  useLayoutEffect(() => {
    const root = container.current;
    const bar = indicator.current;
    if (!root || !bar) return;

    // First placement without animation, every later change slides.
    placeIndicator(root, bar, selector, mode, bar.dataset.placed === "1");
    bar.setAttribute("data-placed", "1");

    const observer = new ResizeObserver(() => placeIndicator(root, bar, selector, mode, false));
    observer.observe(root);
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) placeIndicator(root, bar, selector, mode, false);
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [container, indicator, activeKey, selector, mode]);
}
