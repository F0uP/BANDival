"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileMusic, FileUp, Plus } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { formatRelative } from "@/lib/client/format";
import { useSongScores } from "@/lib/client/hooks";
import type { SongDetail, SongScoreRecord } from "@/lib/client/types";
import { INSTRUMENTS, normalizeKey, sanitizeScore, type InstrumentId, type ScoreDoc } from "@/lib/notation/model";
import { musicXmlToScore } from "@/lib/notation/import";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/feedback";
import { ScoreRenderer } from "@/components/notation/score-renderer";
import { newScoreFor } from "@/components/notation/score-editor";

function ScorePreview({ score }: { score: SongScoreRecord }) {
  // Only the first lines – the full score opens in the editor.
  const doc = useMemo<ScoreDoc>(() => {
    const full = sanitizeScore(score.data);
    return { ...full, events: full.events.slice(0, 48) };
  }, [score.data]);
  return doc.events.length ? <ScoreRenderer doc={doc} scale={0.85} /> : <p className="py-6 text-center text-sm text-muted">Noch leer – zum Schreiben öffnen.</p>;
}

export function SongScores({ song, readOnly }: { song: SongDetail; readOnly: boolean }) {
  const { data, isLoading, mutate } = useSongScores(song.id);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [instrument, setInstrument] = useState<InstrumentId>("guitar");
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();
  const scores = data?.scores ?? [];

  const create = async (doc: ScoreDoc, scoreTitle: string) => {
    setCreating(true);
    try {
      const result = await api.post<{ score: SongScoreRecord }>(`/api/songs/${song.id}/scores`, { title: scoreTitle, instrument: doc.instrument, data: doc });
      await mutate();
      router.push(`/app/songs/${song.id}/scores/${result.score.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setCreating(false);
    }
  };

  const importFile = async (file: File) => {
    if (/\.mxl$/i.test(file.name)) {
      toast.error("Komprimiertes .mxl wird nicht unterstützt – bitte als unkomprimiertes MusicXML (.musicxml) exportieren.");
      return;
    }
    try {
      const { doc, title: importedTitle, warnings } = musicXmlToScore(await file.text());
      if (warnings.length) toast.info(warnings.join(" "));
      await create(doc, importedTitle || file.name.replace(/\.[^.]+$/, ""));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import fehlgeschlagen.");
    }
  };

  if (isLoading) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-4">
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Plus />} onClick={() => { setTitle(`${INSTRUMENTS[instrument].label}`); setOpen(true); }}>Neue Noten</Button>
          <Button icon={<FileUp />} loading={creating} onClick={() => fileRef.current?.click()}>MusicXML importieren</Button>
          <input ref={fileRef} type="file" accept=".musicxml,.xml,.mxl" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = "";
          }} />
        </div>
      ) : null}

      {scores.length === 0 ? (
        <EmptyState
          icon={<FileMusic />}
          title="Noch keine Noten"
          description="Schreib Riffs, Melodien, Basslinien oder Drum-Grooves direkt in Bandival – mit Tabulatur, Akkordsymbolen und Liedtext. Oder importiere MusicXML aus MuseScore."
        />
      ) : (
        <div className="grid gap-4">
          {scores.map((score) => (
            <Card key={score.id} padded={false} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/app/songs/${song.id}/scores/${score.id}`} className="font-medium hover:underline">{score.title}</Link>
                  <p className="text-xs text-muted">
                    {score.instrument && score.instrument in INSTRUMENTS ? INSTRUMENTS[score.instrument as InstrumentId].label : score.instrument ?? ""}
                    {score.createdBy ? ` · ${score.createdBy.displayName}` : ""} · {formatRelative(score.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {sanitizeScore(score.data).tab ? <Badge>TAB</Badge> : null}
                  <Button size="sm" onClick={() => router.push(`/app/songs/${song.id}/scores/${score.id}`)}>{readOnly ? "Ansehen" : "Bearbeiten"}</Button>
                </div>
              </div>
              <div className="px-3 py-2"><ScorePreview score={score} /></div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Neue Noten" size="sm">
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void create(newScoreFor(instrument, song, normalizeKey), title.trim() || INSTRUMENTS[instrument].label); }}>
          <Field label="Instrument">
            {(id) => (
              <Select id={id} value={instrument} onChange={(event) => {
                const next = event.target.value as InstrumentId;
                if (!title.trim() || Object.values(INSTRUMENTS).some((info) => info.label === title)) setTitle(INSTRUMENTS[next].label);
                setInstrument(next);
              }}>
                {(Object.keys(INSTRUMENTS) as InstrumentId[]).map((id) => <option key={id} value={id}>{INSTRUMENTS[id].label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Titel" hint="z. B. „Intro-Riff“, „Bassline Strophe“, „Groove Refrain“">
            {(id) => <Input id={id} value={title} onChange={(event) => setTitle(event.target.value)} required />}
          </Field>
          <p className="text-xs text-muted">Tonart, Tempo und Taktart werden vom Song übernommen ({[song.keySignature, song.tempoBpm ? `${Number(song.tempoBpm)} BPM` : null, song.timeSignature].filter(Boolean).join(" · ") || "Standard"}).</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button type="submit" variant="primary" loading={creating}>Anlegen & öffnen</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
