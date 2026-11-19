"use client";

import { AudioWaveform, Download } from "lucide-react";
import type { SongDetail } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

/** Tempo/key estimated from the current recording – offered when it differs from what the song says. */
export function DetectedSuggestion({ song, onApply }: { song: SongDetail; onApply: (values: { tempoBpm?: number; keySignature?: string }) => void }) {
  const audio = song.audioVersions.find((version) => version.isCurrent) ?? song.audioVersions[0];
  if (!audio) return null;
  const bpm = audio.detectedBpm ? Math.round(audio.detectedBpm) : null;
  const key = audio.detectedKey ?? null;
  const currentBpm = song.tempoBpm ? Number(song.tempoBpm) : null;
  const bpmDiffers = bpm !== null && (currentBpm === null || Math.abs(currentBpm - bpm) > 1.5);
  const keyDiffers = key !== null && (song.keySignature ?? "").replace(/\s/g, "").toLowerCase() !== key.toLowerCase();
  if (!bpmDiffers && !keyDiffers) return null;

  const parts = [bpmDiffers ? `${bpm} BPM` : null, keyDiffers ? key : null].filter(Boolean).join(" · ");
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accent-soft/50 px-3.5 py-3 text-sm">
      <AudioWaveform className="size-4 shrink-0 text-accent-text" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{t("Aus der Aufnahme erkannt: {values}", { values: parts })}</span>
        <span className="block text-xs text-muted">{t("Automatische Schätzung – bei Halbtempo oder Paralleltonart lieber kurz gegenhören.")}</span>
      </span>
      <Button size="sm" variant="secondary" onClick={() => onApply({ ...(bpmDiffers && bpm ? { tempoBpm: bpm } : {}), ...(keyDiffers && key ? { keySignature: key } : {}) })}>
        {t("Übernehmen")}
      </Button>
    </div>
  );
}

/** Click track (count-in + click for the song's length) as MP3 – for in-ear players and backing-track rigs. */
export function ClickTrackButton({ songId, hasTempo }: { songId: string; hasTempo: boolean }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{t("Click-Track")}</span>
        <span className="block text-xs text-muted">{hasTempo ? t("Ein Takt Einzähler, Betonung auf der Eins, Länge wie der Song.") : t("Trag zuerst ein Tempo ein.")}</span>
      </span>
      <Button size="sm" variant="secondary" icon={<Download />} disabled={!hasTempo} onClick={() => window.open(`/api/songs/${songId}/click?countIn=1`, "_blank")}>
        {t("MP3")}
      </Button>
    </div>
  );
}
