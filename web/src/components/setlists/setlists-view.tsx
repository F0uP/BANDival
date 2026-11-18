"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, ListMusic, Plus, Search } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatDateShort, formatRelative, formatTotalDuration } from "@/lib/client/format";
import { useSetlists, useSongs } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";

function CreateSetlistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bandId } = useSession();
  const songs = useSongs(open ? bandId : null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const revalidate = useRevalidate();

  const candidates = (songs.data?.songs ?? [])
    .filter((song) => song.workflowStatus !== "archived")
    .filter((song) => !query.trim() || song.title.toLowerCase().includes(query.trim().toLowerCase()));

  const submit = async () => {
    if (!name.trim() || !bandId) return;
    setSaving(true);
    try {
      const result = await api.post<{ setlist: { id: string } }>("/api/setlists", { bandId, name: name.trim(), description: description.trim() || null, songIds: selected });
      await revalidate("/api/setlists");
      setName("");
      setDescription("");
      setSelected([]);
      onClose();
      router.push(`/app/setlists/${result.setlist.id}`);
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
      title="Neue Setlist"
      footer={(
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={() => void submit()}>
            Setlist erstellen{selected.length > 0 ? ` (${selected.length} Songs)` : ""}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Field label="Name">
          {(id) => <Input id={id} autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="z. B. Clubshow Freitag" />}
        </Field>
        <Field label="Beschreibung" optional>
          {(id) => <Textarea id={id} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ablauf, Besetzung, Hinweise" />}
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium">Songs auswählen</span>
            <span className="text-xs text-muted">Reihenfolge = Klick-Reihenfolge</span>
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Songs filtern" className="pl-9" />
          </div>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-border p-1">
            {candidates.length === 0 ? <li className="py-4 text-center text-sm text-muted">Keine Songs gefunden.</li> : null}
            {candidates.map((song) => {
              const index = selected.indexOf(song.id);
              return (
                <li key={song.id}>
                  <button
                    type="button"
                    onClick={() => setSelected((current) => (index >= 0 ? current.filter((id) => id !== song.id) : [...current, song.id]))}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm", index >= 0 ? "bg-accent-soft" : "hover:bg-surface-2")}
                  >
                    <span className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold",
                      index >= 0 ? "border-accent bg-accent text-accent-fg" : "border-border-strong",
                    )}>
                      {index >= 0 ? index + 1 : null}
                    </span>
                    <span className="flex-1 truncate">{song.title}</span>
                    {song.keySignature ? <span className="text-xs text-muted">{song.keySignature}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}

export function SetlistsView() {
  const { bandId, can } = useSession();
  const setlists = useSetlists(bandId);
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const createOpen = params.get("new") === "1";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (setlists.data?.setlists ?? []).filter((setlist) =>
      !q || `${setlist.name} ${setlist.description ?? ""} ${setlist.items.map((item) => item.song.title).join(" ")}`.toLowerCase().includes(q));
  }, [query, setlists.data]);

  const now = new Date().toISOString();

  return (
    <>
      <PageHeader
        title="Setlists"
        description="Plane Shows und Proben – mit Reihenfolge, Übergängen und Bühnenmodus."
        actions={can("setlists.create") ? (
          <Button variant="primary" icon={<Plus />} onClick={() => router.replace("/app/setlists?new=1")}>Neue Setlist</Button>
        ) : null}
      />

      {(setlists.data?.setlists.length ?? 0) > 4 ? (
        <div className="relative mb-5 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Setlists oder Songs suchen" className="pl-9" />
        </div>
      ) : null}

      {setlists.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-40 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ListMusic />}
          title={query ? "Keine Treffer" : "Noch keine Setlists"}
          description={query ? undefined : "Stell deine erste Setlist zusammen – per Drag & Drop, mit Gesamtdauer und PDF für die Bühne."}
          action={!query && can("setlists.create") ? <Button variant="primary" icon={<Plus />} onClick={() => router.replace("/app/setlists?new=1")}>Setlist erstellen</Button> : null}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((setlist) => {
            const upcoming = setlist.events.find((event) => event.startsAt >= now);
            return (
              <Link key={setlist.id} href={`/app/setlists/${setlist.id}`} className="card group flex flex-col p-5 transition-colors hover:border-border-strong">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="line-clamp-2 font-semibold tracking-tight">{setlist.name}</h2>
                  <ListMusic className="size-4 shrink-0 text-subtle" />
                </div>
                <p className="mt-1 text-sm text-muted">{setlist.items.length} Songs · {formatTotalDuration(setlist.totalSeconds)}</p>
                <ol className="mt-4 flex-1 space-y-1 text-[13px] text-muted">
                  {setlist.items.slice(0, 4).map((item, index) => (
                    <li key={item.id} className="flex gap-2 truncate"><span className="w-4 text-right tabular-nums text-subtle">{index + 1}</span><span className="truncate">{item.song.title}</span></li>
                  ))}
                  {setlist.items.length > 4 ? <li className="pl-6 text-subtle">+ {setlist.items.length - 4} weitere</li> : null}
                </ol>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
                  {upcoming ? (
                    <span className="flex items-center gap-1.5 font-medium text-accent-text"><CalendarDays className="size-3.5" />{upcoming.title} · {formatDateShort(upcoming.startsAt)}</span>
                  ) : (
                    <span>Geändert {formatRelative(setlist.updatedAt)}</span>
                  )}
                  {setlist.items.length > 0 && setlist.items.every((item) => item.song.workflowStatus === "approved") ? (
                    <span className="flex items-center gap-1 text-success"><Check className="size-3.5" />bühnenreif</span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <CreateSetlistDialog open={createOpen} onClose={() => router.replace("/app/setlists")} />
    </>
  );
}
