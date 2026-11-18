"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { saveDoc, useSaveFeedback } from "@/lib/client/sync";
import { useSongParts } from "@/lib/client/hooks";
import type { SongPart } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { ChordSheet } from "@/components/songs/chord-sheet";

const SUGGESTED = ["Bass", "Keys", "Drums", "Gitarre 2", "Backing Vocals", "Bläser"];

/** Instrument-specific parts of a lead sheet (e.g. bass tab, drum notes, keys voicings). */
export function usePartsSelector(songId: string) {
  const { data, mutate } = useSongParts(songId);
  return { parts: data?.parts ?? [], mutate };
}

export function PartView({ part, transpose, fontSize }: { part: SongPart; transpose: number; fontSize: number }) {
  if (part.kind === "chordpro") return <ChordSheet text={part.content} transpose={transpose} fontSize={fontSize} showChords />;
  return (
    <pre className="overflow-x-auto whitespace-pre font-mono leading-snug" style={{ fontSize: Math.max(11, fontSize - 3) }}>
      {part.content}
    </pre>
  );
}

export function PartEditor({ songId, part, open, onClose, onSaved }: { songId: string; part: SongPart | null; open: boolean; onClose: () => void; onSaved: (part: SongPart) => void }) {
  const [instrument, setInstrument] = useState(part?.instrument ?? "");
  const [kind, setKind] = useState<SongPart["kind"]>(part?.kind ?? "tab");
  const [content, setContent] = useState(part?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [baseRevision] = useState(part?.revision ?? null);
  const toast = useToast();
  const feedback = useSaveFeedback();

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveDoc<{ part: SongPart }>({
        method: "PUT",
        url: `/api/songs/${songId}/parts`,
        body: { instrument: instrument.trim(), kind, content, baseRevision },
        key: `part:${songId}:${instrument.trim().toLowerCase()}`,
        title: `Stimme ${instrument.trim()}`,
      });
      feedback(result);
      if (result.data?.part) onSaved(result.data.part);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={part ? `Stimme: ${part.instrument}` : "Neue Stimme"} size="lg">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Instrument">
            {(id) => (
              <>
                <Input id={id} list={`${id}-list`} value={instrument} onChange={(event) => setInstrument(event.target.value)} disabled={Boolean(part)} required placeholder="z. B. Bass" />
                <datalist id={`${id}-list`}>{SUGGESTED.map((value) => <option key={value} value={value} />)}</datalist>
              </>
            )}
          </Field>
          <Field label="Format">
            {(id) => (
              <Select id={id} value={kind} onChange={(event) => setKind(event.target.value as SongPart["kind"])}>
                <option value="tab">Tabulatur / Monospace</option>
                <option value="chordpro">Akkorde & Text (ChordPro)</option>
                <option value="text">Notizen</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Inhalt" hint={kind === "tab" ? "Leerzeichen bleiben erhalten – ideal für Tabs und Drum-Patterns." : kind === "chordpro" ? "[Am]Akkorde in eckigen Klammern oder „Akkorde über Text“." : undefined}>
          {(id) => (
            <Textarea
              id={id}
              rows={14}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="font-mono text-sm"
              placeholder={kind === "tab" ? "G|-----------------|\nD|-----------------|\nA|-----3-----5-----|\nE|-0-------0-----3-|" : ""}
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!instrument.trim()}>Speichern</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function PartActions({ songId, part, onChanged, onCreate }: { songId: string; part: SongPart | null; onChanged: () => void; onCreate: () => void }) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const remove = async () => {
    if (!part) return;
    const ok = await confirm({ title: `Stimme „${part.instrument}“ löschen?`, confirmLabel: "Löschen", tone: "danger" });
    if (!ok) return;
    try {
      await api.delete(`/api/songs/${songId}/parts/${part.id}`);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <>
      {part ? (
        <>
          <Button size="sm" icon={<Pencil />} onClick={() => setEditing(true)}>Stimme bearbeiten</Button>
          <Button size="icon-sm" variant="ghost" aria-label="Stimme löschen" onClick={() => void remove()}><Trash2 /></Button>
          {editing ? <PartEditor key={part.id} songId={songId} part={part} open={editing} onClose={() => setEditing(false)} onSaved={onChanged} /> : null}
        </>
      ) : null}
      <Button size="sm" variant="ghost" icon={<Plus />} onClick={onCreate}>Stimme</Button>
    </>
  );
}
