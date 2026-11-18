"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, ArrowRight, Check, ExternalLink, GitMerge, PencilLine, Sparkles, Undo2 } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatRelative } from "@/lib/client/format";
import { lcsMatches } from "@/lib/merge/diff3";
import { splitLines } from "@/lib/merge/text";
import type { DocConflict } from "@/lib/merge/document";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/display";
import { Textarea } from "@/components/ui/form";
import { useConfirm, useToast } from "@/components/ui/feedback";

type ConflictSummary = {
  id: string;
  docType: "song" | "part" | "score" | "setlist";
  docId: string;
  docTitle: string;
  docUrl: string;
  theirsName: string;
  labels: string[];
  status: "open" | "resolved" | "discarded";
  createdAt: string;
  resolvedAt: string | null;
};

const DOC_LABEL: Record<ConflictSummary["docType"], string> = { song: "Song", part: "Stimme", score: "Noten", setlist: "Setlist" };

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export function ConflictsView() {
  const { data, isLoading } = useSWR<{ conflicts: ConflictSummary[] }>("/api/merge-conflicts?all=1");
  const conflicts = data?.conflicts ?? [];
  const open = conflicts.filter((conflict) => conflict.status === "open");
  const done = conflicts.filter((conflict) => conflict.status !== "open");

  return (
    <>
      <PageHeader
        eyebrow="Zusammenführen"
        title="Merge-Konflikte"
        description="Wenn du und jemand anderes – oder du offline – dieselbe Stelle geändert habt, entscheidest du hier, wie zusammengeführt wird. Alles, was sich nicht überschneidet, wird automatisch kombiniert."
      />
      {isLoading ? <Skeleton className="h-40" /> : open.length === 0 ? (
        <EmptyState icon={<Check />} title="Keine offenen Konflikte" description="Alle Änderungen sind zusammengeführt. Neue Konflikte meldet Bandival dir per Benachrichtigung." />
      ) : (
        <ul className="stagger space-y-3">
          {open.map((conflict) => (
            <li key={conflict.id}>
              <Link href={`/app/conflicts/${conflict.id}`} className="card card-hover flex items-center gap-4 p-4 sm:p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"><GitMerge className="size-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{conflict.docTitle}</span>
                    <Badge>{DOC_LABEL[conflict.docType]}</Badge>
                  </span>
                  <span className="mt-1 block truncate text-sm text-muted">
                    {conflict.labels.length} {conflict.labels.length === 1 ? "Stelle" : "Stellen"}: {conflict.labels.slice(0, 3).join(", ")}
                  </span>
                  <span className="type-meta mt-1 block text-[11px] text-subtle">mit {conflict.theirsName} · {formatRelative(conflict.createdAt)}</span>
                </span>
                <span className="hidden items-center gap-1.5 text-sm font-medium sm:inline-flex">Lösen <ArrowRight className="size-4" /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {done.length ? (
        <section className="mt-12">
          <h2 className="type-eyebrow mb-3 text-muted">Erledigt</h2>
          <ul className="card divide-y divide-border">
            {done.slice(0, 15).map((conflict) => (
              <li key={conflict.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                {conflict.status === "resolved" ? <Check className="size-4 text-success" /> : <Undo2 className="size-4 text-subtle" />}
                <span className="min-w-0 flex-1 truncate">{conflict.docTitle}</span>
                <span className="type-meta text-[11px] text-subtle">{conflict.status === "resolved" ? "zusammengeführt" : "verworfen"} · {formatRelative(conflict.resolvedAt ?? conflict.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Resolver                                                                   */
/* -------------------------------------------------------------------------- */

type Decision = { option?: string; custom?: string };

/** Lines of `side` that differ from `base` (highlighted like a diff). */
function changedLines(base: string | null, side: string): Set<number> {
  const sideLines = splitLines(side);
  if (base === null) return new Set(sideLines.map((_, index) => index));
  const matched = new Set(lcsMatches(splitLines(base), sideLines).map(([, index]) => index));
  return new Set(sideLines.map((_, index) => index).filter((index) => !matched.has(index)));
}

function TextPanel({ title, text, base, tone }: { title: string; text: string; base: string | null; tone: "ours" | "theirs" }) {
  const lines = splitLines(text);
  const changed = changedLines(base, text);
  return (
    <div className="min-w-0 overflow-hidden rounded-[12px] border border-border bg-bg">
      <div className="type-eyebrow flex items-center gap-2 border-b border-border px-3 py-2 text-muted">
        <span className={cn("size-1.5 rounded-full", tone === "ours" ? "bg-accent" : "bg-info")} />{title}
      </div>
      {lines.length === 0 ? <p className="px-3 py-3 text-sm italic text-subtle">(Zeilen entfernt)</p> : (
        <pre className="overflow-x-auto py-2 font-mono text-[12.5px] leading-6">
          {lines.map((line, index) => (
            <div key={index} className={cn("px-3", changed.has(index) && (tone === "ours" ? "bg-accent-soft" : "bg-info-soft"))}>{line || " "}</div>
          ))}
        </pre>
      )}
    </div>
  );
}

function ConflictCard({ item, index, theirsName, decision, onDecide }: { item: DocConflict; index: number; theirsName: string; decision: Decision | undefined; onDecide: (decision: Decision) => void }) {
  const isText = item.kind === "text";
  const selected = decision?.option;
  const editing = decision?.custom !== undefined;
  const currentValue = (option: string | undefined) => {
    const found = item.options.find((entry) => entry.id === option);
    return typeof found?.value === "string" ? found.value : "";
  };

  return (
    <Card className={cn("transition-[border-color] duration-300", decision ? "border-fg/20" : "border-danger/30")} padded={false}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className={cn("flex size-6 items-center justify-center rounded-full font-mono text-[11px] transition-colors", decision ? "bg-ink text-ink-fg" : "bg-danger-soft text-danger")}>
          {decision ? <Check className="size-3.5" /> : String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{item.label}</h3>
        <Badge tone={decision ? "success" : "danger"}>{decision ? "Entschieden" : "Offen"}</Badge>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        {isText ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <TextPanel title="Deine Version" text={item.ours} base={item.base} tone="ours" />
              <TextPanel title={`Version von ${theirsName}`} text={item.theirs} base={item.base} tone="theirs" />
            </div>
            {item.base !== null ? (
              <details className="group rounded-[12px] border border-border">
                <summary className="type-eyebrow cursor-pointer list-none px-3 py-2 text-muted hover:text-fg">Ursprüngliche Fassung anzeigen</summary>
                <pre className="overflow-x-auto border-t border-border px-3 py-2 font-mono text-[12.5px] leading-6 text-muted">{item.base || "(leer)"}</pre>
              </details>
            ) : null}
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[12px] border border-border bg-bg p-3">
              <p className="type-eyebrow flex items-center gap-2 text-muted"><span className="size-1.5 rounded-full bg-accent" />Deine Version</p>
              <p className="mt-2 whitespace-pre-line text-[15px] font-medium">{item.ours}</p>
            </div>
            <div className="rounded-[12px] border border-border bg-bg p-3">
              <p className="type-eyebrow flex items-center gap-2 text-muted"><span className="size-1.5 rounded-full bg-info" />Version von {theirsName}</p>
              <p className="mt-2 whitespace-pre-line text-[15px] font-medium">{item.theirs}</p>
            </div>
          </div>
        )}

        <div>
          <p className="type-eyebrow mb-2 text-muted">So zusammenführen</p>
          <div className="grid gap-2">
            {item.options.map((option) => {
              const active = selected === option.id && !editing;
              const preview = typeof option.value === "string" ? option.value : option.preview;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onDecide({ option: option.id })}
                  className={cn(
                    "group relative flex w-full items-start gap-3 rounded-[12px] border px-3.5 py-3 text-left transition-[border-color,background-color,transform] duration-200 active:scale-[0.995]",
                    active ? "border-fg bg-surface-2/60" : "border-border hover:border-border-strong",
                  )}
                  aria-pressed={active}
                >
                  <span className={cn("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors", active ? "border-fg bg-ink" : "border-fg/25")}>
                    {active ? <span className="size-1.5 rounded-full bg-ink-fg" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {option.label}
                      {option.recommended ? <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-accent-text"><Sparkles className="size-3" />Vorschlag</span> : null}
                    </span>
                    {isText && preview !== undefined ? (
                      <pre className="mt-1.5 max-h-28 overflow-hidden whitespace-pre-wrap font-mono text-[12px] leading-5 text-muted">{preview || "(leer – Zeilen entfernen)"}</pre>
                    ) : !isText && option.preview ? <span className="mt-0.5 block whitespace-pre-line text-[13px] text-muted">{option.preview}</span> : null}
                  </span>
                </button>
              );
            })}
            {isText ? (
              <button
                type="button"
                onClick={() => onDecide({ custom: editing ? decision?.custom : currentValue(selected ?? item.options.find((option) => option.recommended)?.id ?? "ours") })}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[12px] border px-3.5 py-3 text-left text-sm font-medium transition-colors",
                  editing ? "border-fg bg-surface-2/60" : "border-dashed border-border-strong hover:border-fg/40",
                )}
              >
                <PencilLine className="size-4 text-muted" /> Selbst bearbeiten
              </button>
            ) : null}
          </div>
          {editing ? (
            <Textarea
              className="mt-3 font-mono text-[13px]"
              rows={Math.min(14, Math.max(4, splitLines(decision?.custom ?? "").length + 1))}
              value={decision?.custom ?? ""}
              onChange={(event) => onDecide({ custom: event.target.value })}
              aria-label={`${item.label} selbst zusammenführen`}
              autoFocus
            />
          ) : null}
        </div>
      </div>
    </Card>
  );
}

type ConflictDetail = {
  conflict: ConflictSummary & { bandId: string };
  items: DocConflict[];
};

export function ConflictResolver({ conflictId }: { conflictId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, isLoading, mutate } = useSWR<ConflictDetail>(`/api/merge-conflicts/${conflictId}`);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState<"resolve" | "discard" | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const decided = items.filter((item) => decisions[item.id]).length;
  const progress = items.length ? decided / items.length : 0;

  if (error) return <EmptyState icon={<GitMerge />} title="Konflikt nicht gefunden" description={errorMessage(error)} action={<ButtonLink href="/app/conflicts">Zur Übersicht</ButtonLink>} />;
  if (isLoading || !data) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-80" /></div>;
  const { conflict } = data;

  if (conflict.status !== "open") {
    return (
      <EmptyState
        icon={<Check />}
        title={conflict.status === "resolved" ? "Bereits zusammengeführt" : "Verworfen"}
        description={`„${conflict.docTitle}“ ist auf dem aktuellen Stand.`}
        action={<ButtonLink href={conflict.docUrl} variant="primary">Öffnen</ButtonLink>}
      />
    );
  }

  const acceptAll = (option: "ours" | "theirs" | "recommended") => {
    const next: Record<string, Decision> = {};
    for (const item of items) {
      const choice = option === "recommended"
        ? item.options.find((entry) => entry.recommended) ?? item.options[0]
        : item.options.find((entry) => entry.id === option || (option === "ours" && entry.id === "keep") || (option === "theirs" && entry.id === "delete" && item.ours === "geändert"))
          ?? item.options[option === "ours" ? 0 : 1] ?? item.options[0];
      next[item.id] = { option: choice.id };
    }
    setDecisions(next);
  };

  const resolve = async () => {
    setBusy("resolve");
    try {
      const choices = Object.fromEntries(Object.entries(decisions).map(([id, decision]) => [id, decision.custom !== undefined ? { value: decision.custom } : { option: decision.option }]));
      const result = await api.post<{ ok: boolean; status: string; url: string }>(`/api/merge-conflicts/${conflictId}`, { action: "resolve", choices });
      toast.success(result.status === "merged" ? "Zusammengeführt – inklusive der neuesten Änderungen anderer." : "Zusammengeführt und gespeichert.");
      router.push(result.url ?? conflict.docUrl);
    } catch (err) {
      const next = err instanceof ApiError ? (err.data as { conflict?: { id: string } } | null)?.conflict : null;
      if (next?.id) {
        toast.info("Inzwischen wurde wieder an denselben Stellen gearbeitet – bitte noch einmal entscheiden.");
        router.replace(`/app/conflicts/${next.id}`);
      } else {
        toast.error(errorMessage(err));
        await mutate();
      }
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    const ok = await confirm({
      title: "Deine Änderungen an diesen Stellen verwerfen?",
      description: `Es bleibt bei der Version von ${conflict.theirsName}. Deine automatisch zusammengeführten Änderungen an anderen Stellen gehen ebenfalls verloren.`,
      confirmLabel: "Verwerfen",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("discard");
    try {
      await api.post(`/api/merge-conflicts/${conflictId}`, { action: "discard" });
      router.push("/app/conflicts");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        back={<Link href="/app/conflicts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />Konflikte</Link>}
        eyebrow={`Merge-Konflikt · ${DOC_LABEL[conflict.docType]}`}
        title={conflict.docTitle}
        description={`Du und ${conflict.theirsName} habt gleichzeitig dieselben Stellen geändert. Alles andere wurde schon automatisch zusammengeführt – entscheide nur noch hier.`}
        actions={<ButtonLink href={conflict.docUrl} icon={<ExternalLink />}>Aktuellen Stand ansehen</ButtonLink>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="type-eyebrow mr-1 text-muted">Für alle Stellen:</span>
        <Button size="sm" variant="subtle" icon={<Sparkles />} onClick={() => acceptAll("recommended")}>Vorschläge übernehmen</Button>
        <Button size="sm" variant="subtle" onClick={() => acceptAll("ours")}>Meine Version</Button>
        <Button size="sm" variant="subtle" onClick={() => acceptAll("theirs")}>Version von {conflict.theirsName}</Button>
      </div>

      <div className="stagger space-y-5">
        {items.map((item, index) => (
          <ConflictCard
            key={item.id}
            item={item}
            index={index}
            theirsName={conflict.theirsName}
            decision={decisions[item.id]}
            onDecide={(decision) => setDecisions((current) => ({ ...current, [item.id]: decision }))}
          />
        ))}
      </div>

      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 mt-8 lg:bottom-5">
        <div className="card flex flex-col gap-3 p-3 shadow-float sm:flex-row sm:items-center sm:p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{decided} von {items.length} {items.length === 1 ? "Stelle" : "Stellen"} entschieden</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-fg/10">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out-expo" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" loading={busy === "discard"} onClick={() => void discard()}>Verwerfen</Button>
            <Button variant="primary" icon={<GitMerge />} loading={busy === "resolve"} disabled={decided < items.length} onClick={() => void resolve()}>Zusammenführen</Button>
          </div>
        </div>
      </div>
    </>
  );
}
