"use client";

import { useId, useRef, useState } from "react";
import { Hand } from "lucide-react";
import { COMMON_KEYS, toSpotifyEmbedUrl, toYouTubeEmbedUrl } from "@/lib/client/music";
import { SONG_STATUS_LABEL, SONG_STATUS_ORDER } from "@/lib/client/format";
import type { Album, SongStatus } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { t } from "@/lib/i18n";

export type SongFormValues = {
  title: string;
  workflowStatus: SongStatus;
  keySignature: string;
  tempoBpm: string;
  duration: string;
  timeSignature: string;
  isPublic: boolean;
  albumId: string;
  spotifyUrl: string;
  notes: string;
  composers?: string;
  lyricists?: string;
  publisher?: string;
  gemaWorkNumber?: string;
};

export function emptySongValues(): SongFormValues {
  return { title: "", workflowStatus: "draft", keySignature: "", tempoBpm: "", duration: "", timeSignature: "4/4", isPublic: false, albumId: "", spotifyUrl: "", notes: "" };
}

export function durationToInput(seconds: number | null | undefined): string {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Accepts "3:45", "3.45", "225" (seconds) or "3" (minutes). */
export function parseDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,3})[:.,](\d{1,2})$/);
  if (match) {
    return Number(match[1]) * 60 + Math.min(59, Number(match[2]));
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric < 20 ? Math.round(numeric * 60) : Math.round(numeric);
}

export function songValuesToPayload(values: SongFormValues) {
  const bpm = Number(values.tempoBpm.replace(",", "."));
  return {
    title: values.title.trim(),
    workflowStatus: values.workflowStatus,
    keySignature: values.keySignature.trim() || null,
    tempoBpm: Number.isFinite(bpm) && bpm >= 20 && bpm <= 400 ? bpm : null,
    durationSeconds: parseDuration(values.duration),
    timeSignature: /^\d{1,2}\/(1|2|4|8|16)$/.test(values.timeSignature.trim()) ? values.timeSignature.trim() : null,
    isPublic: values.isPublic,
    albumId: values.albumId || null,
    spotifyUrl: values.spotifyUrl.trim() || null,
    notes: values.notes.trim() || null,
    ...(values.composers !== undefined ? {
      composers: values.composers.trim() || null,
      lyricists: values.lyricists?.trim() || null,
      publisher: values.publisher?.trim() || null,
      gemaWorkNumber: values.gemaWorkNumber?.trim() || null,
    } : {}),
  };
}

export function TapTempoButton({ onTempo }: { onTempo: (bpm: number) => void }) {
  const taps = useRef<number[]>([]);
  const [count, setCount] = useState(0);
  return (
    <Button
      variant="secondary"
      size="icon"
      title={t("Tap Tempo – im Takt tippen")}
      aria-label={t("Tap Tempo")}
      onClick={() => {
        const now = performance.now();
        const recent = [...taps.current.filter((time) => now - time < 3000), now].slice(-8);
        taps.current = recent;
        setCount(recent.length);
        if (recent.length >= 2) {
          const intervals = recent.slice(1).map((time, index) => time - recent[index]);
          const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
          onTempo(Math.round(60000 / average));
        }
      }}
    >
      <span className="relative">
        <Hand />
        {count > 0 ? <span className="absolute -right-2 -top-2 text-[9px] font-bold text-accent-text">{count}</span> : null}
      </span>
    </Button>
  );
}

export function SongFormFields({
  values,
  onChange,
  albums,
  compact = false,
}: {
  values: SongFormValues;
  onChange: (values: SongFormValues) => void;
  albums: Album[];
  compact?: boolean;
}) {
  const keyListId = useId();
  const set = <K extends keyof SongFormValues>(key: K, value: SongFormValues[K]) => onChange({ ...values, [key]: value });
  const linkValid = !values.spotifyUrl.trim() || Boolean(toSpotifyEmbedUrl(values.spotifyUrl) || toYouTubeEmbedUrl(values.spotifyUrl));

  return (
    <div className="space-y-4">
      <Field label={t("Titel")}>
        {(id) => <Input id={id} value={values.title} onChange={(event) => set("title", event.target.value)} placeholder={t("z. B. Midnight Run")} autoFocus required />}
      </Field>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={t("Tonart")}>
          {(id) => (
            <>
              <Input id={id} list={keyListId} value={values.keySignature} onChange={(event) => set("keySignature", event.target.value)} placeholder={t("Am")} />
              <datalist id={keyListId}>{COMMON_KEYS.map((key) => <option key={key} value={key} />)}</datalist>
            </>
          )}
        </Field>
        <Field label={t("Tempo (BPM)")}>
          {(id) => (
            <div className="flex gap-1.5">
              <Input id={id} inputMode="decimal" value={values.tempoBpm} onChange={(event) => set("tempoBpm", event.target.value)} placeholder="120" />
              <TapTempoButton onTempo={(bpm) => set("tempoBpm", String(bpm))} />
            </div>
          )}
        </Field>
        <Field label={t("Taktart")}>
          {(id) => (
            <Select id={id} value={values.timeSignature} onChange={(event) => set("timeSignature", event.target.value)}>
              {["4/4", "3/4", "2/4", "6/8", "12/8", "5/4", "7/8", "9/8", "2/2"].map((meter) => <option key={meter} value={meter}>{meter}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("Dauer")} hint={t("z. B. 3:45")}>
          {(id) => <Input id={id} inputMode="decimal" value={values.duration} onChange={(event) => set("duration", event.target.value)} placeholder="3:45" />}
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Status")}>
          {(id) => (
            <Select id={id} value={values.workflowStatus} onChange={(event) => set("workflowStatus", event.target.value as SongStatus)}>
              {SONG_STATUS_ORDER.map((status) => <option key={status} value={status}>{SONG_STATUS_LABEL[status]}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("Album")} optional>
          {(id) => (
            <Select id={id} value={values.albumId} onChange={(event) => set("albumId", event.target.value)}>
              <option value="">{t("Kein Album")}</option>
              {albums.map((album) => <option key={album.id} value={album.id}>{album.title}</option>)}
            </Select>
          )}
        </Field>
      </div>

      <Field label={t("Referenz-Link")} optional hint={linkValid ? t("Spotify- oder YouTube-Link – wird im Song eingebettet.") : undefined} error={linkValid ? undefined : t("Unbekannter Link – Spotify-Track/Album/Playlist oder YouTube-Video verwenden.")}>
        {(id) => (
          <Input id={id} type="url" inputMode="url" value={values.spotifyUrl} onChange={(event) => set("spotifyUrl", event.target.value)} placeholder="https://open.spotify.com/track/…" />
        )}
      </Field>

      {!compact ? (
        <Switch
          checked={values.isPublic}
          onChange={(value) => set("isPublic", value)}
          label={t("Auf der öffentlichen Bandseite zeigen")}
          description={t("Nur wenn die öffentliche Bandseite aktiviert ist – die aktuelle Aufnahme wird dort abspielbar.")}
        />
      ) : null}

      {!compact && values.composers !== undefined ? (
        <details className="group rounded-xl border border-border px-4 py-3 [&_summary::-webkit-details-marker]:hidden" open={Boolean(values.composers || values.lyricists || values.publisher || values.gemaWorkNumber)}>
          <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
            <span>{t("Rechte & GEMA")} <span className="font-normal text-muted">· {t("für die Musikfolge nach dem Gig")}</span></span>
            <span className="text-muted transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={t("Komponist:innen")} optional>{(id) => <Input id={id} value={values.composers ?? ""} onChange={(event) => set("composers", event.target.value)} placeholder={t("z. B. Alex Weber, Kim Brandt")} />}</Field>
            <Field label={t("Texter:innen")} optional>{(id) => <Input id={id} value={values.lyricists ?? ""} onChange={(event) => set("lyricists", event.target.value)} placeholder={t("leer = wie Komposition")} />}</Field>
            <Field label={t("Verlag")} optional>{(id) => <Input id={id} value={values.publisher ?? ""} onChange={(event) => set("publisher", event.target.value)} placeholder={t("leer = verlagsfrei")} />}</Field>
            <Field label={t("GEMA-Werknummer")} optional>{(id) => <Input id={id} value={values.gemaWorkNumber ?? ""} onChange={(event) => set("gemaWorkNumber", event.target.value)} inputMode="numeric" placeholder="1234567-001" />}</Field>
          </div>
        </details>
      ) : null}

      {!compact ? (
        <Field label={t("Notizen")} optional>
          {(id) => <Textarea id={id} rows={3} value={values.notes} onChange={(event) => set("notes", event.target.value)} placeholder={t("Arrangement, Einsätze, Ideen …")} />}
        </Field>
      ) : null}
    </div>
  );
}
