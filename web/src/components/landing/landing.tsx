"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight, AudioWaveform, BellRing, CalendarClock, CalendarDays, Check, ClipboardList, DatabaseBackup, Download, FileText, Globe, GripVertical,
  Guitar, KeyRound, Lightbulb, ListMusic, MessageSquare, Mic, Music2, Radio, RefreshCw, Smartphone, Sparkles, Users, Vibrate, Wand2, WifiOff,
} from "lucide-react";
import { cn } from "@/lib/client/cn";
import { buttonClasses } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/display";
import { LandingEffects } from "@/components/landing/landing-effects";
import "@/components/landing/landing.css";
import { t, translatable } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/i18n/language-switch";
import { LegalLinks } from "@/components/legal/legal-links";

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** Deterministic pseudo-random numbers – server and client render the same bars. */
function noise(index: number, salt = 1): number {
  const value = Math.sin(index * 12.9898 * salt + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function Words({ text, start = 0, step = 90 }: { text: string; start?: number; step?: number }) {
  return (
    <>
      {text.split(" ").map((word, index, all) => (
        <span key={`${word}-${index}`}>
          <span className="lp-word"><span style={{ "--d": `${start + index * step}ms` } as Vars}>{word}</span></span>
          {index < all.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}

function Reveal({ children, className, delay = 0, as: Tag = "div", spotlight }: {
  children: ReactNode; className?: string; delay?: number; as?: "div" | "li" | "article" | "p" | "h2"; spotlight?: boolean;
}) {
  return (
    <Tag data-reveal="" data-spotlight={spotlight ? "" : undefined} className={cn("lp-reveal", className)} style={{ "--delay": `${delay}ms` } as Vars}>
      {children}
    </Tag>
  );
}

function SectionHeading({ index, eyebrow, title, muted, description, align = "left" }: {
  index: string; eyebrow: string; title: string; muted?: string; description?: string; align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <Reveal className="type-eyebrow flex items-center gap-3 text-muted">
        <span className="text-accent-text">{index}</span>
        <span className="h-px w-8 bg-border-strong" />
        {eyebrow}
      </Reveal>
      <Reveal as="h2" delay={80} className="type-display mt-6 text-[44px] leading-[0.95] sm:text-[72px]">
        {title}{muted ? <><br /><span className="text-muted">{muted}</span></> : null}
      </Reveal>
      {description ? <Reveal as="p" delay={160} className="mt-6 text-[17px] leading-relaxed text-muted">{description}</Reveal> : null}
    </div>
  );
}

function BeatDots({ size = "sm" }: { size?: "sm" | "lg" }) {
  const dot = size === "lg" ? "size-3.5" : "size-2";
  return (
    <span className={cn("flex items-center", size === "lg" ? "gap-2.5" : "gap-1.5")} aria-hidden>
      {[0, 500, 1000, 1500].map((delay, index) => (
        <span key={delay} className={cn("lp-beat rounded-full", index === 0 && "lp-beat--one", dot)} style={{ "--beat": `${delay}ms` } as Vars} />
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

function StageLights({ floor = true }: { floor?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="lp-beam left-[-4%]" style={{ "--from": "-18deg", "--to": "2deg", "--sway": "13s", "--on": "200ms", "--o": 0.9 } as Vars} />
      <div className="lp-beam lp-beam--warm left-[31%]" style={{ "--from": "-7deg", "--to": "9deg", "--sway": "10s", "--on": "520ms" } as Vars} />
      <div className="lp-beam lp-beam--cool right-[-6%]" style={{ "--from": "14deg", "--to": "-5deg", "--sway": "15s", "--on": "840ms", "--o": 0.85 } as Vars} />
      <div className="absolute inset-x-0 bottom-0 h-[65%] bg-[radial-gradient(55%_60%_at_50%_100%,rgb(255_98_36/0.17),transparent_72%)]" />
      {floor ? <div className="lp-floor-grid" /> : null}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#07090c]" />
    </div>
  );
}

function ProductMock() {
  const rows: Array<[string, string, number, string]> = [
    [t("Static Hearts"), "F#m", 142, "3:07"],
    [t("Midnight Run"), "Am", 128, "3:34"],
    [t("Paper Planes"), "D", 96, "4:05"],
    [t("Golden Hour"), "E", 110, "3:18"],
  ];
  return (
    <div className="relative mx-auto mt-20 max-w-5xl px-4 sm:mt-24 sm:px-6">
      <div className="lp-mock-tilt">
        <div className="lp-mock-in rounded-[26px] border border-white/10 bg-[#0d1014]/90 p-2 shadow-[0_60px_140px_-40px_rgb(0_0_0/0.95),0_0_0_1px_rgb(255_255_255/0.03)] backdrop-blur-xl">
          <div className="flex items-center gap-2 px-3 pb-2.5 pt-1.5">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="mx-auto rounded-full bg-white/[0.05] px-3 py-1 font-mono text-[11px] text-subtle">{t("bandival.eure-band.de/app")}</span>
            <span className="w-10" />
          </div>
          <div className="grid gap-2 text-left md:grid-cols-[1.2fr_1fr]">
            <div className="rounded-[18px] border border-border bg-surface p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="type-eyebrow truncate text-muted">{t("Setlist · Clubshow Molotow")}</span>
                <span className="type-meta shrink-0 text-subtle">{t("4 Songs · 14:04")}</span>
              </div>
              <ol className="mt-4 divide-y divide-border">
                {rows.map(([title, key, bpm, duration], index) => (
                  <li key={title} className="flex items-center gap-3 py-3">
                    <span className="type-meta w-5 text-subtle">{String(index + 1).padStart(2, "0")}</span>
                    {index === 1 ? <span className="eq text-accent"><i /><i /><i /></span> : null}
                    <span className={cn("min-w-0 flex-1 truncate text-[15px] font-medium", index === 1 && "text-accent-text")}>{title}</span>
                    <span className="type-meta hidden text-muted sm:inline">{key} · {bpm} {t("BPM ·")} {duration}</span>
                    <span className="type-meta text-muted sm:hidden">{bpm}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="grid gap-2">
              <div className="ticket relative overflow-hidden rounded-[18px] border border-border bg-surface px-4 pt-4 [--notch-y:calc(100%-3rem)] [--notch:7px]">
                <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[radial-gradient(closest-side,rgb(255_98_36/0.18),transparent)]" />
                <div className="type-eyebrow relative flex items-center gap-2 text-muted"><span className="led led-pulse" />{t("Als Nächstes · in 5 Tagen")}</div>
                <div className="type-display relative mt-3 text-[30px]">{t("Clubshow Molotow")}</div>
                <div className="type-meta relative mt-2 text-muted">{t("Sa 21.11. · 21:00 · Hamburg")}</div>
                <div className="mt-4 border-t border-dashed border-white/15" />
                <div className="flex h-12 items-center justify-between">
                  <span className="flex -space-x-2">
                    {["AW", "SK", "JM", "LP"].map((initials, index) => (
                      <span key={initials} className="flex size-7 items-center justify-center rounded-full bg-surface-3 font-mono text-[10px] text-muted ring-2 ring-surface" style={{ zIndex: 4 - index }}>{initials}</span>
                    ))}
                  </span>
                  <span className="type-meta text-success">{t("4/5 zugesagt")}</span>
                </div>
              </div>
              <div className="rounded-[18px] border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="type-eyebrow flex items-center gap-2 text-muted"><Radio className="size-3.5 text-accent" />{t("Live · Leader")}</span>
                  <span className="type-meta text-subtle">{t("3 Geräte synchron")}</span>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div><span className="type-display text-[46px] tabular-nums">120</span><span className="type-meta ml-1.5 text-muted">{t("BPM")}</span></div>
                  <span className="pb-3"><BeatDots size="lg" /></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Marquee                                                                    */
/* -------------------------------------------------------------------------- */

const TICKER_A = translatable(["Lead Sheets", "Noteneditor", "Setlists", "Live-Modus", "Synchroner Click", "Terminfinder", "Bandkasse", "Rechnungen", "Stems", "Ideen-Inbox"]);
const TICKER_B = translatable(["ChordPro", "MusicXML & MIDI", "Tabulatur", "Teleprompter", "Kalender-Sync", "Probenplaner", "Protokoll", "Tech-Rider", "Stage-Plot", "GiroCode", "Web Push", "ntfy", "2FA", "Backups", "Android"]);

function Marquee({ items, reverse, variant }: { items: string[]; reverse?: boolean; variant: "display" | "mono" }) {
  const content = [...items, ...items];
  return (
    <div className="lp-marquee">
      <div className={cn("lp-marquee-track", reverse && "lp-marquee-track--reverse")} style={{ "--speed": variant === "display" ? "52s" : "60s" } as Vars}>
        {content.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className={cn(
              "flex shrink-0 items-center whitespace-nowrap",
              variant === "display" ? "type-display gap-7 pr-7 text-[34px] text-fg/90 sm:text-[48px]" : "type-eyebrow gap-5 pr-5 text-muted",
            )}
            aria-hidden={index >= items.length || undefined}
          >
            {item}
            <span className={cn("rounded-full bg-accent", variant === "display" ? "size-2.5" : "size-1")} />
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bento demos                                                                */
/* -------------------------------------------------------------------------- */

function BentoCard({ className, eyebrow, icon, title, text, children, delay = 0 }: {
  className?: string; eyebrow: string; icon: ReactNode; title: string; text: string; children: ReactNode; delay?: number;
}) {
  return (
    <Reveal as="article" delay={delay} spotlight className={cn("lp-card card flex flex-col rounded-[22px] p-5 sm:p-6", className)}>
      <div className="relative flex min-h-48 flex-1 flex-col justify-center">{children}</div>
      <div className="relative mt-6">
        <div className="type-eyebrow flex items-center gap-2 text-muted [&_svg]:size-3.5">{icon}{eyebrow}</div>
        <h3 className="mt-2.5 text-[20px] font-semibold tracking-[-0.018em]">{title}</h3>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{text}</p>
      </div>
    </Reveal>
  );
}

function ChordLine({ segments }: { segments: Array<[string, string, string]> }) {
  return (
    <div className="flex flex-wrap text-[16px] sm:text-[18px]">
      {segments.map(([chord, transposed, lyric], index) => (
        <span key={index} className="inline-flex flex-col">
          <span className="relative grid h-6 font-mono text-[13px] font-semibold text-[var(--chord)]">
            <span className="lp-xfade-a col-start-1 row-start-1">{chord}</span>
            <span className="lp-xfade-b col-start-1 row-start-1">{transposed}</span>
          </span>
          <span className="whitespace-pre">{lyric}</span>
        </span>
      ))}
    </div>
  );
}

function SongsDemo() {
  return (
    <div className="rounded-[16px] border border-border bg-bg p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="type-eyebrow text-muted">{t("Midnight Run · Strophe 1")}</span>
        <span className="flex items-center gap-2 rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted">
          {t("Transponieren")}
          <span className="relative grid font-semibold">
            <span className="lp-xfade-a col-start-1 row-start-1">±0</span>
            <span className="lp-xfade-b col-start-1 row-start-1 text-accent-text">+2</span>
          </span>
        </span>
      </div>
      <div className="mt-4 space-y-2">
        <ChordLine segments={[[t("Am"), t("Bm"), t("Neonlichter ")], ["F", "G", t("über der Stadt, ")], ["C", "D", t("keiner hier, der ")], ["G", "A", t("Antworten hat")]]} />
        <div className="border-l-2 border-accent pl-3">
          <ChordLine segments={[["F", "G", t("Midnight ")], ["G", "A", t("Run, wir ")], [t("Am"), t("Bm"), t("sind nicht allein")]]} />
        </div>
      </div>
    </div>
  );
}

function NotationDemo() {
  const notes: Array<[number, number]> = [[46, 57], [74, 52], [102, 47], [130, 42], [166, 47], [194, 37]];
  return (
    <div className="rounded-[16px] border border-border bg-bg p-4">
      <svg viewBox="0 0 240 90" className="w-full text-fg" role="img" aria-label={t("Notenzeile")}>
        {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="8" x2="232" y1={22 + line * 10} y2={22 + line * 10} stroke="currentColor" strokeOpacity="0.22" />)}
        <line x1="150" x2="150" y1="22" y2="62" stroke="currentColor" strokeOpacity="0.3" />
        <line x1="232" x2="232" y1="22" y2="62" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
        <text x="12" y="58" fontSize="44" fill="currentColor" fillOpacity="0.75" fontFamily="serif">𝄞</text>
        {notes.map(([x, y], index) => (
          <g key={x} className="lp-note" style={{ "--d": `${index * 420}ms` } as Vars}>
            <ellipse cx={x} cy={y} rx="6.2" ry="4.4" transform={`rotate(-20 ${x} ${y})`} fill={index === 3 ? "var(--accent)" : "currentColor"} />
            <line x1={x + 5.6} x2={x + 5.6} y1={y - 1} y2={y - 29} stroke={index === 3 ? "var(--accent)" : "currentColor"} strokeWidth="1.4" />
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[t("Gitarre + TAB"), "MusicXML", "MIDI", t("Playback")].map((label) => (
          <span key={label} className="rounded-full border border-border px-2 py-0.5 font-mono text-[10.5px] text-muted">{label}</span>
        ))}
      </div>
    </div>
  );
}

function LiveDemo() {
  return (
    <div className="flex items-end justify-center gap-4 sm:gap-6">
      {[
        { label: t("Leader"), shape: "phone" },
        { label: t("Gitarre"), shape: "phone" },
        { label: t("Drums"), shape: "band" },
      ].map((device, index) => (
        <div key={device.label} className="flex flex-col items-center gap-2.5">
          {device.shape === "phone" ? (
            <div className="relative flex h-32 w-[70px] flex-col items-center justify-center gap-3 overflow-hidden rounded-[18px] border border-border bg-bg">
              <span className={cn("lp-flash absolute inset-0", index === 0 ? "bg-accent/25" : "bg-fg/10")} />
              <span className="type-display relative text-[24px]">120</span>
              <span className="relative"><BeatDots /></span>
            </div>
          ) : (
            <div className="relative flex h-32 w-[70px] items-center justify-center">
              <span className="absolute inset-y-0 w-9 rounded-full bg-gradient-to-b from-fg/10 via-fg/[0.04] to-fg/10" />
              <span className="lp-vibrate absolute size-14 rounded-[14px] border border-accent/60" />
              <span className="relative flex size-12 items-center justify-center rounded-[13px] border border-border bg-bg">
                <span className="led" />
              </span>
            </div>
          )}
          <span className="type-eyebrow text-[10px] text-muted">{device.label}</span>
        </div>
      ))}
    </div>
  );
}

function SetlistDemo() {
  const rows: Array<[string, string]> = [[t("Static Hearts"), "3:07"], [t("Golden Hour"), "3:18"], [t("Midnight Run"), "3:34"], [t("Paper Planes"), "4:05"]];
  return (
    <div>
      <div className="overflow-hidden rounded-[16px] border border-border bg-bg">
        {rows.map(([title, duration], index) => (
          <div
            key={title}
            className={cn(
              "relative flex h-11 items-center gap-3 border-b border-border px-3 last:border-b-0",
              index === 1 && "lp-swap-down z-[1] bg-surface shadow-[0_8px_20px_-10px_rgb(0_0_0/0.35)]",
              index === 2 && "lp-swap-up bg-bg",
            )}
          >
            <GripVertical className="size-3.5 text-subtle" />
            <span className="type-meta w-5 text-subtle">{String(index + 1).padStart(2, "0")}</span>
            <span className="flex-1 text-[14px] font-medium">{title}</span>
            <span className="type-meta text-muted">{duration}</span>
          </div>
        ))}
      </div>
      <div className="type-meta mt-3 flex justify-between text-muted"><span>{t("4 Songs · Übergänge & Notizen")}</span><span className="text-fg">{t("Gesamt 14:04")}</span></div>
    </div>
  );
}

function CalendarDemo() {
  const days = Array.from({ length: 21 }, (_, index) => index + 2);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {["M", "D", "M", "D", "F", "S", "S"].map((day, index) => <span key={index} className="pb-1 text-center font-mono text-[10px] text-subtle">{day}</span>)}
        {days.map((day, index) => {
          const pick = day === 20;
          return (
            <span
              key={day}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center gap-1 rounded-[8px] border text-[11px]",
                pick ? "lp-pick border-accent bg-accent-soft font-semibold text-accent-text" : "border-border bg-bg text-muted",
              )}
            >
              {day}
              <span className="flex gap-[2px]">
                {[0, 1, 2].map((member) => {
                  const value = pick ? 0 : noise(index * 3 + member, 3);
                  return <span key={member} className={cn("size-[3px] rounded-full", value < 0.55 ? "bg-success" : value < 0.75 ? "bg-warning" : "bg-danger")} />;
                })}
              </span>
            </span>
          );
        })}
      </div>
      <p className="type-meta mt-3 text-muted"><span className="text-accent-text">{t("Fr 20.")}</span> {t("· alle können")}</p>
    </div>
  );
}

function AudioDemo() {
  const bars = Array.from({ length: 72 }, (_, index) => 18 + Math.round(noise(index, 7) * 70 * (0.55 + 0.45 * Math.sin(index / 7) ** 2)));
  const tracks: Array<{ name: string; from: string; to: string; t: string; muted?: boolean }> = [
    { name: "Vocals", from: "-6px", to: "-34px", t: "4.2s" },
    { name: "Gitarre", from: "0px", to: "0px", t: "5s", muted: true },
    { name: "Bass", from: "-22px", to: "-8px", t: "5.6s" },
    { name: "Drums", from: "-14px", to: "-40px", t: "4.8s" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <div className="rounded-[16px] border border-border bg-bg p-4">
        <div className="flex items-center justify-between">
          <span className="type-eyebrow text-muted">{t("Probe 12.11. · Take 3")}</span>
          <span className="type-meta text-accent-text">{t("A/B-Loop")}</span>
        </div>
        <div className="relative mt-3 flex h-20 items-center gap-[2px]">
          <span className="absolute inset-y-0 left-[30%] right-[36%] rounded-[6px] bg-accent-soft" />
          <span className="type-meta absolute -top-0.5 left-[30%] -translate-x-1/2 text-[10px] text-accent-text">{t("A")}</span>
          <span className="type-meta absolute -top-0.5 left-[64%] -translate-x-1/2 text-[10px] text-accent-text">{t("B")}</span>
          {bars.map((height, index) => (
            <span key={index} className={cn("relative flex-1 rounded-full", index / bars.length >= 0.3 && index / bars.length <= 0.64 ? "bg-fg/70" : "bg-fg/25")} style={{ height: `${height}%` }} />
          ))}
          <span className="lp-playhead absolute inset-y-[-4px] w-[2px] rounded-full bg-accent shadow-[0_0_12px_rgb(255_98_36/0.8)]" />
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
          <MessageSquare className="size-3.5" /><span className="type-meta text-fg">1:42</span> {t("„Hier Bridge etwas zurücknehmen“")}
        </div>
      </div>
      <div className="flex justify-center gap-4 rounded-[16px] border border-border bg-bg px-5 py-4">
        {tracks.map((track) => (
          <div key={track.name} className="flex flex-col items-center gap-2">
            <span className={cn("font-mono text-[10px]", track.muted ? "rounded bg-accent px-1 text-accent-fg" : "text-subtle")}>{track.muted ? "M" : "·"}</span>
            <span className="relative h-20 w-1.5 rounded-full bg-fg/10">
              <span
                className={cn("lp-fader absolute bottom-3 left-1/2 -ml-[9px] h-3 w-[18px] rounded-[4px] border border-border-strong bg-surface shadow-[0_2px_4px_rgb(0_0_0/0.2)]", track.muted && "opacity-40")}
                style={{ "--from": track.from, "--to": track.to, "--t": track.t } as Vars}
              />
            </span>
            <span className="font-mono text-[10px] text-muted">{track.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinanceDemo() {
  const months = [38, 62, 30, 74, 48, 88];
  return (
    <div className="grid grid-cols-[1fr_auto] items-end gap-4">
      <div className="relative rounded-[12px] bg-white p-4 text-[#161514] shadow-[0_20px_40px_-20px_rgb(0_0_0/0.35)] ring-1 ring-black/5">
        <div className="flex items-start justify-between">
          <span className="text-[13px] font-bold text-[#f0521a]">{t("The Night Owls")}</span>
          <span className="space-y-1 text-right"><span className="block h-1 w-12 rounded bg-black/10" /><span className="ml-auto block h-1 w-8 rounded bg-black/10" /></span>
        </div>
        <div className="mt-4 text-[15px] font-bold">{t("Rechnung")} <span className="font-mono text-[11px] font-normal text-black/50">{t("RE-2026-014")}</span></div>
        <div className="mt-3 space-y-1.5">
          <span className="block h-1.5 w-4/5 rounded bg-black/10" />
          <span className="block h-1.5 w-3/5 rounded bg-black/10" />
        </div>
        <div className="mt-4 flex justify-between border-t border-black/10 pt-2 text-[12px]"><span className="text-black/50">{t("Gesamt")}</span><span className="font-semibold">450,00 €</span></div>
        <span className="lp-stamp absolute right-3 top-14 rounded-[6px] border-2 border-[#1d8049] px-2 py-0.5 font-mono text-[13px] font-bold uppercase tracking-[0.12em] text-[#1d8049]">{t("Bezahlt")}</span>
      </div>
      <div className="flex h-28 items-end gap-1.5">
        {months.map((height, index) => (
          <span key={index} className="lp-bar w-3 rounded-t-[3px] bg-[var(--viz-1)]" style={{ height: `${height}%`, "--delay": `${200 + index * 90}ms` } as Vars} />
        ))}
      </div>
    </div>
  );
}

function GigDemo() {
  const items: Array<{ label: string; x: string; y: string; icon: ReactNode }> = [
    { label: t("Drums"), x: "50%", y: "26%", icon: <span className="size-3.5 rounded-full border-2 border-current" /> },
    { label: t("Gitarre"), x: "20%", y: "34%", icon: <Guitar className="size-3.5" /> },
    { label: t("Bass"), x: "80%", y: "34%", icon: <Guitar className="size-3.5" /> },
    { label: t("Gesang"), x: "50%", y: "64%", icon: <Mic className="size-3.5" /> },
  ];
  return (
    <div className="grid grid-cols-[1.3fr_1fr] gap-3">
      <div className="relative h-44 rounded-[16px] border border-border bg-bg">
        <span className="type-eyebrow absolute bottom-2 left-1/2 -translate-x-1/2 text-[9.5px] text-subtle">{t("Publikum")}</span>
        {items.map((item, index) => (
          <span
            key={item.label}
            className="lp-drop absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-[11px] font-medium shadow-[0_4px_10px_-6px_rgb(0_0_0/0.3)]"
            style={{ left: item.x, top: item.y, "--delay": `${300 + index * 140}ms` } as Vars}
          >
            {item.icon}{item.label}
          </span>
        ))}
      </div>
      <ul className="space-y-1.5 self-center font-mono text-[11px] text-muted">
        {[["01", t("Kick"), t("Beta 91")], ["02", t("Snare"), "SM57"], ["05", t("Bass"), "DI"], ["07", t("Vox"), "SM58"]].map(([channel, source, mic]) => (
          <li key={channel} className="flex gap-2 border-b border-border pb-1.5"><span className="text-subtle">{channel}</span><span className="flex-1 text-fg">{source}</span><span>{mic}</span></li>
        ))}
      </ul>
    </div>
  );
}

function IdeasDemo() {
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="relative flex size-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-accent/50 [animation:ripple_2.4s_var(--ease-out)_infinite]" />
        <span className="absolute inset-0 rounded-full border border-accent/50 [animation:ripple_2.4s_var(--ease-out)_1.2s_infinite]" />
        <span className="relative flex size-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-[0_10px_30px_-8px_rgb(255_98_36/0.7)]"><Mic className="size-6" /></span>
      </span>
      <span className="flex items-center gap-3 text-accent-text"><span className="eq"><i /><i /><i /><i /></span><span className="type-meta">{t("0:42 · Riff in D")}</span></span>
    </div>
  );
}

function PublicDemo() {
  return (
    <div className="rounded-[16px] border border-border bg-bg p-4">
      <p className="type-eyebrow text-muted">{t("Indie-Rock · Hamburg")}</p>
      <p className="type-display mt-2 text-[26px]">{t("The Night Owls")}</p>
      <ul className="type-meta mt-3 space-y-1 text-muted">
        <li className="flex justify-between"><span className="text-fg">21.11.</span><span>{t("Molotow, Hamburg")}</span></li>
        <li className="flex justify-between"><span className="text-fg">05.12.</span><span>{t("Kulturhaus, Kiel")}</span></li>
      </ul>
      <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-[12px] font-medium text-ink-fg">{t("Booking anfragen")} <ArrowRight className="size-3" /></span>
    </div>
  );
}

function TeamDemo() {
  const people: Array<[string, string, string]> = [["AW", "Alex", "Owner"], ["SK", "Sam", "Admin"], ["JM", "Jo", "Mitglied"], ["KB", "Kim", t("Gast · 1 Setlist")]];
  return (
    <ul className="space-y-2">
      {people.map(([initials, name, role], index) => (
        <li key={name} className="flex items-center gap-3 rounded-[12px] border border-border bg-bg px-3 py-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-surface-3 font-mono text-[10px] text-muted">{initials}</span>
          <span className="flex-1 text-[14px] font-medium">{name}</span>
          <span className={cn("rounded-[5px] px-1.5 py-[3px] font-mono text-[10px] uppercase tracking-[0.04em] ring-1 ring-inset", index === 3 ? "bg-accent-soft text-accent-text ring-accent/20" : "bg-fg/[0.045] text-muted ring-fg/[0.08]")}>{role}</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Live section visual                                                        */
/* -------------------------------------------------------------------------- */

function SyncVisual() {
  const followers: Array<{ label: string; meta: string; style: CSSProperties; band?: boolean }> = [
    { label: t("Gitarre"), meta: "Android", style: { left: "6%", top: "10%" } },
    { label: t("Drums"), meta: "Pulse", style: { right: "4%", top: "20%" }, band: true },
    { label: t("Bass"), meta: "Browser", style: { left: "14%", bottom: "6%" } },
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]">
      {[0, 666, 1333].map((delay) => (
        <span key={delay} className="lp-broadcast absolute inset-[28%] rounded-full border border-accent/50" style={{ "--d": `${delay}ms` } as Vars} />
      ))}
      <span className="absolute inset-[18%] rounded-full border border-dashed border-white/10" />
      <span className="absolute inset-[4%] rounded-full border border-dashed border-white/[0.06]" />
      <div className="absolute left-1/2 top-1/2 flex h-44 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-3 overflow-hidden rounded-[24px] border border-white/15 bg-[#111418] shadow-[0_30px_80px_-20px_rgb(255_98_36/0.35)]">
        <span className="lp-flash absolute inset-0 bg-accent/20" />
        <span className="type-eyebrow relative flex items-center gap-1.5 text-[9.5px] text-accent-text"><span className="led" />{t("Leader")}</span>
        <span className="type-display relative text-[40px] leading-none">120</span>
        <span className="relative"><BeatDots /></span>
      </div>
      {followers.map((device) => (
        <div key={device.label} className="absolute flex flex-col items-center gap-2" style={device.style}>
          <div className={cn("relative flex items-center justify-center overflow-hidden border border-white/12 bg-[#111418]", device.band ? "size-16 rounded-[18px]" : "h-24 w-14 rounded-[16px]")}>
            <span className="lp-flash absolute inset-0 bg-white/10" />
            {device.band ? <span className="lp-vibrate absolute inset-1 rounded-[14px] border border-accent/60" /> : null}
            <span className="relative"><BeatDots /></span>
          </div>
          <span className="type-eyebrow text-[9.5px] text-muted">{device.label} · {device.meta}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const MORE: Array<{ icon: ReactNode; title: string; text: string }> = translatable([
  { icon: <BellRing />, title: "Push & ntfy", text: "Benachrichtigungen im Browser, aufs Handy oder per ntfy – plus Wochen-Digest am Montag." },
  { icon: <CalendarClock />, title: "Erinnerungen", text: "24 Stunden vor jeder Probe – und ein freundlicher Stups, wenn eine Zusage fehlt." },
  { icon: <RefreshCw />, title: "Kalender-Sync", text: "Google, iCloud oder Outlook verbinden: belegte Zeiten blocken automatisch." },
  { icon: <Download />, title: "Import", text: "ChordPro-Dateien und Spotify-Playlists übernehmen – mit Tonart und Tempo." },
  { icon: <ClipboardList />, title: "Probenprotokoll", text: "Notizen, Song-Bewertungen und Aufgaben direkt aus der Probe heraus." },
  { icon: <Wand2 />, title: "Probenplaner", text: "Schlägt vor, was geprobt werden sollte – nach Gigs, Song-Status und Bewertungen." },
  { icon: <MessageSquare />, title: "Kommentare am Zeitstempel", text: "Feedback genau an der Stelle der Aufnahme – mit A/B-Loop zum Üben." },
  { icon: <KeyRound />, title: "Zwei-Faktor-Login", text: "Authenticator-Apps und Wiederherstellungscodes für jeden Account." },
  { icon: <DatabaseBackup />, title: "Automatische Backups", text: "Nächtliche Sicherungen eurer Banddaten, Wiederherstellung mit einem Klick." },
  { icon: <Sparkles />, title: "KI – wenn ihr wollt", text: "OpenAI, Gemini oder lokal mit Ollama: Lead Sheets formatieren, Setlists ordnen, Memos transkribieren." },
  { icon: <Smartphone />, title: "Native Android-App", text: "Lead Sheets offline, Wiedergabe im Hintergrund und Click per Vibration." },
  { icon: <WifiOff />, title: "Offline auf der Bühne", text: "Setlists und Lead Sheets werden vor dem Gig geladen – Netz ist dann egal." },
]);

export function Landing({ signedIn, registrationOpen }: { signedIn: boolean; registrationOpen: boolean }) {
  const primaryHref = signedIn ? "/app" : registrationOpen ? "/login?mode=register" : "/login";
  const primaryLabel = signedIn ? t("Zur App") : registrationOpen ? t("Kostenlos starten") : "Anmelden";
  const year = new Date().getFullYear();

  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-fg">
      <LandingEffects />

      {/* Navigation */}
      <header data-lp-nav="" className="lp-nav theme-dark fixed inset-x-3 top-3 z-50 mx-auto flex h-14 max-w-5xl items-center gap-2 rounded-full border border-transparent px-2.5 pl-4 text-fg backdrop-blur-xl sm:inset-x-6 sm:top-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label={t("Bandival")}>
          <BrandMark className="size-7 rounded-[8px]" />
          <span className="type-display text-[19px]">{t("Bandival")}</span>
        </Link>
        <nav className="mx-auto hidden items-center gap-0.5 md:flex" aria-label={t("Seitennavigation")}>
          {[["#features", t("Funktionen")], ["#live", t("Live-Modus")], ["#more", t("Mehr")], ["#selfhosted", t("Self-hosted")]].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full px-3.5 py-2 text-[13.5px] text-muted transition-colors hover:bg-white/[0.06] hover:text-fg">{label}</a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <LanguageSwitch className="mr-1 hidden text-muted sm:inline-flex" />
          {!signedIn ? <Link href="/login" className={buttonClasses("ghost", "sm", "hidden text-fg sm:inline-flex")}>{t("Anmelden")}</Link> : null}
          <Link href={primaryHref} className={buttonClasses("accent", "sm")}>{signedIn ? t("Zur App") : registrationOpen ? t("Loslegen") : t("Anmelden")}</Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section id="top" className="theme-dark relative isolate overflow-hidden bg-[#07090c] pb-24 pt-36 text-fg sm:pb-36 sm:pt-44">
          <StageLights />
          <div className="mx-auto max-w-6xl px-5 text-center">
            <a href="#live" className="lp-fade-up inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-3.5 text-[13px] text-muted backdrop-blur transition-colors hover:border-white/20 hover:text-fg" style={{ "--d": "100ms" } as Vars}>
              <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-accent-fg">{t("Neu")}</span>
              <span className="hidden sm:inline">{t("Synchroner Click – ohne Internet, ohne Pairing")}</span>
              <span className="sm:hidden">{t("Click ohne Internet")}</span>
              <ArrowRight className="size-3.5" />
            </a>
            <h1 className="type-display mx-auto mt-8 max-w-5xl text-[56px] leading-[0.9] sm:text-[100px] lg:text-[128px]">
              <Words text={t("Weniger Orga.")} start={250} />
              <br />
              <span className="text-muted"><Words text={t("Mehr Musik.")} start={520} /></span>
            </h1>
            <p className="lp-fade-up mx-auto mt-8 max-w-2xl text-[17px] leading-relaxed text-muted sm:text-[19px]" style={{ "--d": "900ms" } as Vars}>
              {t("Songs, Setlists, Proben, Gigs und Bandkasse an einem Ort – mit einem Live-Modus, der auf der Bühne synchron klickt. Self-hosted, damit eure Musik eure bleibt.")}
            </p>
            <div className="lp-fade-up mt-10 flex flex-wrap items-center justify-center gap-3" style={{ "--d": "1050ms" } as Vars}>
              <Link href={primaryHref} className={buttonClasses("accent", "lg", "group")}>
                {primaryLabel}
                <ArrowRight className="transition-transform duration-300 ease-out-expo group-hover:translate-x-1" />
              </Link>
              <a href="#features" className={buttonClasses("ghost", "lg", "text-fg hover:bg-white/[0.07]")}>{t("Funktionen ansehen")}</a>
            </div>
            <p className="lp-fade-up type-eyebrow mt-8 text-subtle" style={{ "--d": "1200ms" } as Vars}>{t("Self-hosted · Docker · Web, PWA & Android")}</p>
          </div>
          <ProductMock />
        </section>

        {/* Ticker */}
        <section aria-label={t("Funktionsüberblick")} className="space-y-4 border-b border-border py-8">
          <Marquee items={TICKER_A} variant="display" />
          <Marquee items={TICKER_B} variant="mono" reverse />
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-28 sm:py-36">
          <SectionHeading
            index="01"
            eyebrow={t("Funktionen")}
            title={t("Alles für den Bandalltag.")}
            muted={t("Nichts, was nervt.")}
            description={t("Vom ersten Riff bis zur Gage: Bandival bündelt, wofür Bands sonst fünf Apps, drei Gruppenchats und eine Excel-Tabelle brauchen.")}
          />
          <div className="mt-16 grid gap-4 md:grid-cols-6">
            <BentoCard className="md:col-span-4" eyebrow={t("Repertoire")} icon={<Music2 />} title={t("Songs & Lead Sheets")} text={t("Akkorde im ChordPro-Format, mit einem Klick transponiert, mit Aufnahmen, Dateien, Diskussionen und Status von der Idee bis bühnenreif.")}>
              <SongsDemo />
            </BentoCard>
            <BentoCard className="md:col-span-2" delay={80} eyebrow={t("Notation")} icon={<FileText />} title={t("Noteneditor")} text={t("Noten und Tabs direkt im Browser schreiben, abspielen und als MusicXML oder MIDI exportieren.")}>
              <NotationDemo />
            </BentoCard>
            <BentoCard className="md:col-span-3" eyebrow={t("Live")} icon={<Radio />} title={t("Synchroner Click")} text={t("Ein Gerät gibt den Takt vor, alle anderen laufen mit – per Bluetooth, WLAN oder Server. Auch als Vibration.")}>
              <LiveDemo />
            </BentoCard>
            <BentoCard className="md:col-span-3" delay={80} eyebrow={t("Setlists")} icon={<ListMusic />} title={t("Setlists, die mitdenken")} text={t("Per Drag & Drop sortieren, Übergänge notieren, Gesamtdauer im Blick – und mit Gästen teilen.")}>
              <SetlistDemo />
            </BentoCard>
            <BentoCard className="md:col-span-2" eyebrow={t("Termine")} icon={<CalendarDays />} title={t("Terminfinder")} text={t("Alle tragen ein, wann sie können – Bandival findet den Tag, an dem wirklich alle da sind.")}>
              <CalendarDemo />
            </BentoCard>
            <BentoCard className="md:col-span-4" delay={80} eyebrow={t("Aufnahmen")} icon={<AudioWaveform />} title={t("Proben-Takes, Stems & Übungsmixer")} text={t("Kommentare am Zeitstempel, A/B-Loop zum Üben und einzelne Spuren leiser oder stumm – ganz ohne KI, wenn ihr Stems hochladet.")}>
              <AudioDemo />
            </BentoCard>
            <BentoCard className="md:col-span-3" eyebrow={t("Finanzen")} icon={<FileText />} title={t("Bandkasse & Rechnungen")} text={t("Gagen, Proberaum, Equipment – und rechtssichere Rechnungen mit fortlaufender Nummer, allen Pflichtangaben und GiroCode.")}>
              <FinanceDemo />
            </BentoCard>
            <BentoCard className="md:col-span-3" delay={80} eyebrow={t("Gigs")} icon={<Guitar />} title={t("Tech-Rider & Stage-Plot")} text={t("Kanalliste, Monitormixe und Bühnenplan per Drag & Drop – als PDF mit den Zeiten des Gigs.")}>
              <GigDemo />
            </BentoCard>
            <BentoCard className="md:col-span-2" eyebrow={t("Ideen")} icon={<Lightbulb />} title={t("Ideen-Inbox")} text={t("Riff im Kopf? Aufnehmen, ablegen, später zum Song machen.")}>
              <IdeasDemo />
            </BentoCard>
            <BentoCard className="md:col-span-2" delay={80} eyebrow={t("Öffentlich")} icon={<Globe />} title={t("Bandseite & EPK")} text={t("Eure eigene Seite mit Bio, Konzerten, Hörproben und Kalender-Abo für Fans.")}>
              <PublicDemo />
            </BentoCard>
            <BentoCard className="md:col-span-2" delay={160} eyebrow={t("Team")} icon={<Users />} title={t("Rollen & Gastzugänge")} text={t("Von Owner bis Aushilfe: jede Person sieht genau das, was sie braucht.")}>
              <TeamDemo />
            </BentoCard>
          </div>
        </section>

        {/* Live */}
        <section id="live" className="theme-dark relative isolate scroll-mt-0 overflow-hidden bg-[#07090c] py-28 text-fg sm:py-36">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_75%_50%,rgb(255_98_36/0.12),transparent_70%)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-16 px-5 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <SectionHeading
                index="02"
                eyebrow={t("Live-Modus")}
                title={t("Ein Click. Alle Geräte.")}
                muted={t("Kein WLAN nötig.")}
                description={t("Wer den Click startet, gibt den Takt vor. Alle anderen Handys finden ihn von selbst – per Bluetooth-Broadcast, im lokalen WLAN oder über den Server. Kein Hotspot, kein Pairing, keine Einstellungen.")}
              />
              <ol className="mt-10 space-y-px overflow-hidden rounded-[18px] border border-border">
                {[
                  [t("Start drücken"), t("Dein Gerät wird automatisch zum Leader.")],
                  [t("Alle laufen mit"), t("Die anderen Geräte hören das Signal und rasten auf die Zählzeit ein.")],
                  [t("Spielen"), t("Nächster Song, Tempo, Einzähler – alles bleibt synchron. Auch ohne Netz.")],
                ].map(([title, text], index) => (
                  <Reveal as="li" key={title} delay={index * 120} className="flex gap-5 bg-surface/60 px-5 py-4">
                    <span className="type-meta pt-0.5 text-accent-text">{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <span className="block font-semibold">{title}</span>
                      <span className="block text-[14.5px] text-muted">{text}</span>
                    </span>
                  </Reveal>
                ))}
              </ol>
              <Reveal delay={200} className="mt-10 grid grid-cols-3 gap-4">
                <div><div className="type-display text-[40px]">{t("<8 ms")}</div><div className="type-eyebrow mt-1 text-muted">{t("Abweichung")}</div></div>
                <div><div className="type-display text-[40px]">0</div><div className="type-eyebrow mt-1 text-muted">{t("Einstellungen")}</div></div>
                <div><div className="type-display text-[40px]"><span data-count="100" data-suffix=" %">100 %</span></div><div className="type-eyebrow mt-1 text-muted">{t("offline-fähig")}</div></div>
              </Reveal>
            </div>
            <Reveal delay={150}>
              <SyncVisual />
            </Reveal>
          </div>
        </section>

        {/* More features */}
        <section id="more" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-28 sm:py-36">
          <SectionHeading index="03" eyebrow={t("Und noch viel mehr")} title={t("Die kleinen Dinge,")} muted={t("die den Unterschied machen.")} />
          <div className="mt-16 grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-4">
            {MORE.map((item, index) => (
              <Reveal key={item.title} delay={(index % 4) * 70} className="group border-b border-r border-border p-6 transition-colors duration-300 hover:bg-surface">
                <span className="flex size-10 items-center justify-center rounded-full border border-border text-muted transition-[color,border-color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:border-accent/40 group-hover:text-accent-text [&_svg]:size-[18px]">{item.icon}</span>
                <h3 className="mt-5 text-[16px] font-semibold tracking-[-0.01em]">{item.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{item.text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Pulse */}
        <section className="mx-auto max-w-6xl px-5 pb-28 sm:pb-36">
          <Reveal className="theme-dark relative isolate grid items-center gap-10 overflow-hidden rounded-[28px] bg-[#0b0e12] p-8 text-fg sm:p-12 lg:grid-cols-2">
            <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 -z-10 size-96 rounded-full bg-[radial-gradient(closest-side,rgb(255_98_36/0.22),transparent)] [animation:drift_10s_ease-in-out_infinite]" />
            <div className="relative mx-auto flex h-64 w-full max-w-sm items-center justify-center">
              <span className="absolute h-28 w-full rounded-full bg-gradient-to-r from-white/[0.03] via-white/[0.09] to-white/[0.03] ring-1 ring-white/10" />
              {[0, 1, 2].map((ring) => (
                <span key={ring} className="lp-vibrate absolute size-32 rounded-[30px] border border-accent/50" style={{ animationDelay: `${ring * 160}ms` }} />
              ))}
              <span className="relative flex size-32 flex-col items-center justify-center gap-2 rounded-[30px] border border-white/15 bg-[#12161b] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)]">
                <span className="led led-pulse" />
                <span className="type-display text-[34px] leading-none">120</span>
                <BeatDots />
              </span>
            </div>
            <div>
              <p className="type-eyebrow flex items-center gap-2.5 text-accent-text"><Vibrate className="size-4" />{t("Bald · In Entwicklung")}</p>
              <h2 className="type-display mt-5 text-[40px] leading-[0.95] sm:text-[60px]">{t("Bandival Pulse.")}<br /><span className="text-muted">{t("Den Takt fühlen.")}</span></h2>
              <p className="mt-5 text-[16px] leading-relaxed text-muted">
                {t("Ein kleines Armband, das im Takt vibriert – gesteuert aus dem Live-Modus, ohne Kopplung und ohne Internet. Kein In-Ear, kein Kabel, keine verpassten Einsätze. Mit der Android-App vibrieren eure Handys schon heute mit.")}
              </p>
              <ul className="mt-6 space-y-2 text-[14.5px]">
                {[t("Vibriert auf jeder Zählzeit, betont die Eins"), t("Folgt automatisch dem Leader-Gerät"), t("Offenes, dokumentiertes Bluetooth-Protokoll")].map((point) => (
                  <li key={point} className="flex items-center gap-3"><Check className="size-4 text-accent-text" />{point}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>

        {/* Self-hosted */}
        <section id="selfhosted" className="border-t border-border bg-surface/50">
          <div className="mx-auto grid max-w-6xl scroll-mt-24 items-center gap-14 px-5 py-28 sm:py-36 lg:grid-cols-2">
            <div>
              <SectionHeading
                index="04"
                eyebrow={t("Self-hosted")}
                title={t("Eure Daten.")}
                muted={t("Euer Server.")}
                description={t("Bandival läuft dort, wo ihr es wollt – auf dem Server, dem NAS im Proberaum oder in der Cloud. Ohne Tracking, ohne Werbung, ohne Abo.")}
              />
              <ul className="mt-8 space-y-3 text-[15px]">
                {[t("Ein Befehl zum Start: Docker Compose mit PostgreSQL"), t("Automatische Backups und Export eurer Banddaten"), t("Rollen, Gastzugänge und Zwei-Faktor-Login"), t("Web-App, installierbar als PWA – plus native Android-App")].map((point, index) => (
                  <Reveal as="li" key={point} delay={index * 80} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-ink-fg"><Check className="size-3" strokeWidth={3} /></span>
                    {point}
                  </Reveal>
                ))}
              </ul>
            </div>
            <Reveal delay={120} className="theme-dark overflow-hidden rounded-[20px] border border-border bg-[#0b0d10] font-mono text-[13px] text-fg shadow-float">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" />
                <span className="mx-auto text-[11px] text-subtle">{t("~/bandival")}</span>
                <span className="w-10" />
              </div>
              <div className="space-y-2 p-5 sm:p-6">
                <div><span className="text-accent-text">$</span> <span className="lp-type" style={{ "--n": 20, "--delay": "300ms" } as Vars}>{t("cp .env.example .env")}</span></div>
                <div><span className="text-accent-text">$</span> <span className="lp-type" style={{ "--n": 20, "--delay": "1700ms" } as Vars}>{t("docker compose up -d")}</span></div>
                <div className="lp-out text-muted" style={{ "--delay": "3100ms" } as Vars}>{t("✔ Datenbank      gestartet")}</div>
                <div className="lp-out text-muted" style={{ "--delay": "3400ms" } as Vars}>{t("✔ Migrationen    angewendet")}</div>
                <div className="lp-out text-muted" style={{ "--delay": "3700ms" } as Vars}>{t("✔ Bandival       gestartet")}</div>
                <div className="lp-out" style={{ "--delay": "4100ms" } as Vars}><span className="text-success">●</span> {t("Bereit auf http://localhost:3000")}</div>
                <div className="lp-out" style={{ "--delay": "4400ms" } as Vars}><span className="text-accent-text">$</span> <span className="lp-caret">▍</span></div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Final call to action */}
        <section className="theme-dark relative isolate overflow-hidden bg-[#07090c] py-32 text-center text-fg sm:py-44">
          <StageLights floor={false} />
          <div className="mx-auto max-w-4xl px-5">
            <Reveal as="h2" className="type-display text-[52px] leading-[0.92] sm:text-[100px]">
              {t("Bereit für die")}<br /><span className="text-muted">{t("nächste Probe?")}</span>
            </Reveal>
            <Reveal as="p" delay={120} className="mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-muted">
              {t("Band anlegen, Leute einladen, loslegen – in weniger als einer Minute.")}
            </Reveal>
            <Reveal delay={220} className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href={primaryHref} className={buttonClasses("accent", "lg", "group")}>
                {primaryLabel}
                <ArrowRight className="transition-transform duration-300 ease-out-expo group-hover:translate-x-1" />
              </Link>
              {!signedIn ? <Link href="/login" className={buttonClasses("ghost", "lg", "text-fg hover:bg-white/[0.07]")}>{t("Ich habe schon einen Account")}</Link> : null}
            </Reveal>
            <div className="mx-auto mt-16 flex h-12 max-w-2xl items-end gap-[3px]" aria-hidden>
              {Array.from({ length: 64 }, (_, index) => (
                <span
                  key={index}
                  className={cn("flex-1 origin-bottom rounded-full", index > 28 && index < 36 ? "bg-accent" : "bg-white/20")}
                  style={{ height: `${18 + Math.round(noise(index, 5) * 82)}%`, animation: `eq ${700 + ((index * 37) % 650)}ms ease-in-out ${-((index * 53) % 900)}ms infinite` }}
                />
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BrandMark className="size-7 rounded-[8px]" />
            <span className="type-display text-[19px]">{t("Bandival")}</span>
            <span className="type-eyebrow hidden text-subtle sm:inline">{t("Self-hosted Band-Management")}</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-muted" aria-label={t("Footer")}>
            <a href="#features" className="link-draw hover:text-fg">{t("Funktionen")}</a>
            <a href="#live" className="link-draw hover:text-fg">{t("Live-Modus")}</a>
            <a href="#selfhosted" className="link-draw hover:text-fg">{t("Self-hosted")}</a>
            <Link href={signedIn ? "/app" : "/login"} className="link-draw hover:text-fg">{signedIn ? t("Zur App") : t("Anmelden")}</Link>
          </nav>
          <div className="flex flex-col gap-2 sm:items-end">
            <LegalLinks className="text-[13px]" />
            <span className="type-meta text-subtle">© {year} {t("Bandival")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
