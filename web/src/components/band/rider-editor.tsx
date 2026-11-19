"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import type { Rider } from "@/lib/rider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader, Skeleton } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { t } from "@/lib/i18n";
import { RiderShareControls } from "@/components/events/gig-extras";

type StageItem = Rider["stagePlot"][number];

const KIND_LABEL: Record<StageItem["kind"], string> = {
  drums: "Drums", amp: "Gitarrenamp", bass_amp: "Bassamp", keys: "Keys", mic: "Gesangsmikro", monitor: "Monitor",
  di: "DI-Box", person: "Musiker:in", power: "Strom", riser: "Podest", other: "Sonstiges",
};

const TEMPLATE_INPUTS: Rider["inputs"] = [
  { channel: 1, source: "Kick", mic: "Beta 91 / D112", stand: "klein", notes: "" },
  { channel: 2, source: "Snare", mic: "SM57", stand: "klein", notes: "" },
  { channel: 3, source: "Hi-Hat", mic: "Kondensator", stand: "klein", notes: "" },
  { channel: 4, source: "OH L", mic: "Kondensator", stand: "groß", notes: "" },
  { channel: 5, source: "OH R", mic: "Kondensator", stand: "groß", notes: "" },
  { channel: 6, source: "Bass", mic: "DI", stand: "", notes: "" },
  { channel: 7, source: "Gitarre", mic: "SM57", stand: "klein", notes: "" },
  { channel: 8, source: "Gesang", mic: "SM58", stand: "groß", notes: "" },
];

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function StagePlot({ items, onChange, editable }: { items: StageItem[]; onChange: (items: StageItem[]) => void; editable: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const current = items.find((item) => item.id === selected) ?? null;

  const move = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || !dragging) return;
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    onChange(items.map((item) => (item.id === dragging ? { ...item, x: Math.round(x), y: Math.round(y) } : item)));
  };

  return (
    <div className="space-y-3">
      <div
        ref={ref}
        className="relative aspect-[16/9] w-full touch-none select-none overflow-hidden rounded-xl border-2 border-fg/70 bg-surface-2"
        onPointerMove={(event) => move(event.clientX, event.clientY)}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        <span className="absolute inset-x-0 top-1 text-center text-[10px] uppercase tracking-wider text-subtle">{t("Bühnenrückwand")}</span>
        <span className="absolute inset-x-0 bottom-1 text-center text-[10px] uppercase tracking-wider text-subtle">{t("Publikum")}</span>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onPointerDown={(event) => {
              if (!editable) return;
              (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
              setDragging(item.id);
              setSelected(item.id);
            }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-surface px-2 py-1 text-[11px] font-medium shadow-sm",
              editable && "cursor-grab active:cursor-grabbing",
              item.kind === "person" || item.kind === "mic" ? "rounded-full border-accent text-accent-text" : "border-border-strong",
              item.kind === "drums" || item.kind === "riser" ? "min-h-12 min-w-16" : "",
              selected === item.id && "ring-2 ring-accent",
            )}
            style={{ left: `${item.x}%`, top: `${item.y}%` }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {editable ? (
        <div className="flex flex-wrap items-end gap-2">
          <Select aria-label={t("Element hinzufügen")} className="h-9 w-auto" value="" onChange={(event) => {
            const kind = event.target.value as StageItem["kind"];
            if (!kind) return;
            const item = { id: newId(), kind, label: KIND_LABEL[kind], x: 50, y: 50 };
            onChange([...items, item]);
            setSelected(item.id);
          }}>
            <option value="">{t("+ Element")}</option>
            {(Object.keys(KIND_LABEL) as StageItem["kind"][]).map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
          </Select>
          {current ? (
            <>
              <Input aria-label={t("Beschriftung")} className="h-9 w-48" value={current.label} onChange={(event) => onChange(items.map((item) => (item.id === current.id ? { ...item, label: event.target.value.slice(0, 40) } : item)))} />
              <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => {
                onChange(items.filter((item) => item.id !== current.id));
                setSelected(null);
              }}>{t("Entfernen")}</Button>
            </>
          ) : <span className="text-xs text-muted">{t("Elemente auf der Bühne verschieben, antippen zum Bearbeiten.")}</span>}
        </div>
      ) : null}
    </div>
  );
}

export function RiderEditor() {
  const { bandId, band, can } = useSession();
  const { data, mutate } = useSWR<{ rider: Rider }>(bandId ? `/api/bands/${bandId}/rider` : null);
  // Local draft over the loaded rider (derived – no effect needed to copy server data into state).
  const [draft, setDraft] = useState<Rider | null>(null);
  const rider = draft ?? data?.rider ?? null;
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const editable = can("band.manage");

  if (!rider) return <Skeleton className="h-96" />;
  const update = (patch: Partial<Rider>) => setDraft((current) => {
    const base = current ?? data?.rider;
    return base ? { ...base, ...patch } : current;
  });

  const save = async () => {
    if (!bandId) return;
    setSaving(true);
    try {
      const result = await api.put<{ rider: Rider }>(`/api/bands/${bandId}/rider`, rider);
      await mutate(result, { revalidate: false });
      toast.success(t("Rider gespeichert."));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Link href="/app/band" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t("Band")}</Link>
      <PageHeader
        title={t("Tech-Rider & Stage-Plot")}
        description={t(`Für ${band?.name ?? t("die Band")} – das PDF gibt es bei jedem Gig im Kalender.`)}
        actions={editable ? <Button variant="primary" loading={saving} onClick={() => void save()}>{t("Speichern")}</Button> : null}
      />
      {bandId && can("events.manage") ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <RiderShareControls bandId={bandId} eventId={null} manage />
          <span className="text-xs text-muted">{t("Allgemeiner Link ohne Termin – z. B. für Booking-Anfragen. Pro Gig gibt es einen eigenen Link mit Zeiten.")}</span>
        </div>
      ) : null}
      <div className="space-y-6">
        <Card>
          <CardHeader
            title={t("Kanalliste")}
            action={editable ? (
              <div className="flex gap-2">
                {rider.inputs.length === 0 ? <Button size="sm" variant="ghost" onClick={() => update({ inputs: TEMPLATE_INPUTS })}>{t("Vorlage")}</Button> : null}
                <Button size="sm" icon={<Plus />} onClick={() => update({ inputs: [...rider.inputs, { channel: (rider.inputs.at(-1)?.channel ?? 0) + 1, source: "", mic: "", stand: "", notes: "" }] })}>{t("Kanal")}</Button>
              </div>
            ) : null}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="w-14 py-1">{t("Ch")}</th><th>{t("Quelle")}</th><th>{t("Mikro / DI")}</th><th>{t("Stativ")}</th><th>{t("Notiz")}</th><th className="w-8" /></tr></thead>
              <tbody>
                {rider.inputs.map((row, position) => (
                  <tr key={position}>
                    {(["channel", "source", "mic", "stand", "notes"] as const).map((key) => (
                      <td key={key} className="py-1 pr-1.5">
                        <Input
                          className="h-8"
                          disabled={!editable}
                          type={key === "channel" ? "number" : "text"}
                          value={String(row[key])}
                          onChange={(event) => update({ inputs: rider.inputs.map((entry, index) => (index === position ? { ...entry, [key]: key === "channel" ? Number(event.target.value) || 1 : event.target.value } : entry)) })}
                        />
                      </td>
                    ))}
                    <td>{editable ? <button type="button" className="p-1 text-subtle hover:text-danger" aria-label={t("Kanal entfernen")} onClick={() => update({ inputs: rider.inputs.filter((_, index) => index !== position) })}><Trash2 className="size-4" /></button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("Monitormixe")} action={editable ? <Button size="sm" icon={<Plus />} onClick={() => update({ monitors: [...rider.monitors, { mix: rider.monitors.length + 1, who: "", notes: "" }] })}>{t("Mix")}</Button> : null} />
          <div className="space-y-2">
            {rider.monitors.map((monitor, position) => (
              <div key={position} className="grid grid-cols-[4rem_1fr_2fr_auto] gap-2">
                <Input className="h-8" type="number" disabled={!editable} value={monitor.mix} onChange={(event) => update({ monitors: rider.monitors.map((entry, index) => (index === position ? { ...entry, mix: Number(event.target.value) || 1 } : entry)) })} aria-label={t("Mix")} />
                <Input className="h-8" disabled={!editable} value={monitor.who} placeholder={t("Wer")} onChange={(event) => update({ monitors: rider.monitors.map((entry, index) => (index === position ? { ...entry, who: event.target.value } : entry)) })} />
                <Input className="h-8" disabled={!editable} value={monitor.notes} placeholder={t("z. B. viel Gesang, wenig Gitarre")} onChange={(event) => update({ monitors: rider.monitors.map((entry, index) => (index === position ? { ...entry, notes: event.target.value } : entry)) })} />
                {editable ? <button type="button" className="p-1 text-subtle hover:text-danger" aria-label={t("Mix entfernen")} onClick={() => update({ monitors: rider.monitors.filter((_, index) => index !== position) })}><Trash2 className="size-4" /></button> : <span />}
              </div>
            ))}
            {rider.monitors.length === 0 ? <p className="text-sm text-muted">{t("Noch keine Monitormixe.")}</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("Stage-Plot")} />
          <StagePlot items={rider.stagePlot} editable={editable} onChange={(stagePlot) => update({ stagePlot })} />
          <div className="mt-3 grid max-w-sm grid-cols-2 gap-3">
            <Field label={t("Bühnenbreite (m)")} optional>{(id) => <Input id={id} type="number" disabled={!editable} value={rider.stageWidth ?? ""} onChange={(event) => update({ stageWidth: event.target.value ? Number(event.target.value) : null })} />}</Field>
            <Field label={t("Bühnentiefe (m)")} optional>{(id) => <Input id={id} type="number" disabled={!editable} value={rider.stageDepth ?? ""} onChange={(event) => update({ stageDepth: event.target.value ? Number(event.target.value) : null })} />}</Field>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          {([["backline", t("Backline"), t("Was die Band mitbringt / was benötigt wird")], ["hospitality", t("Hospitality"), t("Getränke, Essen, Garderobe, Gästeliste")], ["notes", t("Sonstiges"), t("Strom, Parken, Ansprechpartner")]] as const).map(([key, title, hint]) => (
            <Card key={key}>
              <CardHeader title={title} description={hint} />
              <Textarea rows={6} disabled={!editable} value={rider[key]} onChange={(event) => update({ [key]: event.target.value } as Partial<Rider>)} />
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
