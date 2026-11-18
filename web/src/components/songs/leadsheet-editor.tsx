"use client";

import { useRef, useState } from "react";
import { FileUp, Sparkles } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { saveDoc, useSaveFeedback } from "@/lib/client/sync";
import type { SongDetail } from "@/lib/client/types";
import { useAiStatus } from "@/lib/client/hooks";
import { useSession } from "@/components/providers/session";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/navigation";
import { useToast } from "@/components/ui/feedback";
import { ChordSheet, LyricsText } from "@/components/songs/chord-sheet";

const EXAMPLE = `{title: Mein Song}
{key: Am}

{start_of_verse: Strophe 1}
[Am]Hier steht der [F]Text mit [C]Akkorden
[G]direkt über den [Am]Silben
{end_of_verse}

{start_of_chorus}
[F]Refrain [G]hier [Am]
{end_of_chorus}

{comment: Gitarrensolo – 8 Takte}`;

function EditorBody({ song, onClose, onSaved }: { song: SongDetail; onClose: () => void; onSaved: () => void }) {
  const [chords, setChords] = useState(song.chordProText ?? "");
  const [lyrics, setLyrics] = useState(song.lyricsRevisions[0]?.lyricsMarkdown ?? "");
  const [field, setField] = useState<"chords" | "lyrics">(song.chordProText || !song.lyricsRevisions[0] ? "chords" : "lyrics");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const ai = useAiStatus();
  const { bandId } = useSession();

  /** "Chords over lyrics" (or messy text) → clean ChordPro via the configured AI provider. */
  const convert = async () => {
    if (!bandId || !chords.trim()) return;
    setConverting(true);
    try {
      const result = await api.post<{ chordPro: string }>("/api/ai/assist", { task: "chordpro", bandId, text: chords });
      if (result.chordPro) setChords(result.chordPro);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setConverting(false);
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const feedback = useSaveFeedback();
  // Base for the git-like merge: edits of others in other sections are combined with yours.
  const [baseRevision] = useState(song.revision ?? null);

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveDoc({
        url: `/api/songs/${song.id}`,
        body: { chordProText: chords.trim() || null, lyricsMarkdown: lyrics.trim() || null, baseRevision },
        key: `song:${song.id}`,
        title: song.title,
      });
      feedback(result, "Lead Sheet gespeichert.");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const value = field === "chords" ? chords : lyrics;
  const setValue = field === "chords" ? setChords : setLyrics;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3 sm:px-6">
        <Segmented
          size="sm"
          value={field}
          onChange={setField}
          items={[{ value: "chords", label: "Akkorde (ChordPro)" }, { value: "lyrics", label: "Nur Text" }]}
        />
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            className="lg:hidden"
            value={mobileView}
            onChange={setMobileView}
            items={[{ value: "edit", label: "Bearbeiten" }, { value: "preview", label: "Vorschau" }]}
          />
          {ai.data?.enabled && field === "chords" && chords.trim() ? (
            <Button size="sm" variant="ghost" icon={<Sparkles />} loading={converting} onClick={() => void convert()} title={`Mit KI in ChordPro umwandeln (${ai.data.provider})`}>
              <span className="hidden sm:inline">In ChordPro umwandeln</span>
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon={<FileUp />} onClick={() => fileRef.current?.click()}>
            <span className="hidden sm:inline">Datei laden</span>
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".cho,.crd,.chopro,.chordpro,.pro,.txt,text/plain"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) setValue(await file.text());
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <div className={mobileView === "preview" ? "hidden lg:flex lg:flex-col" : "flex flex-col"}>
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={field === "chords" ? EXAMPLE : "Songtext ohne Akkorde …"}
            className="min-h-[50dvh] flex-1 rounded-none border-0 border-b border-border font-mono text-[13px] shadow-none focus:ring-0 lg:border-b-0 lg:border-r"
            spellCheck={field === "lyrics"}
          />
        </div>
        <div className={mobileView === "edit" ? "hidden overflow-y-auto p-5 lg:block" : "overflow-y-auto p-5"}>
          {value.trim() ? (
            field === "chords" ? <ChordSheet text={value} /> : <LyricsText text={value} />
          ) : (
            <p className="text-sm text-muted">Die Vorschau erscheint hier.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs text-muted">
          Akkorde in eckige Klammern: <code className="rounded bg-surface-2 px-1">[Am]Text</code> · Abschnitte mit <code className="rounded bg-surface-2 px-1">{"{start_of_chorus}"}</code> · „Akkorde über Text“ wird auch erkannt.
        </p>
        <div className="flex gap-2">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>Speichern</Button>
        </div>
      </div>
    </>
  );
}

export function LeadSheetEditor({ song, open, onClose, onSaved }: { song: SongDetail; open: boolean; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} bare size="xl" className="sm:h-[85dvh]">
      <div className="flex items-center justify-between px-5 pb-1 pt-4 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Lead Sheet bearbeiten</h2>
          <p className="text-sm text-muted">{song.title}</p>
        </div>
      </div>
      {open ? <EditorBody key={song.updatedAt} song={song} onClose={onClose} onSaved={onSaved} /> : null}
    </Dialog>
  );
}
