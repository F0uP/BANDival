"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/client/api";
import { useAlbums } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { emptySongValues, SongFormFields, songValuesToPayload, type SongFormValues } from "@/components/songs/song-form";

export function CreateSongDialog({ open, onClose, defaultAlbumId }: { open: boolean; onClose: () => void; defaultAlbumId?: string }) {
  const { bandId } = useSession();
  const albums = useAlbums(open ? bandId : null);
  const [values, setValues] = useState<SongFormValues>(() => ({ ...emptySongValues(), albumId: defaultAlbumId ?? "" }));
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const revalidate = useRevalidate();

  const submit = async () => {
    if (!values.title.trim() || !bandId) return;
    setSaving(true);
    try {
      const result = await api.post<{ song: { id: string } }>("/api/songs", { bandId, ...songValuesToPayload(values) });
      await revalidate("/api/songs", "/api/albums");
      setValues(emptySongValues());
      onClose();
      router.push(`/app/songs/${result.song.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Neuer Song"
      description="Details kannst du jederzeit ergänzen – Lead Sheet, Aufnahmen und Noten folgen im Song."
      footer={(
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" loading={saving} disabled={!values.title.trim()} onClick={() => void submit()}>Song anlegen</Button>
        </>
      )}
    >
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <SongFormFields values={values} onChange={setValues} albums={albums.data?.albums ?? []} compact />
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
