"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Mic, ListMusic, ListPlus, Moon, Music2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { SONG_STATUS_LABEL } from "@/lib/client/format";
import { useSetlists, useSongs } from "@/lib/client/hooks";
import { nextTheme, setThemeMode, THEME_LABEL, useThemeMode } from "@/lib/client/theme";
import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/display";
import { useSession } from "@/components/providers/session";
import { navFor } from "@/components/shell/nav";
import { t } from "@/lib/i18n";

type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
};

export const OPEN_PALETTE_EVENT = "bandival:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function CommandPalette() {
  const router = useRouter();
  const { bandId, band, can } = useSession();
  const role = band?.role;
  const isGuest = role === "guest";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const themeMode = useThemeMode();
  const songs = useSongs(open && !isGuest ? bandId : null);
  const setlists = useSetlists(open ? bandId : null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuery("");
        setCursor(0);
        setOpen((current) => !current);
      }
    };
    const onOpen = () => {
      setQuery("");
      setCursor(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      ...(can("songs.create") ? [{ id: "new-song", group: "Aktionen", label: t("Neuer Song"), icon: <Plus />, run: () => go("/app/songs?new=1") }] : []),
      ...(can("setlists.create") ? [{ id: "new-setlist", group: "Aktionen", label: t("Neue Setlist"), icon: <ListPlus />, run: () => go("/app/setlists?new=1") }] : []),
      ...(can("events.create") ? [{ id: "new-event", group: "Aktionen", label: t("Neuer Termin"), icon: <CalendarPlus />, run: () => go("/app/calendar?new=1") }] : []),
      ...(can("ideas.create") ? [{ id: "new-idea", group: "Aktionen", label: t("Idee aufnehmen"), icon: <Mic />, keywords: "idee riff aufnahme memo", run: () => go("/app/ideas?record=1") }] : []),
      {
        id: "theme",
        group: "Aktionen",
        label: `Darstellung: ${THEME_LABEL[nextTheme(themeMode)]}`,
        icon: <Moon />,
        keywords: "theme dark light hell dunkel",
        run: () => setThemeMode(nextTheme(themeMode)),
      },
      ...[...navFor(role).primary, ...navFor(role).secondary].map((item) => ({
        id: `nav-${item.href}`,
        group: "Seiten",
        label: item.label,
        icon: <item.icon />,
        run: () => go(item.href),
      })),
      ...(songs.data?.songs ?? []).map((song) => ({
        id: `song-${song.id}`,
        group: "Songs",
        label: song.title,
        hint: [song.album?.title, SONG_STATUS_LABEL[song.workflowStatus]].filter(Boolean).join(" · "),
        keywords: `${song.keySignature ?? ""} ${song.album?.title ?? ""}`,
        icon: <Music2 />,
        run: () => go(`/app/songs/${song.id}`),
      })),
      ...(setlists.data?.setlists ?? []).map((setlist) => ({
        id: `setlist-${setlist.id}`,
        group: "Setlists",
        label: setlist.name,
        hint: t("{count} Songs", { count: setlist.items.length }),
        keywords: setlist.items.map((item) => item.song.title).join(" "),
        icon: <ListMusic />,
        run: () => go(`/app/setlists/${setlist.id}`),
      })),
    ];
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs.data, setlists.data, themeMode, role]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) {
      return commands.filter((command) => command.group !== "Songs" && command.group !== "Setlists").concat(
        commands.filter((command) => command.group === "Songs").slice(0, 5),
      );
    }
    return commands
      .filter((command) => normalize(`${command.label} ${command.keywords ?? ""} ${command.hint ?? ""}`).includes(q))
      .slice(0, 40);
  }, [commands, query]);

  const active = Math.min(cursor, Math.max(0, filtered.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = "";

  return (
    <Dialog open={open} onClose={() => setOpen(false)} bare size="md" className="sm:mt-[-15vh]">
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((current) => Math.min(current + 1, filtered.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              filtered[active]?.run();
            }
          }}
          placeholder={t("Songs, Setlists, Seiten oder Aktionen suchen …")}
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
          aria-label={t("Suche")}
        />
        <Kbd>{t("Esc")}</Kbd>
      </div>
      <div ref={listRef} className="max-h-[60dvh] overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted">{t("Nichts gefunden für „{query}“.", { query })}</p>
        ) : (
          filtered.map((command, index) => {
            const header = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {header ? <div className="px-3 pb-1 pt-3 text-xs font-medium text-muted first:pt-1">{header}</div> : null}
                <button
                  type="button"
                  data-index={index}
                  onMouseMove={() => setCursor(index)}
                  onClick={command.run}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm [&_svg]:size-4",
                    index === active ? "bg-surface-2" : "",
                  )}
                >
                  <span className="text-muted">{command.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint ? <span className="truncate text-xs text-subtle">{command.hint}</span> : null}
                </button>
              </div>
            );
          })
        )}
      </div>
    </Dialog>
  );
}
