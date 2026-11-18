"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { ArrowRight, CloudOff, GitMerge, LogOut, Menu as MenuIcon, Monitor, Moon, Search, Sun } from "lucide-react";
import { CONFLICT_EVENT, useOutboxCount, useOutboxSync } from "@/lib/client/sync";
import { cn } from "@/lib/client/cn";
import { nextTheme, setThemeMode, THEME_LABEL, useThemeMode, type ThemeMode } from "@/lib/client/theme";
import { useSlidingIndicator } from "@/lib/client/use-indicator";
import { Avatar, BrandMark, Kbd } from "@/components/ui/display";
import { Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/navigation";
import { useSession } from "@/components/providers/session";
import { BandSwitcher } from "@/components/shell/band-switcher";
import { CommandPalette, openCommandPalette } from "@/components/shell/command-palette";
import { InviteHandler } from "@/components/shell/invite-handler";
import { MiniPlayer } from "@/components/shell/mini-player";
import { NoBand } from "@/components/shell/no-band";
import { NotificationsButton } from "@/components/shell/notifications";
import { isActive, navFor, type NavItem } from "@/components/shell/nav";
import { VerifyEmailGate } from "@/components/auth/verify-email-gate";

const THEME_ICON: Record<ThemeMode, ReactNode> = {
  system: <Monitor />,
  light: <Sun />,
  dark: <Moon />,
};

function ThemeButton({ className }: { className?: string }) {
  const mode = useThemeMode();
  return (
    <button
      type="button"
      onClick={() => setThemeMode(nextTheme(mode))}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full text-muted transition-[background-color,color,transform] duration-200 hover:bg-fg/[0.06] hover:text-fg active:scale-90 [&_svg]:size-[17px]",
        className,
      )}
      aria-label={`Darstellung: ${THEME_LABEL[mode]} (wechseln)`}
      title={`Darstellung: ${THEME_LABEL[mode]}`}
    >
      <span key={mode} className="[animation:pop-in_260ms_var(--ease-out)]">{THEME_ICON[mode]}</span>
    </button>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-active={active}
      className={cn(
        "relative z-[1] flex items-center gap-3 rounded-[10px] px-3 py-[7px] text-[14px] font-medium transition-colors duration-200",
        active ? "text-fg" : "text-muted hover:bg-fg/[0.035] hover:text-fg",
      )}
    >
      <Icon className="size-[17px]" strokeWidth={active ? 2.1 : 1.8} />
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

function SidebarNav({ primary, secondary, pathname }: { primary: NavItem[]; secondary: NavItem[]; pathname: string }) {
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const activeHref = [...primary, ...secondary].find((item) => isActive(pathname, item))?.href ?? null;
  useSlidingIndicator(navRef, barRef, activeHref);

  return (
    <nav ref={navRef} className="relative flex-1 overflow-y-auto px-3 py-2" aria-label="Hauptnavigation">
      <span ref={barRef} className="indicator rounded-[10px] border border-border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.05)]" aria-hidden>
        <span className="led absolute right-3 top-1/2 -translate-y-1/2" />
      </span>
      <div className="space-y-0.5">
        {primary.map((item) => <SidebarLink key={item.href} item={item} active={isActive(pathname, item)} />)}
      </div>
      {secondary.length ? (
        <>
          <div className="type-eyebrow mb-2 mt-7 px-3 text-subtle">Band</div>
          <div className="space-y-0.5">
            {secondary.map((item) => <SidebarLink key={item.href} item={item} active={isActive(pathname, item)} />)}
          </div>
        </>
      ) : null}
    </nav>
  );
}

function MobileDock({ primary, pathname, moreActive, onMore }: { primary: NavItem[]; pathname: string; moreActive: boolean; onMore: () => void }) {
  const dockRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const activeHref = moreActive ? "more" : primary.find((item) => isActive(pathname, item))?.href ?? null;
  useSlidingIndicator(dockRef, barRef, activeHref);

  const itemClass = (active: boolean) => cn(
    "relative z-[1] flex flex-col items-center justify-center gap-[3px] rounded-[17px] text-[10.5px] font-medium tracking-[0.01em] transition-[color,transform] duration-200 active:scale-95",
    active ? "text-fg" : "text-muted",
  );

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] lg:hidden" aria-label="Navigation">
      <div
        ref={dockRef}
        className="pointer-events-auto relative mx-auto grid h-[62px] max-w-md rounded-[22px] border border-border bg-surface/80 p-1 shadow-float backdrop-blur-xl backdrop-saturate-150"
        style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}
      >
        <span ref={barRef} className="indicator rounded-[17px] bg-fg/[0.07]" aria-hidden />
        {primary.map((item) => {
          const active = !moreActive && isActive(pathname, item);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} data-active={active} className={itemClass(active)}>
              <item.icon className="size-[21px]" strokeWidth={active ? 2.1 : 1.7} />
              {item.label}
            </Link>
          );
        })}
        <button type="button" onClick={onMore} data-active={moreActive} className={itemClass(moreActive)}>
          <MenuIcon className="size-[21px]" strokeWidth={moreActive ? 2.1 : 1.7} />
          Mehr
        </button>
      </div>
    </nav>
  );
}

function UserMenu() {
  const { me, logout } = useSession();
  const router = useRouter();
  if (!me) return null;
  return (
    <Menu
      side="top"
      align="start"
      className="w-full"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors hover:bg-fg/[0.04]">
          <Avatar name={me.displayName} src={me.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{me.displayName}</span>
            <span className="block truncate font-mono text-[11px] text-muted">{me.email}</span>
          </span>
        </button>
      )}
      items={[
        { label: "Einstellungen", onSelect: () => router.push("/app/settings") },
        { type: "separator" },
        { label: "Abmelden", icon: <LogOut />, danger: true, onSelect: () => void logout() },
      ]}
    />
  );
}

function MobileMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { me, band, logout } = useSession();
  const { secondary } = navFor(band?.role);
  const mode = useThemeMode();
  return (
    <Dialog open={open} onClose={onClose} title="Mehr" size="sm">
      <div className="space-y-5">
        <BandSwitcher />
        <nav className="stagger grid grid-cols-2 gap-2">
          {secondary.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex flex-col gap-3 rounded-[14px] border p-3.5 text-[14px] font-medium transition-colors",
                  active ? "border-fg/20 bg-surface-2" : "border-border hover:bg-surface-2",
                )}
              >
                <span className="flex items-center justify-between">
                  <item.icon className="size-5 text-muted" strokeWidth={1.8} />
                  {active ? <span className="led" /> : null}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center justify-between rounded-[14px] border border-border px-3 py-2">
          <span className="text-sm font-medium">Darstellung</span>
          <div className="flex gap-1 rounded-full bg-fg/[0.05] p-[3px]">
            {(["system", "light", "dark"] as ThemeMode[]).map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setThemeMode(entry)}
                className={cn("inline-flex size-8 items-center justify-center rounded-full transition-colors [&_svg]:size-4", mode === entry ? "bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.1)] dark:bg-surface-3" : "text-muted")}
                aria-label={THEME_LABEL[entry]}
              >
                {THEME_ICON[entry]}
              </button>
            ))}
          </div>
        </div>
        {me ? (
          <div className="flex items-center gap-3 rounded-[14px] border border-border px-3 py-2.5">
            <Avatar name={me.displayName} src={me.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{me.displayName}</span>
              <span className="block truncate font-mono text-[11px] text-muted">{me.email}</span>
            </span>
            <button type="button" onClick={() => void logout()} className="rounded-full p-2 text-danger hover:bg-danger-soft" aria-label="Abmelden">
              <LogOut className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <BrandMark className="size-10 animate-pulse rounded-xl" />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, band, isLoading } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);
  const conflicts = useSWR<{ open: number; conflicts: Array<{ id: string; docTitle: string }> }>(
    me && !me.emailVerificationRequired ? "/api/merge-conflicts" : null,
    { refreshInterval: 60_000 },
  );
  const refreshConflicts = conflicts.mutate;
  const outboxCount = useOutboxCount();
  useOutboxSync();
  useEffect(() => {
    const onConflict = () => void refreshConflicts();
    window.addEventListener(CONFLICT_EVENT, onConflict);
    return () => window.removeEventListener(CONFLICT_EVENT, onConflict);
  }, [refreshConflicts]);

  // Stage mode is a distraction-free full-screen view.
  if (pathname.endsWith("/stage")) {
    return <>{children}</>;
  }

  if (isLoading && !me) {
    return <ShellSkeleton />;
  }

  if (me?.emailVerificationRequired) {
    return <VerifyEmailGate />;
  }

  const { primary, secondary } = navFor(band?.role);
  const moreActive = secondary.some((item) => isActive(pathname, item));
  const section = [...primary, ...secondary].find((item) => isActive(pathname, item));

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-bg lg:flex">
        <Link href="/app" className="flex h-16 items-center gap-2.5 px-5" aria-label="Bandival – Übersicht">
          <BrandMark className="size-7 rounded-[8px]" />
          <span className="type-display text-[21px]">Bandival</span>
        </Link>
        <div className="px-3 pb-3">
          <BandSwitcher />
        </div>
        <SidebarNav primary={primary} secondary={secondary} pathname={pathname} />
        <div className="border-t border-border p-3">
          <UserMenu />
        </div>
      </aside>

      {/* Top bar */}
      <header className="scroll-edge pt-safe sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:h-16 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <Link href="/app" aria-label="Übersicht" className="shrink-0">
              <BrandMark className="size-8 rounded-[9px]" />
            </Link>
            <BandSwitcher compact />
          </div>
          <div className="type-eyebrow hidden min-w-0 flex-1 items-center gap-2 truncate text-muted lg:flex">
            <span className="truncate">{band?.name}</span>
            {section ? <><span className="text-subtle">/</span><span className="text-fg">{section.label}</span></> : null}
          </div>
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-9 w-60 items-center gap-2.5 rounded-full border border-border bg-surface px-3.5 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-fg lg:inline-flex"
          >
            <Search className="size-[15px]" />
            <span className="flex-1 text-left">Suchen …</span>
            <Kbd>⌘K</Kbd>
          </button>
          <button
            type="button"
            onClick={openCommandPalette}
            className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-fg/[0.06] hover:text-fg lg:hidden"
            aria-label="Suchen"
          >
            <Search className="size-[18px]" />
          </button>
          {outboxCount > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-soft px-2.5 py-1 font-mono text-[11px] text-warning [animation:pop-in_260ms_var(--ease-out)]"
              title="Änderungen ohne Verbindung – werden automatisch synchronisiert und zusammengeführt"
            >
              <CloudOff className="size-3.5" />{outboxCount}<span className="hidden sm:inline"> offline</span>
            </span>
          ) : null}
          <div className="hidden lg:block">
            <ThemeButton />
          </div>
          <NotificationsButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(9rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-10 lg:px-10 lg:pb-28">
        {(conflicts.data?.open ?? 0) > 0 && !pathname.startsWith("/app/conflicts") ? (
          <Link
            href={conflicts.data?.open === 1 ? `/app/conflicts/${conflicts.data.conflicts[0].id}` : "/app/conflicts"}
            className="mb-6 flex items-center gap-3 rounded-[14px] border border-danger/30 bg-danger-soft px-4 py-3 text-sm transition-colors hover:border-danger/50 [animation:rise-in_500ms_var(--ease-out)]"
          >
            <GitMerge className="size-4 shrink-0 text-danger" />
            <span className="min-w-0 flex-1 truncate">
              <strong className="font-semibold">{conflicts.data?.open === 1 ? "Ein Merge-Konflikt" : `${conflicts.data?.open} Merge-Konflikte`}</strong>
              <span className="text-muted"> warten auf deine Entscheidung{conflicts.data?.open === 1 ? ` – ${conflicts.data.conflicts[0].docTitle}` : ""}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-medium">Lösen <ArrowRight className="size-4" /></span>
          </Link>
        ) : null}
        <div key={pathname} className="page-enter">
          {me && !band ? <NoBand /> : children}
        </div>
      </main>

      <MiniPlayer />

      <MobileDock primary={primary} pathname={pathname} moreActive={moreActive} onMore={() => setMoreOpen(true)} />

      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <CommandPalette />
      <Suspense>
        <InviteHandler />
      </Suspense>
    </div>
  );
}
