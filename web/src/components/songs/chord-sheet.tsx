"use client";

import { ChordLyricsPair, ChordProParser, ChordsOverWordsParser, Tag, type Song } from "chordsheetjs";
import { Fragment, useMemo } from "react";
import { cn } from "@/lib/client/cn";

const SECTION_LABELS: Record<string, string> = {
  chorus: "Refrain",
  verse: "Strophe",
  bridge: "Bridge",
  tab: "Tab",
  grid: "Grid",
  part: "Teil",
};

export function looksLikeChordPro(text: string): boolean {
  return /\[[A-H][^\]\n]{0,10}\]/.test(text) || /\{[a-z_]+(:[^}]*)?\}/i.test(text);
}

export function parseChordSheet(text: string): Song | null {
  if (!text.trim()) return null;
  try {
    return looksLikeChordPro(text) ? new ChordProParser().parse(text) : new ChordsOverWordsParser().parse(text);
  } catch {
    try {
      return new ChordProParser().parse(text);
    } catch {
      return null;
    }
  }
}

/**
 * Renders a ChordPro / chords-over-words sheet as React elements (no innerHTML → no XSS).
 */
export function ChordSheet({
  text,
  transpose = 0,
  fontSize = 16,
  showChords = true,
  className,
}: {
  text: string;
  transpose?: number;
  fontSize?: number;
  showChords?: boolean;
  className?: string;
}) {
  const song = useMemo(() => {
    const parsed = parseChordSheet(text);
    if (!parsed || !transpose) return parsed;
    try {
      return parsed.transpose(transpose, { normalizeChordSuffix: false });
    } catch {
      return parsed;
    }
  }, [text, transpose]);

  if (!song) {
    return <pre className="whitespace-pre-wrap font-sans" style={{ fontSize }}>{text}</pre>;
  }

  return (
    <div className={cn("chord-sheet", !showChords && "cs-no-chords", className)} style={{ fontSize }}>
      {song.paragraphs.map((paragraph, paragraphIndex) => {
        const type = String(paragraph.type ?? "none");
        const label = (paragraph as unknown as { label?: string | null }).label ?? SECTION_LABELS[type] ?? null;
        const rows = paragraph.lines.filter((line) => line.items.some((item) => item instanceof ChordLyricsPair || (item instanceof Tag && item.isComment())));
        if (rows.length === 0) return null;

        return (
          <div key={paragraphIndex} className={cn("cs-paragraph", type === "chorus" && "cs-chorus")}>
            {label && type !== "none" && type !== "indeterminate" ? <div className="cs-label">{label}</div> : null}
            {rows.map((line, lineIndex) => (
              <div key={lineIndex} className="cs-row">
                {line.items.map((item, itemIndex) => {
                  if (item instanceof ChordLyricsPair) {
                    const chords = item.chords ?? "";
                    const lyrics = item.lyrics ?? "";
                    return (
                      <span key={itemIndex} className="cs-column">
                        <span className="cs-chord">{chords}</span>
                        <span className="cs-lyrics">{lyrics || (chords ? " " : "")}</span>
                      </span>
                    );
                  }
                  if (item instanceof Tag && item.isComment()) {
                    return <span key={itemIndex} className="cs-comment">{item.value}</span>;
                  }
                  return <Fragment key={itemIndex} />;
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function LyricsText({ text, fontSize = 16 }: { text: string; fontSize?: number }) {
  return <div className="whitespace-pre-wrap leading-relaxed" style={{ fontSize }}>{text}</div>;
}
