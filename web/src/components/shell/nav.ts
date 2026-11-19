import { Activity, CalendarDays, Home, Lightbulb, ListMusic, Music2, PiggyBank, Route, Settings, Users, type LucideIcon } from "lucide-react";
import type { BandRole } from "@/lib/permissions";
import { translatable } from "@/lib/i18n";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; guest?: boolean };

export const PRIMARY_NAV: NavItem[] = translatable([
  { href: "/app", label: "Übersicht", icon: Home, exact: true },
  { href: "/app/songs", label: "Songs", icon: Music2 },
  { href: "/app/setlists", label: "Setlists", icon: ListMusic, guest: true },
  { href: "/app/calendar", label: "Kalender", icon: CalendarDays },
]);

export const SECONDARY_NAV: NavItem[] = translatable([
  { href: "/app/ideas", label: "Ideen", icon: Lightbulb },
  { href: "/app/tours", label: "Touren", icon: Route },
  { href: "/app/band", label: "Band", icon: Users },
  { href: "/app/finance", label: "Bandkasse", icon: PiggyBank },
  { href: "/app/activity", label: "Aktivität", icon: Activity },
  { href: "/app/settings", label: "Einstellungen", icon: Settings, guest: true },
]);

/** Guests (session musicians) only see the setlists shared with them. */
export function navFor(role: BandRole | null | undefined): { primary: NavItem[]; secondary: NavItem[] } {
  if (role === "guest") {
    return { primary: PRIMARY_NAV.filter((item) => item.guest), secondary: SECONDARY_NAV.filter((item) => item.guest) };
  }
  return { primary: PRIMARY_NAV, secondary: SECONDARY_NAV };
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
    || (item.href === "/app/songs" && pathname.startsWith("/app/albums"))
    || (item.href === "/app/calendar" && pathname.startsWith("/app/events"));
}
