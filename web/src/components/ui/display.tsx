/* eslint-disable @next/next/no-img-element -- avatars come from authenticated upload routes */
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { initials } from "@/lib/client/format";

export function Avatar({
  name,
  src,
  size = "md",
  className,
  ring,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  ring?: string;
}) {
  const sizes = {
    xs: "size-6 text-[9.5px]",
    sm: "size-8 text-[11px]",
    md: "size-9 text-xs",
    lg: "size-12 text-[15px]",
    xl: "size-20 text-2xl",
  };
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3 font-mono font-medium tracking-tight text-muted select-none",
        "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]",
        sizes[size],
        ring,
        className,
      )}
      title={name ?? undefined}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : initials(name)}
    </span>
  );
}

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-fg/[0.045] text-muted ring-fg/[0.08]",
  accent: "bg-accent-soft text-accent-text ring-accent/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-danger ring-danger/20",
};

/** Status tag in the style of label tape: small mono caps, a hairline and an optional status dot. */
export function Badge({ tone = "neutral", children, className, dot }: { tone?: BadgeTone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[5px] px-1.5 py-[3px] font-mono text-[10.5px] font-medium uppercase leading-none tracking-[0.045em] whitespace-nowrap ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <section className={cn("card", padded && "p-4 sm:p-5", className)}>{children}</section>;
}

export function CardHeader({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-[3px] text-muted [&_svg]:size-4">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Page title in the narrow display cut, with a mono eyebrow above it. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? <div className="mb-3">{back}</div> : null}
        {eyebrow ? <div className="type-eyebrow mb-2.5 text-muted">{eyebrow}</div> : null}
        <h1 className="type-display break-words text-[32px] sm:text-[44px]">{title}</h1>
        {description ? <div className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Empty state: the icon sits in a ring that sends out slow "sound waves". */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[14px] border border-dashed border-border-strong/70 px-6 py-14 text-center", className)}>
      {icon ? (
        <div className="relative mb-5 flex size-12 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-fg/15 [animation:ripple_3.2s_var(--ease-out)_infinite]" aria-hidden />
          <span className="absolute inset-0 rounded-full border border-fg/15 [animation:ripple_3.2s_var(--ease-out)_1.6s_infinite]" aria-hidden />
          <span className="relative flex size-12 items-center justify-center rounded-full border border-border bg-surface text-muted [&_svg]:size-5">{icon}</span>
        </div>
      ) : null}
      <h3 className="type-display text-[22px]">{title}</h3>
      {description ? <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[10px]", className)} aria-hidden />;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-border overflow-hidden" aria-busy>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 p-3.5" style={{ opacity: 1 - index * 0.14 }}>
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="type-eyebrow text-muted">{label}</div>
      <div className="type-display mt-1.5 truncate text-[22px] tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-subtle">{hint}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[5px] border border-border bg-surface px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-muted shadow-[0_1px_0_var(--border)]">{children}</kbd>;
}

/** Level meter – three bars that bounce while something plays or is live. */
export function Equalizer({ className, bars = 3 }: { className?: string; bars?: 3 | 4 }) {
  return (
    <span className={cn("eq", className)} aria-hidden>
      {Array.from({ length: bars }).map((_, index) => <i key={index} />)}
    </span>
  );
}

/** Bandival emblem: microphone on a stage diamond (same artwork as /icon.svg). */
export function BrandMark({ className }: { className?: string }) {
  // Unique gradient id: with a fixed id, a hidden copy of the logo (e.g. the desktop sidebar on phones) would swallow the gradient.
  const gradientId = `bm-${useId().replace(/:/g, "")}`;
  return (
    <span className={cn("inline-flex size-8 shrink-0 overflow-hidden rounded-[10px] ring-1 ring-black/5 dark:ring-white/10", className)} aria-hidden>
      <svg viewBox="0 0 512 512" className="size-full">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3b82f6" />
            <stop offset="0.5" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" fill="#0b0f14" />
        <path d="M256 92 L420 256 L256 420 L92 256 Z" fill="none" stroke={`url(#${gradientId})`} strokeWidth="30" strokeLinejoin="round" />
        <path d="M168 208 Q256 116 344 208" fill="none" stroke="#f472b6" strokeWidth="18" strokeLinecap="round" />
        <path d="M228 268 H284 L270 372 Q256 390 242 372 Z" fill="#ffffff" />
        <rect x="230" y="266" width="52" height="16" rx="4" fill="#a1a1aa" />
        <circle cx="256" cy="222" r="54" fill={`url(#${gradientId})`} />
      </svg>
    </span>
  );
}
