"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, Download, FileUp, Keyboard, Minus, Music, Pause, Play, Plus, Printer, Redo2, Timer, Trash2, Undo2,
} from "lucide-react";
import { cn } from "@/lib/client/cn";
import { transposeChord } from "@/lib/client/music";
import {
  DRUMS, DRUM_ORDER, DURATION_LABEL, INSTRUMENTS, MAJOR_KEYS, MINOR_KEYS, emptyScore, keyFifths, pitchLabel, transposeScore,
  type BaseDuration, type DrumSound, type InstrumentId, type Pitch, type ScoreDoc, type Step,
} from "@/lib/notation/model";
import {
  DURATION_KEYS, deleteEvent, insertDrum, insertPitch, insertRest, setAccidental, shiftPitch, typeStep, updateEvent,
  type EditResult, type InputState,
} from "@/lib/notation/edit";
import { scoreToAbc } from "@/lib/notation/abc";
import { downloadBlob, safeFileName, scoreToMidi, scoreToMusicXml } from "@/lib/notation/export";
import { musicXmlToScore } from "@/lib/notation/import";
import { ScorePlayer } from "@/lib/notation/player";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Menu } from "@/components/ui/navigation";
import { useToast } from "@/components/ui/feedback";
import { ScoreRenderer } from "@/components/notation/score-renderer";
import { t, translatable } from "@/lib/i18n";

type Props = {
  title: string;
  initial: ScoreDoc;
  saveState: "saved" | "saving" | "dirty" | "error" | "offline" | "conflict";
  readOnly?: boolean;
  onChange: (doc: ScoreDoc) => void;
  onTitleChange?: (title: string) => void;
  onBack?: () => void;
  onDelete?: () => void;
};

const DURATIONS: BaseDuration[] = [1, 2, 4, 8, 16, 32];
const DURATION_GLYPH: Record<BaseDuration, string> = { 1: "𝅝", 2: "𝅗𝅥", 4: "♩", 8: "♪", 16: "𝅘𝅥𝅯", 32: "𝅘𝅥𝅰" };
const DURATION_SHORTCUT: Record<BaseDuration, string> = { 1: "7", 2: "6", 4: "5", 8: "4", 16: "3", 32: "2" };
const METERS = ["4/4", "3/4", "2/4", "6/8", "12/8", "9/8", "5/4", "7/8", "2/2"];
const WHITE: Step[] = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_AFTER: Partial<Record<Step, true>> = { C: true, D: true, F: true, G: true, A: true };

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable));
}

function ToolButton({ active, onClick, title, children, disabled }: { active?: boolean; onClick: () => void; title: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg px-2 text-lg leading-none transition-colors disabled:opacity-40 [&_svg]:size-4",
        active ? "bg-accent text-accent-fg" : "text-fg hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

function PianoKeys({ octave, flats, onKey }: { octave: number; flats: boolean; onKey: (pitch: Pitch, chord: boolean) => void }) {
  const octaves = [octave, octave + 1];
  return (
    <div className="relative flex h-20 select-none sm:h-28" role="group" aria-label={t("Klaviatur")}>
      {octaves.flatMap((oct) => WHITE.map((step) => {
        const black = BLACK_AFTER[step];
        const blackPitch: Pitch = flats
          ? { step: WHITE[(WHITE.indexOf(step) + 1) % 7], alter: -1, octave: step === "B" ? oct + 1 : oct }
          : { step, alter: 1, octave: oct };
        return (
          <div key={`${oct}${step}`} className="relative flex-1">
            <button
              type="button"
              onPointerDown={(event) => { event.preventDefault(); onKey({ step, alter: 0, octave: oct }, event.shiftKey); }}
              className="h-full w-full rounded-b-md border border-border bg-white text-[10px] text-zinc-500 active:bg-accent-soft"
              aria-label={`${step}${oct}`}
            >
              <span className="absolute inset-x-0 bottom-1">{step === "C" ? `C${oct}` : ""}</span>
            </button>
            {black ? (
              <button
                type="button"
                onPointerDown={(event) => { event.preventDefault(); onKey(blackPitch, event.shiftKey); }}
                className="absolute -right-[30%] top-0 z-10 h-[60%] w-[60%] rounded-b-md bg-zinc-900 active:bg-accent"
                aria-label={pitchLabel(blackPitch)}
              />
            ) : null}
          </div>
        );
      }))}
    </div>
  );
}

function DrumPads({ onDrum }: { onDrum: (drum: DrumSound, chord: boolean) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6" role="group" aria-label={t("Drum-Pads")}>
      {DRUM_ORDER.map((drum) => (
        <button
          key={drum}
          type="button"
          onPointerDown={(event) => { event.preventDefault(); onDrum(drum, event.shiftKey); }}
          className="flex h-14 flex-col items-center justify-center rounded-xl border border-border bg-surface-2 text-xs font-medium active:bg-accent active:text-accent-fg"
        >
          {DRUMS[drum].label}
          <kbd className="mt-0.5 text-[10px] uppercase text-muted">{DRUMS[drum].key}</kbd>
        </button>
      ))}
    </div>
  );
}

const SHORTCUTS: Array<[string, string]> = translatable([
  ["A – G", "Note eingeben (Tonart wird beachtet)"],
  ["Shift + A – G", "Ton zum Akkord hinzufügen"],
  ["2 – 7", "Notenwert: 32tel … Ganze"],
  [".", "Punktierung"],
  ["0", "Pause / Note zu Pause"],
  ["+", "Haltebogen zur nächsten Note"],
  ["↑ / ↓", "Halbton höher / tiefer"],
  ["Strg + ↑ / ↓", "Oktave höher / tiefer"],
  ["← / →", "Vorherige / nächste Note"],
  ["Strg + 3", "Triole"],
  ["Strg + K", "Akkordsymbol"],
  ["Strg + L", "Liedtext"],
  ["Entf / ⌫", "Note löschen"],
  ["Strg + Z / Y", "Rückgängig / Wiederholen"],
  ["Leertaste", "Abspielen / Stopp"],
  ["Drums", "K Bassdrum · S Snare · H Hi-Hat · O offen · P Pedal · R Ride · C Crash · T/M/F Toms · X Rim"],
]);

export function ScoreEditor({ title, initial, saveState, readOnly = false, onChange, onTitleChange, onBack, onDelete }: Props) {
  const [doc, setDoc] = useState<ScoreDoc>(initial);
  const [selected, setSelected] = useState<number | null>(initial.events.length ? initial.events.length - 1 : null);
  const [input, setInput] = useState<InputState>({ duration: 4, dots: 0, triplet: false });
  const [history, setHistory] = useState<{ past: ScoreDoc[]; future: ScoreDoc[] }>({ past: [], future: [] });
  const [playing, setPlaying] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [countIn, setCountIn] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [octave, setOctave] = useState(INSTRUMENTS[initial.instrument].defaultOctave);
  const [chordMode, setChordMode] = useState(false);
  const [textField, setTextField] = useState<null | "chord" | "lyric">(null);
  const [showHelp, setShowHelp] = useState(false);
  const [padOpen, setPadOpen] = useState(true);
  const playerRef = useRef<ScorePlayer | null>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const drums = doc.instrument === "drums";
  const event = selected !== null ? doc.events[selected] : null;

  const commit = useCallback((next: ScoreDoc, nextSelected: number | null = selected, previewIndex?: number | null) => {
    setHistory((current) => ({ past: [...current.past.slice(-99), doc], future: [] }));
    setDoc(next);
    setSelected(nextSelected);
    onChange(next);
    if (previewIndex !== undefined && previewIndex !== null) ScorePlayer.preview(next, previewIndex);
  }, [doc, onChange, selected]);

  const apply = useCallback((result: EditResult, preview = false) => {
    commit(result.doc, result.selected, preview ? result.selected : undefined);
  }, [commit]);

  const undo = useCallback(() => {
    const previous = history.past.at(-1);
    if (!previous) return;
    setHistory({ past: history.past.slice(0, -1), future: [doc, ...history.future] });
    setDoc(previous);
    onChange(previous);
    setSelected((index) => (index !== null && index >= previous.events.length ? (previous.events.length ? previous.events.length - 1 : null) : index));
  }, [doc, history, onChange]);

  const redo = useCallback(() => {
    const next = history.future[0];
    if (!next) return;
    setHistory({ past: [...history.past, doc], future: history.future.slice(1) });
    setDoc(next);
    onChange(next);
  }, [doc, history, onChange]);

  const stop = useCallback(() => {
    playerRef.current?.stop();
    setIsPlaying(false);
    setPlaying(null);
  }, []);

  const play = useCallback(() => {
    if (isPlaying) {
      stop();
      return;
    }
    playerRef.current ??= new ScorePlayer();
    const fromIndex = selected !== null && selected < doc.events.length - 1 ? selected : 0;
    let fromTick = 0;
    for (let index = 0; index < fromIndex; index += 1) {
      const entry = doc.events[index];
      const base = 1920 / entry.duration;
      const dotted = entry.dots === 2 ? base * 1.75 : entry.dots === 1 ? base * 1.5 : base;
      fromTick += entry.triplet ? Math.round((dotted * 2) / 3) : dotted;
    }
    setIsPlaying(true);
    playerRef.current.play(doc, {
      fromTick,
      metronome,
      countIn,
      speed,
      onPosition: setPlaying,
      onEnd: () => {
        setIsPlaying(false);
        setPlaying(null);
      },
    });
  }, [countIn, doc, isPlaying, metronome, selected, speed, stop]);

  useEffect(() => () => playerRef.current?.stop(), []);

  const setDuration = (duration: BaseDuration) => {
    setInput((current) => ({ ...current, duration }));
    if (event) apply(updateEvent(doc, selected, () => ({ duration })), true);
  };
  const toggleDot = () => {
    const dots = ((event ? event.dots : input.dots) === 1 ? 0 : 1) as 0 | 1;
    setInput((current) => ({ ...current, dots }));
    if (event) apply(updateEvent(doc, selected, () => ({ dots })));
  };
  const toggleTriplet = () => {
    const triplet = !(event ? event.triplet : input.triplet);
    setInput((current) => ({ ...current, triplet }));
    if (event) apply(updateEvent(doc, selected, () => ({ triplet: triplet || undefined })));
  };

  const openText = (kind: "chord" | "lyric") => {
    if (selected === null) {
      toast.info(t("Wähle zuerst eine Note aus."));
      return;
    }
    setTextField(kind);
    requestAnimationFrame(() => textRef.current?.select());
  };

  const commitText = (value: string, advance: boolean) => {
    if (selected === null || !textField) return;
    const key = textField;
    const result = updateEvent(doc, selected, () => ({ [key]: value.trim() || undefined }));
    // Like MuseScore: Enter/Tab jumps to the next note and keeps the field open.
    const nextIndex = advance ? Math.min(doc.events.length - 1, selected + 1) : selected;
    commit(result.doc, nextIndex);
    if (!advance) setTextField(null);
    else requestAnimationFrame(() => textRef.current?.select());
  };

  useEffect(() => {
    if (readOnly) return;
    const onKey = (keyEvent: KeyboardEvent) => {
      if (isTyping(keyEvent.target)) return;
      const key = keyEvent.key;
      const mod = keyEvent.ctrlKey || keyEvent.metaKey;
      const lower = key.toLowerCase();

      if (mod && lower === "z") { keyEvent.preventDefault(); (keyEvent.shiftKey ? redo : undo)(); return; }
      if (mod && lower === "y") { keyEvent.preventDefault(); redo(); return; }
      if (mod && lower === "k") { keyEvent.preventDefault(); openText("chord"); return; }
      if (mod && lower === "l") { keyEvent.preventDefault(); openText("lyric"); return; }
      if (mod && key === "3") { keyEvent.preventDefault(); toggleTriplet(); return; }
      if (key === " ") { keyEvent.preventDefault(); play(); return; }
      if (key === "ArrowLeft") { keyEvent.preventDefault(); setSelected((index) => (index === null ? doc.events.length - 1 : Math.max(0, index - 1))); return; }
      if (key === "ArrowRight") { keyEvent.preventDefault(); setSelected((index) => (index === null ? 0 : Math.min(doc.events.length - 1, index + 1))); return; }
      if (key === "Home") { keyEvent.preventDefault(); setSelected(doc.events.length ? 0 : null); return; }
      if (key === "End") { keyEvent.preventDefault(); setSelected(doc.events.length ? doc.events.length - 1 : null); return; }
      if (key === "Escape") { setSelected(null); return; }
      if (mod) return;

      if (key === "ArrowUp" || key === "ArrowDown") {
        keyEvent.preventDefault();
        if (!drums) apply(shiftPitch(doc, selected, (key === "ArrowUp" ? 1 : -1) * (keyEvent.altKey ? 12 : 1)), true);
        return;
      }
      if (key === "Delete" || key === "Backspace") { keyEvent.preventDefault(); apply(deleteEvent(doc, selected)); return; }
      if (key === ".") { toggleDot(); return; }
      if (key === "+") { apply(updateEvent(doc, selected, (current) => ({ tie: current.tie ? undefined : true }))); return; }
      if (key === "0") { apply(insertRest(doc, selected, input)); return; }
      if (DURATION_KEYS[key]) { setDuration(DURATION_KEYS[key]); return; }

      if (drums) {
        const drum = DRUM_ORDER.find((entry) => DRUMS[entry].key === lower);
        if (drum) { keyEvent.preventDefault(); apply(insertDrum(doc, selected, input, drum, keyEvent.shiftKey || chordMode), true); }
        return;
      }
      if (/^[a-g]$/.test(lower)) {
        keyEvent.preventDefault();
        apply(typeStep(doc, selected, input, lower.toUpperCase() as Step, keyEvent.shiftKey || chordMode), true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Ctrl/Cmd + arrow octave shift needs its own handler because the generic handler returns early on modifiers.
  useEffect(() => {
    if (readOnly || drums) return;
    const onKey = (keyEvent: KeyboardEvent) => {
      if (isTyping(keyEvent.target) || !(keyEvent.ctrlKey || keyEvent.metaKey)) return;
      if (keyEvent.key === "ArrowUp" || keyEvent.key === "ArrowDown") {
        keyEvent.preventDefault();
        apply(shiftPitch(doc, selected, keyEvent.key === "ArrowUp" ? 12 : -12), true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, doc, drums, readOnly, selected]);

  const changeSettings = (patch: Partial<ScoreDoc>) => commit({ ...doc, ...patch }, selected);

  const changeInstrument = (instrument: InstrumentId) => {
    const info = INSTRUMENTS[instrument];
    const switchingDrums = (instrument === "drums") !== drums;
    if (switchingDrums && doc.events.length > 0) {
      toast.error(t("Zwischen Drums und Melodie-Instrumenten kann nur bei leeren Noten gewechselt werden."));
      return;
    }
    setOctave(info.defaultOctave);
    commit({ ...doc, instrument, clef: info.clef, tab: info.tab, key: instrument === "drums" ? "C" : doc.key }, selected);
  };

  const exportAs = (format: "musicxml" | "midi" | "abc" | "print") => {
    const name = safeFileName(title);
    if (format === "musicxml") downloadBlob(scoreToMusicXml(doc, title), `${name}.musicxml`, "application/vnd.recordare.musicxml+xml");
    if (format === "midi") downloadBlob(scoreToMidi(doc) as BlobPart, `${name}.mid`, "audio/midi");
    if (format === "abc") downloadBlob(scoreToAbc(doc, { title }).abc, `${name}.abc`, "text/vnd.abc");
    if (format === "print") window.print();
  };

  const importFile = async (file: File) => {
    if (/\.mxl$/i.test(file.name)) {
      toast.error(t("Komprimiertes .mxl wird nicht unterstützt – bitte in MuseScore als unkomprimiertes MusicXML (.musicxml) exportieren."));
      return;
    }
    try {
      const { doc: imported, warnings } = musicXmlToScore(await file.text());
      commit(imported, imported.events.length ? 0 : null);
      setOctave(INSTRUMENTS[imported.instrument].defaultOctave);
      toast.success(t(`${imported.events.length} Noten importiert.${warnings.length ? ` ${warnings.join(" ")}` : ""}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Import fehlgeschlagen."));
    }
  };

  const keyOptions = useMemo(() => [...MAJOR_KEYS.map((key) => ({ key, label: `${key}-Dur` })), ...MINOR_KEYS.map((key) => ({ key, label: `${key.slice(0, -1)}-Moll` }))], []);
  const saveLabel = {
    saved: "Gespeichert", saving: t("Speichert …"), dirty: "Ungespeichert", error: t("Fehler beim Speichern"),
    offline: t("Offline gespeichert – wird synchronisiert"), conflict: t("Merge-Konflikt – bitte lösen"),
  }[saveState];

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-3">
      {/* Header */}
      <div className="no-print flex flex-wrap items-center gap-2">
        {onBack ? <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("Zurück")}><ArrowLeft /></Button> : null}
        {onTitleChange && !readOnly ? (
          <Input value={title} onChange={(changeEvent) => onTitleChange(changeEvent.target.value)} className="order-last h-10 w-full font-semibold sm:order-none sm:w-auto sm:max-w-xs sm:flex-1" aria-label={t("Titel")} />
        ) : <h1 className="text-lg font-semibold">{title}</h1>}
        {!readOnly ? <span className={cn("text-xs", saveState === "error" || saveState === "conflict" ? "text-danger" : saveState === "offline" ? "text-warning" : "text-muted")}>{saveLabel}</span> : null}
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant={isPlaying ? "secondary" : "primary"} icon={isPlaying ? <Pause /> : <Play />} onClick={play}>{isPlaying ? t("Stopp") : t("Abspielen")}</Button>
          <Menu
            trigger={({ toggle }) => <Button size="icon" onClick={toggle} aria-label={t("Export")}><Download /></Button>}
            items={[
              { label: t("MusicXML (MuseScore, Sibelius …)"), icon: <Music />, onSelect: () => exportAs("musicxml") },
              { label: "MIDI", icon: <Music />, onSelect: () => exportAs("midi") },
              { label: t("ABC-Notation"), icon: <Music />, onSelect: () => exportAs("abc") },
              { label: t("Drucken / PDF"), icon: <Printer />, onSelect: () => exportAs("print") },
              ...(!readOnly ? [
                { type: "separator" as const },
                { label: t("MusicXML importieren …"), icon: <FileUp />, onSelect: () => fileRef.current?.click() },
                ...(onDelete ? [{ label: t("Noten löschen"), icon: <Trash2 />, danger: true, onSelect: onDelete }] : []),
              ] : []),
            ]}
          />
          <input ref={fileRef} type="file" accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml" className="hidden" onChange={(changeEvent) => {
            const file = changeEvent.target.files?.[0];
            if (file) void importFile(file);
            changeEvent.target.value = "";
          }} />
        </div>
      </div>

      {/* Score settings */}
      {!readOnly ? (
        <div className="no-print flex flex-wrap items-center gap-2 text-sm">
          <Select value={doc.instrument} onChange={(changeEvent) => changeInstrument(changeEvent.target.value as InstrumentId)} className="h-9 w-auto" aria-label={t("Instrument")}>
            {(Object.keys(INSTRUMENTS) as InstrumentId[]).map((id) => <option key={id} value={id}>{INSTRUMENTS[id].label}</option>)}
          </Select>
          {!drums ? (
            <Select value={doc.key} onChange={(changeEvent) => changeSettings({ key: changeEvent.target.value })} className="h-9 w-auto" aria-label={t("Tonart")}>
              {keyOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </Select>
          ) : null}
          <Select value={doc.meter} onChange={(changeEvent) => changeSettings({ meter: changeEvent.target.value })} className="h-9 w-auto" aria-label={t("Taktart")}>
            {METERS.map((meter) => <option key={meter} value={meter}>{meter}</option>)}
          </Select>
          <label className="flex items-center gap-1.5">
            <span className="text-muted">♩=</span>
            <Input type="number" min={20} max={400} value={doc.tempo} onChange={(changeEvent) => changeSettings({ tempo: Math.min(400, Math.max(20, Number(changeEvent.target.value) || 100)) })} className="h-9 w-20" aria-label={t("Tempo")} />
          </label>
          {(doc.instrument === "guitar" || doc.instrument === "bass") ? (
            <label className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-surface-2">
              <input type="checkbox" checked={doc.tab} onChange={(changeEvent) => changeSettings({ tab: changeEvent.target.checked })} />
              {t("Tabulatur")}
            </label>
          ) : null}
          {!drums ? (
            <span className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
              <Button size="icon-sm" variant="ghost" aria-label={t("Halbton tiefer transponieren")} onClick={() => commit(transposeScore(doc, -1, transposeChord), selected)}><Minus /></Button>
              <span className="px-1 text-xs">{t("Transponieren")}</span>
              <Button size="icon-sm" variant="ghost" aria-label={t("Halbton höher transponieren")} onClick={() => commit(transposeScore(doc, 1, transposeChord), selected)}><Plus /></Button>
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-1">
            <ToolButton title={t("Metronom beim Abspielen")} active={metronome} onClick={() => setMetronome((value) => !value)}><Timer /></ToolButton>
            <ToolButton title={t("Einzähler")} active={countIn} onClick={() => setCountIn((value) => !value)}><span className="text-xs font-semibold">1·2</span></ToolButton>
            <Select value={String(speed)} onChange={(changeEvent) => setSpeed(Number(changeEvent.target.value))} className="h-9 w-auto" aria-label={t("Wiedergabe-Tempo")}>
              {[0.5, 0.75, 0.9, 1, 1.1, 1.25].map((value) => <option key={value} value={value}>{Math.round(value * 100)} %</option>)}
            </Select>
          </span>
        </div>
      ) : null}

      {/* Palette */}
      {!readOnly ? (
        <div className="no-print sticky top-14 z-10 -mx-1 flex items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-surface/95 p-1 backdrop-blur lg:top-2">
          {DURATIONS.map((duration) => (
            <ToolButton key={duration} title={`${DURATION_LABEL[duration]} (${DURATION_SHORTCUT[duration]})`} active={(event?.duration ?? input.duration) === duration} onClick={() => setDuration(duration)}>
              <span className="font-serif text-2xl leading-none">{DURATION_GLYPH[duration]}</span>
            </ToolButton>
          ))}
          <ToolButton title={t("Punktierung (.)")} active={(event?.dots ?? input.dots) > 0} onClick={toggleDot}><span className="text-2xl leading-none">·</span></ToolButton>
          <ToolButton title={t("Triole (Strg+3)")} active={Boolean(event?.triplet ?? input.triplet)} onClick={toggleTriplet}><span className="text-sm font-semibold">3</span></ToolButton>
          <span className="mx-1 h-6 w-px shrink-0 bg-border" />
          <ToolButton title={t("Pause (0)")} onClick={() => apply(insertRest(doc, selected, input))}><span className="font-serif">𝄽</span></ToolButton>
          <ToolButton title={t("Haltebogen (+)")} active={Boolean(event?.tie)} disabled={!event} onClick={() => apply(updateEvent(doc, selected, (current) => ({ tie: current.tie ? undefined : true })))}><span className="text-base">⁀</span></ToolButton>
          {!drums ? (
            <>
              <ToolButton title={t("Kreuz")} disabled={!event?.pitches.length} onClick={() => apply(setAccidental(doc, selected, 1), true)}>♯</ToolButton>
              <ToolButton title="B" disabled={!event?.pitches.length} onClick={() => apply(setAccidental(doc, selected, -1), true)}>♭</ToolButton>
              <ToolButton title={t("Auflösungszeichen")} disabled={!event?.pitches.length} onClick={() => apply(setAccidental(doc, selected, 0), true)}>♮</ToolButton>
            </>
          ) : null}
          <ToolButton title={t("Akzent")} active={Boolean(event?.accent)} disabled={!event} onClick={() => apply(updateEvent(doc, selected, (current) => ({ accent: current.accent ? undefined : true })))}><span className="text-base font-bold">&gt;</span></ToolButton>
          <ToolButton title={t("Staccato")} active={Boolean(event?.staccato)} disabled={!event} onClick={() => apply(updateEvent(doc, selected, (current) => ({ staccato: current.staccato ? undefined : true })))}><span className="text-2xl leading-none">•</span></ToolButton>
          <span className="mx-1 h-6 w-px shrink-0 bg-border" />
          <ToolButton title={t("Akkordsymbol (Strg+K)")} active={textField === "chord"} onClick={() => openText("chord")}><span className="text-sm font-semibold">{t("Am")}</span></ToolButton>
          <ToolButton title={t("Liedtext (Strg+L)")} active={textField === "lyric"} onClick={() => openText("lyric")}><span className="text-sm font-semibold">{t("la")}</span></ToolButton>
          <ToolButton title={t("Akkord-Modus: Töne stapeln statt anhängen (Shift)")} active={chordMode} onClick={() => setChordMode((value) => !value)}><span className="text-xs font-semibold">+♪</span></ToolButton>
          <span className="mx-1 h-6 w-px shrink-0 bg-border" />
          <ToolButton title={t("Rückgängig (Strg+Z)")} disabled={history.past.length === 0} onClick={undo}><Undo2 /></ToolButton>
          <ToolButton title={t("Wiederholen (Strg+Y)")} disabled={history.future.length === 0} onClick={redo}><Redo2 /></ToolButton>
          <ToolButton title={t("Note löschen (Entf)")} disabled={!event} onClick={() => apply(deleteEvent(doc, selected))}><Trash2 /></ToolButton>
          <ToolButton title={t("Tastenkürzel")} active={showHelp} onClick={() => setShowHelp((value) => !value)}><Keyboard /></ToolButton>
        </div>
      ) : null}

      {textField ? (
        <form
          className="no-print flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft p-2"
          onSubmit={(submitEvent) => { submitEvent.preventDefault(); commitText(textRef.current?.value ?? "", true); }}
        >
          <span className="px-1 text-sm font-medium">{textField === "chord" ? t("Akkord") : t("Silbe")}</span>
          <Input
            key={`${textField}-${selected}`}
            ref={textRef}
            defaultValue={(textField === "chord" ? event?.chord : event?.lyric) ?? ""}
            placeholder={textField === "chord" ? t("z. B. Am7, G/B, Fmaj7") : t("Silbe – mit „-“ am Ende verbinden")}
            className="h-9 flex-1"
            autoFocus
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === "Escape") setTextField(null);
              if (keyEvent.key === "Tab") { keyEvent.preventDefault(); commitText(keyEvent.currentTarget.value, true); }
            }}
          />
          <Button size="sm" type="submit" variant="primary">{t("Weiter ↵")}</Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => commitText(textRef.current?.value ?? "", false)}>{t("Fertig")}</Button>
        </form>
      ) : null}

      {showHelp ? (
        <div className="no-print grid gap-x-6 gap-y-1 rounded-xl border border-border bg-surface p-3 text-sm sm:grid-cols-2">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys} className="flex gap-3"><kbd className="w-32 shrink-0 font-mono text-xs text-muted">{keys}</kbd><span>{label}</span></div>
          ))}
        </div>
      ) : null}

      {/* Score */}
      <div className="print-area flex-1 rounded-2xl border border-border bg-surface p-3 sm:p-5">
        <p className="mb-1 hidden text-center text-xl font-semibold print:block">{title}</p>
        <ScoreRenderer doc={doc} selected={readOnly ? null : selected} playing={playing} onSelect={readOnly ? undefined : setSelected} />
        {doc.events.length === 0 && !readOnly ? (
          <p className="no-print mt-2 text-center text-sm text-muted">
            {drums ? t("Tippe auf die Pads oder nutze K, S, H … um einen Beat zu schreiben.") : t("Tippe Notennamen (A – G) oder nutze die Klaviatur unten.")}
          </p>
        ) : null}
      </div>

      {/* Status + input pad */}
      {!readOnly ? (
        <div className="no-print sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 space-y-2 rounded-2xl border border-border bg-surface/95 p-2 backdrop-blur lg:bottom-3">
          <div className="flex items-center justify-between px-1 text-xs text-muted">
            <span>
              {event
                ? `${selected! + 1}/${doc.events.length} · ${DURATION_LABEL[event.duration]}${event.dots ? " punktiert" : ""}${event.triplet ? t(" (Triole)") : ""} · ${
                  drums ? (event.drums ?? []).map((drum) => DRUMS[drum].label).join(" + ") || t("Pause") : event.pitches.map(pitchLabel).join(" ") || t("Pause")
                }${event.chord ? ` · ${event.chord}` : ""}`
                : `Eingabe: ${DURATION_LABEL[input.duration]}${input.dots ? " punktiert" : ""}`}
            </span>
            <span className="flex items-center gap-1">
              {!drums && padOpen ? (
                <>
                  <Button size="icon-sm" variant="ghost" aria-label={t("Oktave tiefer")} onClick={() => setOctave((value) => Math.max(1, value - 1))}><Minus /></Button>
                  {t("Oktave")} {octave}
                  <Button size="icon-sm" variant="ghost" aria-label={t("Oktave höher")} onClick={() => setOctave((value) => Math.min(7, value + 1))}><Plus /></Button>
                </>
              ) : null}
              <button type="button" className="ml-1 rounded-md px-2 py-1 font-medium text-accent-text hover:bg-surface-2" onClick={() => setPadOpen((value) => !value)}>
                {padOpen ? t("Einklappen") : drums ? t("Pads") : t("Klaviatur")}
              </button>
            </span>
          </div>
          {!padOpen ? null : drums ? (
            <DrumPads onDrum={(drum, chord) => apply(insertDrum(doc, selected, input, drum, chord || chordMode), true)} />
          ) : (
            <PianoKeys
              octave={octave}
              flats={keyFifths(doc.key).fifths < 0}
              onKey={(pitch, chord) => apply(insertPitch(doc, selected, input, pitch, chord || chordMode), true)}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function newScoreFor(instrument: InstrumentId, song: { keySignature?: string | null; tempoBpm?: string | number | null; timeSignature?: string | null }, normalizeKey: (value: string | null | undefined) => string): ScoreDoc {
  return emptyScore(instrument, {
    key: normalizeKey(song.keySignature),
    tempo: Number(song.tempoBpm) || 100,
    meter: song.timeSignature ?? "4/4",
  });
}
