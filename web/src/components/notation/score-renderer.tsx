"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TuneObject } from "abcjs";
import { scoreToAbc, tablatureFor, tokenAt, type AbcToken } from "@/lib/notation/abc";
import type { ScoreDoc } from "@/lib/notation/model";
import { cn } from "@/lib/client/cn";

type Props = {
  doc: ScoreDoc;
  selected?: number | null;
  playing?: number | null;
  onSelect?: (eventIndex: number) => void;
  /** Overrides the automatic measures per line (based on width). */
  measuresPerLine?: number;
  className?: string;
  scale?: number;
};

function highlight(tune: TuneObject | null, tokens: AbcToken[], eventIndex: number | null | undefined, className: string, container: HTMLElement) {
  container.querySelectorAll(`.${className}`).forEach((element) => element.classList.remove(className));
  if (!tune || eventIndex === null || eventIndex === undefined) return null;
  let first: Element | null = null;
  for (const token of tokens) {
    if (token.eventIndex !== eventIndex) continue;
    const element = tune.getElementFromChar(token.start) as { abselem?: { elemset?: Element[] } } | null;
    for (const svg of element?.abselem?.elemset ?? []) {
      svg.classList.add(className);
      first ??= svg;
    }
  }
  return first;
}

/** Renders a score with abcjs (engraving + optional tablature) and maps clicks back to events. */
export function ScoreRenderer({ doc, selected, playing, onSelect, measuresPerLine, className, scale = 1 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tuneRef = useRef<TuneObject | null>(null);
  const tokensRef = useRef<AbcToken[]>([]);
  const onSelectRef = useRef(onSelect);
  const [width, setWidth] = useState(0);
  const [renderCount, setRenderCount] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Narrow screens: engrave at a comfortable width and let the SVG scale down (readable spacing, no collisions).
  const engraveWidth = Math.max(520, width - 24);
  const perLine = measuresPerLine ?? (engraveWidth < 760 ? 2 : engraveWidth < 1000 ? 3 : 4);
  const result = useMemo(() => scoreToAbc(doc, { measuresPerLine: perLine }), [doc, perLine]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || width === 0) return;
    let cancelled = false;
    void import("abcjs").then((abcjs) => {
      if (cancelled) return;
      tokensRef.current = result.tokens;
      const [tune] = abcjs.renderAbc(host, result.abc, {
        responsive: "resize",
        staffwidth: engraveWidth,
        scale,
        add_classes: true,
        foregroundColor: "currentColor",
        selectionColor: "currentColor",
        paddingleft: 0,
        paddingright: 0,
        paddingtop: 8,
        paddingbottom: doc.tab ? 28 : 8,
        tablature: tablatureFor(doc),
        clickListener: (abcElem) => {
          const token = tokenAt(tokensRef.current, abcElem.startChar ?? -1);
          if (token) onSelectRef.current?.(token.eventIndex);
        },
      });
      tuneRef.current = tune ?? null;
      setRenderCount((count) => count + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [result, width, scale, doc, engraveWidth]);

  useEffect(() => {
    if (hostRef.current) highlight(tuneRef.current, tokensRef.current, selected, "score-selected", hostRef.current);
  }, [selected, renderCount]);

  useEffect(() => {
    if (!hostRef.current) return;
    const element = highlight(tuneRef.current, tokensRef.current, playing, "score-playing", hostRef.current);
    element?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [playing, renderCount]);

  return <div ref={hostRef} className={cn("score-render select-none text-fg", onSelect && "[&_.abcjs-note]:cursor-pointer [&_.abcjs-rest]:cursor-pointer", className)} />;
}
