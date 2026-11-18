"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, CalendarDays, Copy, FileDown, GripVertical, ListMusic, MessageSquareText, MonitorPlay, MoreHorizontal, Pause, Pencil, Play, Plus, RotateCcw, Search, Sparkles, Trash2, X,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { saveDoc, useSaveFeedback } from "@/lib/client/sync";
import { cn } from "@/lib/client/cn";
import { formatBpm, formatDateShort, formatDuration, formatRelative, formatTime, formatTotalDuration } from "@/lib/client/format";
import { useAiStatus, useMembers, useRehearsalNotes, useSetlist, useSongs } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import type { Setlist, SetlistItem, SongListItem } from "@/lib/client/types";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/display";
import { Field, Input, TagInput, Textarea } from "@/components/ui/form";
import { Menu, Tabs } from "@/components/ui/navigation";
import { SortableList } from "@/components/ui/sortable-list";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { usePlayer } from "@/components/providers/player";
import { useSession } from "@/components/providers/session";
import { TaskBoard } from "@/components/tasks/task-board";

type Tab = "songs" | "rehearsal" | "tasks" | "details";

/** Ranks songs that musically fit after the last song of the setlist (tempo flow, key, readiness). */
function suggestNext(setlist: Setlist, songs: SongListItem[]): SongListItem[] {
  const inSetlist = new Set(setlist.items.map((item) => item.song.id));
  const last = setlist.items.at(-1)?.song;
  const lastTempo = Number(last?.tempoBpm) || 0;
  return songs
    .filter((song) => !inSetlist.has(song.id) && song.workflowStatus !== "archived")
    .map((song) => {
      const tempo = Number(song.tempoBpm) || 0;
      const tempoGap = lastTempo && tempo ? Math.abs(tempo - lastTempo) : 25;
      const keyBonus = last?.keySignature && song.keySignature === last.keySignature ? 15 : 0;
      const readyBonus = song.workflowStatus === "approved" ? 20 : song.workflowStatus === "review" ? 8 : 0;
      return { song, score: readyBonus + keyBonus - tempoGap * 0.6 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.song);
}

function AddSongsDialog({ setlist, open, onClose, onAdd }: { setlist: Setlist; open: boolean; onClose: () => void; onAdd: (songIds: string[]) => Promise<void> }) {
  const { bandId } = useSession();
  const songs = useSongs(open ? bandId : null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const inSetlist = new Set(setlist.items.map((item) => item.song.id));
  const all = songs.data?.songs ?? [];
  const suggestions = suggestNext(setlist, all);
  const candidates = all
    .filter((song) => !inSetlist.has(song.id) && song.workflowStatus !== "archived")
    .filter((song) => !query.trim() || `${song.title} ${song.keySignature ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const row = (song: SongListItem) => {
    const index = selected.indexOf(song.id);
    return (
      <li key={song.id}>
        <button type="button" onClick={() => toggle(song.id)} className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm", index >= 0 ? "bg-accent-soft" : "hover:bg-surface-2")}>
          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold", index >= 0 ? "border-accent bg-accent text-accent-fg" : "border-border-strong")}>
            {index >= 0 ? index + 1 : null}
          </span>
          <span className="flex-1 truncate">{song.title}</span>
          <span className="shrink-0 text-xs text-muted">{[song.keySignature, formatBpm(song.tempoBpm)].filter(Boolean).join(" · ")}</span>
        </button>
      </li>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Songs hinzufügen"
      footer={(
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={selected.length === 0}
            onClick={async () => {
              setSaving(true);
              await onAdd(selected);
              setSaving(false);
              setSelected([]);
              onClose();
            }}
          >
            {selected.length > 0 ? `${selected.length} hinzufügen` : "Hinzufügen"}
          </Button>
        </>
      )}
    >
      {suggestions.length > 0 && !query ? (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium"><Sparkles className="size-3.5 text-accent-text" /> Passt gut danach</div>
          <ul className="space-y-0.5">{suggestions.map(row)}</ul>
        </div>
      ) : null}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Alle Songs durchsuchen" className="pl-9" />
      </div>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto">
        {candidates.length === 0 ? <li className="py-6 text-center text-sm text-muted">Keine weiteren Songs.</li> : null}
        {candidates.map(row)}
      </ul>
    </Dialog>
  );
}

function SongsTab({ setlist, mutateSetlist }: { setlist: Setlist; mutateSetlist: (next?: Setlist) => Promise<unknown> }) {
  const [addOpen, setAddOpen] = useState(false);
  const toast = useToast();
  const feedback = useSaveFeedback();
  const confirm = useConfirm();
  const player = usePlayer();
  const revalidate = useRevalidate();

  const startOffsets = useMemo(
    () => setlist.items.reduce<number[]>((offsets, item, index) => {
      const previous = index === 0 ? 0 : offsets[index - 1] + (setlist.items[index - 1].customDurationSeconds ?? setlist.items[index - 1].song.durationSeconds ?? 0);
      offsets.push(previous);
      return offsets;
    }, []),
    [setlist.items],
  );

  const reorder = async (items: SetlistItem[]) => {
    await mutateSetlist({ ...setlist, items });
    try {
      // Reordering goes through the mergeable song list – concurrent additions or notes of others are kept.
      const result = await saveDoc<{ setlist: Setlist }>({
        url: `/api/setlists/${setlist.id}`,
        body: { songIds: items.map((item) => item.song.id), baseRevision: setlist.revision ?? null },
        key: `setlist:${setlist.id}`,
        title: setlist.name,
      });
      feedback(result);
      await mutateSetlist(result.data?.setlist);
      void revalidate("/api/setlists?");
    } catch (error) {
      toast.error(errorMessage(error));
      await mutateSetlist();
    }
  };

  const replaceSongs = async (songIds: string[]) => {
    try {
      const result = await saveDoc<{ setlist: Setlist }>({ url: `/api/setlists/${setlist.id}`, body: { songIds, baseRevision: setlist.revision ?? null }, key: `setlist:${setlist.id}`, title: setlist.name });
      feedback(result);
      await mutateSetlist(result.data?.setlist);
      void revalidate("/api/setlists?", "/api/songs");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const editNote = async (item: SetlistItem) => {
    const note = await confirm({
      title: `Übergang nach „${item.song.title}“`,
      description: "z. B. „direkt rein“, „Ansage Bassist“, „Capo raus“.",
      confirmLabel: "Speichern",
      input: { defaultValue: item.transitionNotes ?? "", placeholder: "Übergangsnotiz" },
    });
    if (typeof note !== "string") return;
    try {
      feedback(await saveDoc({
        url: `/api/setlists/${setlist.id}/items/${item.id}`,
        body: { transitionNotes: note.trim() || null, baseRevision: setlist.revision ?? null },
        key: `setlist:${setlist.id}`,
        title: setlist.name,
      }));
      await mutateSetlist();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div>
      {setlist.items.length === 0 ? (
        <EmptyState
          icon={<ListMusic />}
          title="Noch keine Songs"
          description="Füge Songs hinzu und ordne sie per Drag & Drop."
          action={<Button variant="primary" icon={<Plus />} onClick={() => setAddOpen(true)}>Songs hinzufügen</Button>}
        />
      ) : (
        <>
          <SortableList
            id={`setlist-${setlist.id}`}
            items={setlist.items}
            getId={(item) => item.id}
            onReorder={(next) => void reorder(next)}
            className="card divide-y divide-border overflow-hidden"
            renderItem={(item, index, handle) => {
              const audio = item.song.audioVersions[0];
              const active = Boolean(audio && player.track?.url === audio.fileUrl && player.playing);
              return (
                <div className="bg-surface px-2 py-2.5 sm:px-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span {...handle} className="cursor-grab touch-none p-1 text-subtle active:cursor-grabbing" aria-label="Verschieben"><GripVertical className="size-4" /></span>
                    <span className="w-6 text-right text-sm font-semibold tabular-nums text-muted">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/songs/${item.song.id}`} className="block truncate text-[15px] font-medium hover:underline">{item.song.title}</Link>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        {item.customKeySignature ?? item.song.keySignature ? <span>{item.customKeySignature ?? item.song.keySignature}</span> : null}
                        {formatBpm(item.song.tempoBpm) ? <span>{formatBpm(item.song.tempoBpm)}</span> : null}
                        <span className="tabular-nums">ab {formatDuration(startOffsets[index]) === "–" ? "0:00" : formatDuration(startOffsets[index])}</span>
                        {item.song.workflowStatus !== "approved" ? <Badge tone="warning">nicht bühnenreif</Badge> : null}
                      </div>
                    </div>
                    <span className="hidden text-sm tabular-nums text-muted sm:inline">{formatDuration(item.customDurationSeconds ?? item.song.durationSeconds)}</span>
                    {audio ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => (player.track?.url === audio.fileUrl ? player.toggle() : player.play({ url: audio.fileUrl, title: item.song.title, subtitle: setlist.name, songId: item.song.id }))}
                        aria-label={active ? "Pause" : "Anhören"}
                      >
                        {active ? <Pause className="fill-current" /> : <Play className="fill-current" />}
                      </Button>
                    ) : null}
                    <Menu
                      trigger={({ toggle }) => <Button size="icon-sm" variant="ghost" onClick={toggle} aria-label="Aktionen"><MoreHorizontal /></Button>}
                      items={[
                        { label: item.transitionNotes ? "Übergang bearbeiten" : "Übergang notieren", icon: <MessageSquareText />, onSelect: () => void editNote(item) },
                        { type: "separator" },
                        { label: "Aus Setlist entfernen", icon: <X />, danger: true, onSelect: () => void replaceSongs(setlist.items.filter((entry) => entry.id !== item.id).map((entry) => entry.song.id)) },
                      ]}
                    />
                  </div>
                  {item.transitionNotes ? (
                    <button type="button" onClick={() => void editNote(item)} className="ml-[3.75rem] mt-1 flex items-center gap-1.5 text-left text-xs italic text-accent-text sm:ml-[4.25rem]">
                      <MessageSquareText className="size-3" /> {item.transitionNotes}
                    </button>
                  ) : null}
                </div>
              );
            }}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <Button icon={<Plus />} onClick={() => setAddOpen(true)}>Songs hinzufügen</Button>
            <span className="text-sm text-muted">Gesamt <span className="font-semibold text-fg">{formatTotalDuration(setlist.totalSeconds)}</span></span>
          </div>
        </>
      )}
      <AddSongsDialog
        setlist={setlist}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(ids) => replaceSongs([...setlist.items.map((item) => item.song.id), ...ids])}
      />
    </div>
  );
}

function RehearsalTab({ setlist }: { setlist: Setlist }) {
  const notes = useRehearsalNotes(setlist.id);
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [timer, setTimer] = useState<{ startedAt: number | null; elapsed: number }>({ startedAt: null, elapsed: 0 });
  const [now, setNow] = useState(0);

  // Tick the display while the timer runs.
  useEffect(() => {
    if (timer.startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [timer.startedAt]);

  const elapsed = Math.floor((timer.elapsed + (timer.startedAt ? Math.max(0, now - timer.startedAt) : 0)) / 1000);
  const noteFor = (songId: string) => notes.data?.notes.find((note) => note.songId === songId);

  const save = async (songId: string) => {
    const value = drafts[songId];
    if (value === undefined) return;
    try {
      await api.patch(`/api/setlists/${setlist.id}/rehearsal`, { songId, note: value });
      await notes.mutate();
      setDrafts((current) => {
        const next = { ...current };
        delete next[songId];
        return next;
      });
      toast.success("Notiz gespeichert.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Probe-Timer</p>
            <p className="mt-1 font-mono text-4xl font-semibold tabular-nums tracking-tight">{formatDuration(elapsed) === "–" ? "0:00" : formatDuration(elapsed)}</p>
            <p className="mt-1 text-xs text-muted">Setlist-Länge: {formatTotalDuration(setlist.totalSeconds)}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              icon={timer.startedAt ? <Pause /> : <Play />}
              onClick={() => {
                const stamp = Date.now();
                setNow(stamp);
                setTimer((current) => (current.startedAt
                  ? { startedAt: null, elapsed: current.elapsed + (stamp - current.startedAt) }
                  : { ...current, startedAt: stamp }));
              }}
            >
              {timer.startedAt ? "Pause" : "Start"}
            </Button>
            <Button icon={<RotateCcw />} onClick={() => setTimer({ startedAt: null, elapsed: 0 })}>Reset</Button>
            <ButtonLink href={`/app/setlists/${setlist.id}/stage`} icon={<MonitorPlay />}>Bühnenmodus</ButtonLink>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {setlist.items.map((item, index) => {
          const saved = noteFor(item.song.id);
          const value = drafts[item.song.id] ?? saved?.note ?? "";
          const dirty = drafts[item.song.id] !== undefined && drafts[item.song.id] !== (saved?.note ?? "");
          return (
            <Card key={item.id}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium"><span className="mr-2 text-muted tabular-nums">{index + 1}.</span>{item.song.title}</span>
                {saved ? <span className="text-xs text-subtle">{saved.updatedBy?.displayName} · {formatRelative(saved.updatedAt)}</span> : null}
              </div>
              <Textarea
                rows={2}
                value={value}
                onChange={(event) => setDrafts((current) => ({ ...current, [item.song.id]: event.target.value }))}
                placeholder="Was lief gut, was üben wir noch? (z. B. „Einsatz Takt 17 sauberer“)"
              />
              {dirty ? (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="primary" onClick={() => void save(item.song.id)}>Speichern</Button>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DetailsTab({ setlist, mutateSetlist }: { setlist: Setlist; mutateSetlist: (next?: Setlist) => Promise<unknown> }) {
  const { bandId } = useSession();
  const members = useMembers(bandId);
  const [description, setDescription] = useState(setlist.description ?? "");
  const [instruments, setInstruments] = useState(setlist.instruments);
  const [equipment, setEquipment] = useState(setlist.equipment);
  const [saving, setSaving] = useState(false);
  const [baseRevision] = useState(setlist.revision ?? null);
  const toast = useToast();
  const feedback = useSaveFeedback();
  const bandInstruments = Array.from(new Set((members.data?.members ?? []).map((member) => member.instrumentPrimary).filter((value): value is string => Boolean(value))));

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveDoc<{ setlist: Setlist }>({
        url: `/api/setlists/${setlist.id}`,
        body: { description: description.trim() || null, instruments, equipment, baseRevision },
        key: `setlist:${setlist.id}`,
        title: setlist.name,
      });
      feedback(result, "Details gespeichert.");
      await mutateSetlist(result.data?.setlist);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <div className="space-y-4">
        <Field label="Beschreibung" optional>
          {(id) => <Textarea id={id} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ablauf, Ansagen, Besetzung, Bühnenplan …" />}
        </Field>
        <Field label="Instrumente" hint="Enter oder Komma zum Hinzufügen">
          {() => <TagInput value={instruments} onChange={setInstruments} placeholder="z. B. Akustikgitarre" suggestions={bandInstruments} />}
        </Field>
        <Field label="Equipment / Packliste" hint="Was muss mit zum Gig?">
          {() => <TagInput value={equipment} onChange={setEquipment} placeholder="z. B. In-Ear-Rack, DI-Boxen" />}
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" loading={saving} onClick={() => void save()}>Speichern</Button>
        </div>
      </div>
    </Card>
  );
}

type AiOrder = { order: string[]; reasoning: string; transitions: Array<{ songId: string; note: string }> };

/** Optional AI suggestion for the set dramaturgy (opener, energy curve, key flow, finale). */
function AiOrderDialog({ setlist, open, onClose, onApplied }: { setlist: Setlist; open: boolean; onClose: () => void; onApplied: (next: Setlist) => void }) {
  const { bandId } = useSession();
  const [goal, setGoal] = useState("");
  const [result, setResult] = useState<AiOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const toast = useToast();
  const byId = new Map(setlist.items.map((item) => [item.song.id, item]));

  const suggest = async () => {
    if (!bandId) return;
    setLoading(true);
    try {
      setResult(await api.post<AiOrder>("/api/ai/assist", { task: "setlist_order", bandId, setlistId: setlist.id, goal: goal.trim() || undefined }));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    setApplying(true);
    try {
      const orderedItemIds = result.order.map((songId) => byId.get(songId)?.id).filter((id): id is string => Boolean(id));
      let next = (await api.patch<{ setlist: Setlist }>(`/api/setlists/${setlist.id}/reorder`, { orderedItemIds })).setlist;
      for (const transition of result.transitions) {
        const item = next.items.find((entry) => entry.song.id === transition.songId);
        if (item && !item.transitionNotes) await api.patch(`/api/setlists/${setlist.id}/items/${item.id}`, { transitionNotes: transition.note.slice(0, 500) });
      }
      next = (await api.get<{ setlist: Setlist }>(`/api/setlists/${setlist.id}`)).setlist;
      onApplied(next);
      onClose();
      toast.success("Neue Reihenfolge übernommen.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Reihenfolge vorschlagen (KI)" size="md">
      <div className="space-y-4">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void suggest(); }}>
          <Input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Ziel (optional), z. B. „ruhiger Start, Party am Ende“" />
          <Button type="submit" icon={<Sparkles />} loading={loading}>Vorschlagen</Button>
        </form>
        {result ? (
          <>
            <p className="rounded-xl bg-surface-2 p-3 text-sm">{result.reasoning}</p>
            <ol className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {result.order.map((songId, index) => {
                const item = byId.get(songId);
                const transition = result.transitions.find((entry) => entry.songId === songId);
                return item ? (
                  <li key={songId} className="flex gap-2">
                    <span className="w-6 text-right tabular-nums text-subtle">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{item.song.title}</span>
                      <span className="ml-2 text-xs text-muted">{[item.song.keySignature, formatBpm(item.song.tempoBpm)].filter(Boolean).join(" · ")}</span>
                      {transition ? <span className="block text-xs text-accent-text">→ {transition.note}</span> : null}
                    </span>
                  </li>
                ) : null;
              })}
            </ol>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Verwerfen</Button>
              <Button variant="primary" loading={applying} onClick={() => void apply()}>Übernehmen</Button>
            </div>
          </>
        ) : <p className="text-xs text-muted">Der Vorschlag ersetzt nur die Reihenfolge; bestehende Übergangsnotizen bleiben erhalten.</p>}
      </div>
    </Dialog>
  );
}

/** Read-only view for guests (session musicians). */
function GuestSetlistView({ setlist }: { setlist: Setlist }) {
  return (
    <div>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted">Geteilte Setlist</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{setlist.name}</h1>
          <p className="mt-2 text-sm text-muted">{setlist.items.length} Songs · {formatTotalDuration(setlist.totalSeconds)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ButtonLink href={`/app/setlists/${setlist.id}/stage`} variant="primary" icon={<MonitorPlay />}>Live-Modus</ButtonLink>
          <Button icon={<FileDown />} onClick={() => window.open(`/api/setlists/${setlist.id}/pdf`, "_blank")}>PDF</Button>
        </div>
      </header>
      {setlist.description ? <p className="mb-5 whitespace-pre-line text-sm text-muted">{setlist.description}</p> : null}
      <Card padded={false}>
        <ol className="divide-y divide-border">
          {setlist.items.map((item, index) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <span className="w-6 pt-0.5 text-right text-sm tabular-nums text-subtle">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/app/songs/${item.song.id}`} className="font-medium hover:underline">{item.song.title}</Link>
                <p className="text-xs text-muted">
                  {[item.song.keySignature, formatBpm(item.song.tempoBpm), formatDuration(item.customDurationSeconds ?? item.song.durationSeconds)].filter(Boolean).join(" · ")}
                </p>
                {item.transitionNotes ? <p className="mt-1 text-xs text-accent-text">→ {item.transitionNotes}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

export function SetlistDetailView({ setlistId }: { setlistId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { can, band } = useSession();
  const ai = useAiStatus();
  const [aiOrderOpen, setAiOrderOpen] = useState(false);
  const { data, error, isLoading, mutate } = useSetlist(setlistId);
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab | null) ?? "songs");
  const confirm = useConfirm();
  const toast = useToast();
  const feedback = useSaveFeedback();
  const revalidate = useRevalidate();

  const setlist = data?.setlist;
  const mutateSetlist = (next?: Setlist) => (next ? mutate({ setlist: next }, { revalidate: false }) : mutate());

  if (error) {
    return <EmptyState icon={<ListMusic />} title="Setlist nicht gefunden" description={errorMessage(error)} action={<Button onClick={() => router.push("/app/setlists")}>Zu den Setlists</Button>} />;
  }
  if (isLoading || !setlist) {
    return <div className="space-y-4"><Skeleton className="h-9 w-1/2" /><Skeleton className="h-64" /></div>;
  }
  if (band?.role === "guest") {
    return <GuestSetlistView setlist={setlist} />;
  }

  const rename = async () => {
    const name = await confirm({ title: "Setlist umbenennen", confirmLabel: "Speichern", input: { defaultValue: setlist.name } });
    if (typeof name !== "string" || !name.trim()) return;
    try {
      const result = await saveDoc<{ setlist: Setlist }>({ url: `/api/setlists/${setlist.id}`, body: { name: name.trim(), baseRevision: setlist.revision ?? null }, key: `setlist:${setlist.id}`, title: name.trim() });
      feedback(result);
      await mutateSetlist(result.data?.setlist);
      void revalidate("/api/setlists?");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const copy = async () => {
    try {
      const result = await api.post<{ setlist: Setlist }>(`/api/setlists/${setlist.id}/copy`);
      await revalidate("/api/setlists");
      toast.success("Kopie erstellt.");
      router.push(`/app/setlists/${result.setlist.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: `„${setlist.name}“ löschen?`, description: "Die Songs selbst bleiben erhalten.", confirmLabel: "Löschen", tone: "danger" });
    if (!ok) return;
    try {
      await api.delete(`/api/setlists/${setlist.id}`);
      await revalidate("/api/setlists");
      router.push("/app/setlists");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const linkedEvents = setlist.events;

  return (
    <div>
      <Link href="/app/setlists" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Setlists
      </Link>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <button type="button" onClick={() => void rename()} className="group flex max-w-full items-center gap-2 text-left">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{setlist.name}</h1>
            <Pencil className="size-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{setlist.items.length} Songs</span>
            <span>·</span>
            <span>{formatTotalDuration(setlist.totalSeconds)}</span>
            {linkedEvents.map((event) => (
              <Link key={event.id} href="/app/calendar" className="flex items-center gap-1 text-accent-text hover:underline">
                <CalendarDays className="size-3.5" /> {event.title} · {formatDateShort(event.startsAt)} {formatTime(event.startsAt)}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <ButtonLink href={`/app/setlists/${setlist.id}/stage`} variant="primary" icon={<MonitorPlay />}>Bühnenmodus</ButtonLink>
          <Button icon={<FileDown />} onClick={() => window.open(`/api/setlists/${setlist.id}/pdf`, "_blank")}>PDF</Button>
          <Menu
            trigger={({ toggle }) => <Button size="icon" onClick={toggle} aria-label="Weitere Aktionen"><MoreHorizontal /></Button>}
            items={[
              { label: "Umbenennen", icon: <Pencil />, onSelect: () => void rename() },
              { label: "Kopieren", icon: <Copy />, onSelect: () => void copy() },
              ...(ai.data?.enabled && setlist.items.length > 2 ? [{ label: "Reihenfolge vorschlagen (KI)", icon: <Sparkles />, onSelect: () => setAiOrderOpen(true) }] : []),
              { label: "PDF herunterladen", icon: <FileDown />, onSelect: () => window.open(`/api/setlists/${setlist.id}/pdf?download=1`, "_blank") },
              { type: "separator" },
              { label: "Löschen", icon: <Trash2 />, danger: true, disabled: !can("setlists.delete"), onSelect: () => void remove() },
            ]}
          />
        </div>
      </header>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: "songs", label: "Songs", count: setlist.items.length },
          { value: "rehearsal", label: "Probe" },
          { value: "tasks", label: "Aufgaben" },
          { value: "details", label: "Details" },
        ]}
      />

      {tab === "songs" ? <SongsTab setlist={setlist} mutateSetlist={mutateSetlist} /> : null}
      {aiOrderOpen ? <AiOrderDialog setlist={setlist} open={aiOrderOpen} onClose={() => setAiOrderOpen(false)} onApplied={(next) => void mutateSetlist(next)} /> : null}
      {tab === "rehearsal" ? <RehearsalTab setlist={setlist} /> : null}
      {tab === "tasks" ? <TaskBoard setlistId={setlist.id} /> : null}
      {tab === "details" ? <DetailsTab key={setlist.updatedAt} setlist={setlist} mutateSetlist={mutateSetlist} /> : null}

      {tab === "songs" && setlist.items.length > 0 && (setlist.instruments.length > 0 || setlist.equipment.length > 0) ? (
        <Card className="mt-6">
          <CardHeader title="Besetzung & Equipment" action={<Button size="sm" variant="ghost" onClick={() => setTab("details")}>Bearbeiten</Button>} />
          <div className="flex flex-wrap gap-1.5">
            {[...setlist.instruments, ...setlist.equipment].map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
