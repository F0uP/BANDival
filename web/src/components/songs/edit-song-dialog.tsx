"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/client/api";
import { saveDoc, useSaveFeedback } from "@/lib/client/sync";
import { useAlbums } from "@/lib/client/hooks";
import type { SongDetail } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { durationToInput, SongFormFields, songValuesToPayload, type SongFormValues } from "@/components/songs/song-form";
import { t } from "@/lib/i18n";

function toValues(song: SongDetail): SongFormValues {
  return {
    title: song.title,
    workflowStatus: song.workflowStatus,
    keySignature: song.keySignature ?? "",
    tempoBpm: song.tempoBpm ? String(Number(song.tempoBpm)) : "",
    duration: durationToInput(song.durationSeconds),
    timeSignature: song.timeSignature ?? "4/4",
    isPublic: song.isPublic,
    albumId: song.albumId ?? "",
    spotifyUrl: song.spotifyUrl ?? "",
    notes: song.notes ?? "",
    composers: song.composers ?? "",
    lyricists: song.lyricists ?? "",
    publisher: song.publisher ?? "",
    gemaWorkNumber: song.gemaWorkNumber ?? "",
  };
}

function EditForm({ song, onClose, onSaved }: { song: SongDetail; onClose: () => void; onSaved: () => void }) {
  const { bandId } = useSession();
  const albums = useAlbums(bandId);
  const [values, setValues] = useState(() => toValues(song));
  const [saving, setSaving] = useState(false);
  // The revision this form started from – the server merges changes others made meanwhile.
  const [baseRevision] = useState(song.revision ?? null);
  const toast = useToast();
  const feedback = useSaveFeedback();

  const save = async () => {
    if (!values.title.trim()) return;
    setSaving(true);
    try {
      const result = await saveDoc({ url: `/api/songs/${song.id}`, body: { ...songValuesToPayload(values), baseRevision }, key: `song:${song.id}`, title: values.title });
      feedback(result, t("Song gespeichert."));
      onSaved();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form id="edit-song-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <SongFormFields values={values} onChange={setValues} albums={albums.data?.albums ?? []} />
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>{t("Abbrechen")}</Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!values.title.trim()}>{t("Speichern")}</Button>
      </div>
    </form>
  );
}

export function EditSongDialog({ song, open, onClose, onSaved }: { song: SongDetail; open: boolean; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t("Song bearbeiten")}>
      {open ? <EditForm key={song.updatedAt} song={song} onClose={onClose} onSaved={onSaved} /> : null}
    </Dialog>
  );
}
