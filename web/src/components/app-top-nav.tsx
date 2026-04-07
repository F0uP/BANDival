"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/app/songs", label: "Songs" },
  { href: "/app/setlists", label: "Setlists" },
  { href: "/app/calendar", label: "Calendar" },
  { href: "/app/people", label: "People" },
  { href: "/app/settings", label: "Settings" },
];

export function AppTopNav() {
  const pathname = usePathname();

  return (
    <nav className="app-top-nav" aria-label="App Navigation">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "app-top-nav-link active" : "app-top-nav-link"}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
