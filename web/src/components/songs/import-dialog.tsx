"use client";

import { useRef, useState } from "react";
import { FileText, ListPlus, Music } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { useRevalidate } from "@/lib/client/mutations";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/navigation";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { t } from "@/lib/i18n";

type ImportSong = {
  title: string;
  keySignature?: string | null;
  tempoBpm?: number | null;
  timeSignature?: string | null;
  durationSeconds?: number | null;
  chordProText?: string | null;
  spotifyUrl?: string | null;
};

function directive(text: string, ...names: string[]): string | null {
  for (const name of names) {
    const match = new RegExp(`\\{\\s*${name}\\s*:\\s*([^}]*)\\}`, "i").exec(text);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

/** ChordPro / plain text file → song (title from {title:} or the file name). */
export function parseSongFile(name: string, text: string): ImportSong {
  const tempo = Number(directive(text, "tempo", "bpm"));
  const time = directive(text, "time");
  const duration = directive(text, "duration");
  const durationMatch = duration ? /^(\d+):(\d{2})$/.exec(duration) : null;
  return {
    title: (directive(text, "title", "t") ?? name.replace(/\.(cho|chopro|chordpro|crd|pro|txt)$/i, "").replace(/[_]+/g, " ")).slice(0, 200),
    keySignature: directive(text, "key")?.slice(0, 20) ?? null,
    tempoBpm: Number.isFinite(tempo) && tempo >= 20 && tempo <= 400 ? tempo : null,
    timeSignature: time && /^\d{1,2}\/(1|2|4|8|16)$/.test(time) ? time : null,
    durationSeconds: durationMatch ? Number(durationMatch[1]) * 60 + Number(durationMatch[2]) : null,
    chordProText: text.slice(0, 50000),
  };
}

/** "Title - Key - BPM" per line (key and BPM optional, separators: - | ; or tab). */
export function parseTitleList(text: string): ImportSong[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\s+[-–|;]\s+|\t/).map((part) => part.trim()).filter(Boolean);
    const song: ImportSong = { title: parts[0].slice(0, 200) };
    for (const part of parts.slice(1)) {
      const bpm = /^(\d{2,3})(\s*bpm)?$/i.exec(part);
      if (bpm) song.tempoBpm = Number(bpm[1]);
      else if (/^[A-H][#b]?(m|moll|dur)?$/i.test(part)) song.keySignature = part;
      else if (/^\d{1,2}:\d{2}$/.test(part)) song.durationSeconds = Number(part.split(":")[0]) * 60 + Number(part.split(":")[1]);
    }
    return song;
  });
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bandId } = useSession();
  const [mode, setMode] = useState<"files" | "list" | "spotify">("files");
  const [songs, setSongs] = useState<ImportSong[]>([]);
  const [list, setList] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const revalidate = useRevalidate();
  const preview = mode === "list" ? parseTitleList(list) : songs;

  const readFiles = async (files: FileList) => {
    const parsed = await Promise.all(Array.from(files).slice(0, 300).map(async (file) => parseSongFile(file.name, await file.text())));
    setSongs(parsed);
  };

  const loadSpotify = async () => {
    if (!bandId) return;
    setLoading(true);
    try {
      const result = await api.get<{ songs: ImportSong[] }>(`/api/import/spotify?bandId=${bandId}&url=${encodeURIComponent(spotifyUrl)}`);
      setSongs(result.songs);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!bandId || preview.length === 0) return;
    setLoading(true);
    try {
      const result = await api.post<{ created: number; skipped: number }>("/api/songs/import", { bandId, songs: preview, skipExisting: true });
      await revalidate("/api/songs");
      toast.success(t(`${result.created} Songs importiert${result.skipped ? t(`, ${result.skipped} schon vorhanden`) : ""}.`));
      setSongs([]);
      setList("");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("Songs importieren")} size="md">
      <div className="space-y-4">
        <Segmented
          className="w-full"
          value={mode}
          onChange={(value) => {
            setMode(value as typeof mode);
            setSongs([]);
          }}
          items={[{ value: "files", label: t("ChordPro-Dateien") }, { value: "list", label: t("Titelliste") }, { value: "spotify", label: t("Spotify") }]}
        />
        {mode === "files" ? (
          <div className="rounded-xl border border-dashed border-border-strong p-5 text-center">
            <FileText className="mx-auto mb-2 size-6 text-muted" />
            <p className="text-sm">{t(".cho, .chordpro, .crd oder .txt – Titel, Tonart und Tempo werden aus den Direktiven gelesen.")}</p>
            <Button className="mt-3" onClick={() => fileRef.current?.click()}>{t("Dateien wählen")}</Button>
            <input ref={fileRef} type="file" multiple accept=".cho,.chopro,.chordpro,.crd,.pro,.txt,text/plain" className="hidden" onChange={(event) => {
              if (event.target.files?.length) void readFiles(event.target.files);
              event.target.value = "";
            }} />
          </div>
        ) : null}
        {mode === "list" ? (
          <Textarea rows={8} value={list} onChange={(event) => setList(event.target.value)} placeholder={t("Ein Song pro Zeile, optional mit Tonart, BPM und Dauer:\nMidnight Run - Am - 128\nSlow Burn – E – 92 – 4:10\nNeuer Song")} />
        ) : null}
        {mode === "spotify" ? (
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void loadSpotify(); }}>
            <Input value={spotifyUrl} onChange={(event) => setSpotifyUrl(event.target.value)} placeholder="https://open.spotify.com/playlist/…" />
            <Button type="submit" icon={<Music />} loading={loading && songs.length === 0} disabled={!spotifyUrl.trim()}>{t("Laden")}</Button>
          </form>
        ) : null}
        {preview.length ? (
          <div>
            <p className="mb-1.5 text-sm font-medium">{preview.length} {t("Songs")}</p>
            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
              {preview.map((song, index) => (
                <li key={`${song.title}-${index}`} className="flex justify-between gap-2 px-3 py-1.5">
                  <span className="truncate">{song.title}</span>
                  <span className="shrink-0 text-xs text-muted">{[song.keySignature, song.tempoBpm ? `${song.tempoBpm} BPM` : null, song.chordProText ? t("Lead Sheet") : null].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-muted">{t("Songs mit gleichem Titel werden übersprungen.")}</p>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("Abbrechen")}</Button>
          <Button variant="primary" icon={<ListPlus />} loading={loading && preview.length > 0} disabled={preview.length === 0} onClick={() => void submit()}>{t("Importieren")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
