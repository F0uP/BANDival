"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { ExternalLink, Globe, ImageUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { api, errorMessage, uploadWithProgress } from "@/lib/client/api";
import { useAiStatus } from "@/lib/client/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { Field, Input, Switch, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { SocialIcon } from "@/components/public/social-icon";
import { normalizeUrl, SOCIAL_PLATFORMS, spotifyEmbed, type LinkKind, type PublicLink } from "@/lib/social-links";
import { t } from "@/lib/i18n";

type PublicSettings = {
  slug: string;
  publicEnabled: boolean;
  bio: string | null;
  genre: string | null;
  city: string | null;
  contactEmail: string | null;
  pressPhotoUrl: string | null;
  links: PublicLink[];
};

/** Public band page / electronic press kit at /b/<slug>. */
export function PublicPageSettings() {
  const { bandId, can } = useSession();
  const { data, mutate } = useSWR<{ public: PublicSettings }>(bandId ? `/api/bands/${bandId}/public` : null);
  const ai = useAiStatus();
  const [draft, setDraft] = useState<PublicSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const manage = can("public.manage");
  const value = draft ?? data?.public ?? null;
  if (!value || !bandId) return null;
  const set = (patch: Partial<PublicSettings>) => setDraft({ ...value, ...patch });
  const url = typeof window !== "undefined" ? `${window.location.origin}/b/${value.slug}` : `/b/${value.slug}`;

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.patch<{ public: PublicSettings }>(`/api/bands/${bandId}/public`, {
        publicEnabled: value.publicEnabled,
        bio: value.bio,
        genre: value.genre,
        city: value.city,
        contactEmail: value.contactEmail || null,
        links: value.links
          .map((link) => ({ ...link, label: link.label.trim(), url: normalizeUrl(link.url) }))
          .filter((link) => link.label && link.url),
        slug: value.slug,
      });
      await mutate(result, { revalidate: false });
      setDraft(null);
      toast.success(value.publicEnabled ? t("Bandseite ist online.") : t("Gespeichert."));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const linkOf = (kind: LinkKind) => value.links.find((link) => link.kind === kind);
  const linkUrl = (kind: LinkKind) => linkOf(kind)?.url ?? "";
  // One link per platform: typing replaces it, clearing the field removes it.
  const setLink = (kind: LinkKind, url: string, label: string) => {
    const others = value.links.filter((link) => link.kind !== kind);
    set({ links: url.trim() ? [...others, { kind, url, label: linkOf(kind)?.label || label }] : others });
  };
  const setLinkLabel = (kind: LinkKind, label: string) => set({ links: value.links.map((link) => (link.kind === kind ? { ...link, label } : link)) });
  const customLinks = value.links.map((link, index) => ({ link, index })).filter(({ link }) => link.kind === "custom");
  const playerEmbed = spotifyEmbed(normalizeUrl(linkUrl("player")));

  const writeBio = async () => {
    setWriting(true);
    try {
      const result = await api.post<{ bio: string }>("/api/ai/assist", { task: "bio", bandId, notes: value.bio ?? "" });
      set({ bio: result.bio });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setWriting(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      await uploadWithProgress(`/api/bands/${bandId}/public/photo`, form, () => undefined).promise;
      await mutate();
      setDraft(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader
        title={t("Öffentliche Bandseite")}
        icon={<Globe />}
        description={t("Pressekit mit Bio, Konzerten, Songs und Kontakt – ohne Login erreichbar. Songs gibst du einzeln frei („Auf der öffentlichen Bandseite zeigen“).")}
        action={value.publicEnabled && data?.public.publicEnabled ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent-text hover:underline">{t("Ansehen")} <ExternalLink className="size-3.5" /></a> : null}
      />
      <div className="space-y-4">
        <Switch checked={value.publicEnabled} disabled={!manage} onChange={(publicEnabled) => set({ publicEnabled })} label={t("Bandseite veröffentlichen")} description={url} />
        <Field label={t("Adresse")} hint={t("Kleinbuchstaben, Zahlen, Bindestriche")}>{(id) => <Input id={id} disabled={!manage} value={value.slug} onChange={(event) => set({ slug: event.target.value.toLowerCase() })} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("Genre")} optional>{(id) => <Input id={id} disabled={!manage} value={value.genre ?? ""} onChange={(event) => set({ genre: event.target.value })} placeholder={t("Indie-Rock")} />}</Field>
          <Field label={t("Stadt")} optional>{(id) => <Input id={id} disabled={!manage} value={value.city ?? ""} onChange={(event) => set({ city: event.target.value })} placeholder={t("Leipzig")} />}</Field>
        </div>
        <Field label={t("Bio")} optional>
          {(id) => (
            <div className="space-y-2">
              <Textarea id={id} rows={6} disabled={!manage} value={value.bio ?? ""} onChange={(event) => set({ bio: event.target.value })} placeholder={t("Wer seid ihr, wie klingt ihr, was kommt als Nächstes?")} />
              {ai.data?.enabled && manage ? (
                <Button size="sm" variant="ghost" icon={<Sparkles />} loading={writing} onClick={() => void writeBio()}>
                  {value.bio ? t("Mit KI überarbeiten") : t("Mit KI formulieren")}
                </Button>
              ) : null}
            </div>
          )}
        </Field>
        <Field label={t("Booking-Kontakt")} optional>{(id) => <Input id={id} type="email" disabled={!manage} value={value.contactEmail ?? ""} onChange={(event) => set({ contactEmail: event.target.value })} placeholder="booking@band.de" />}</Field>
        <div className="space-y-2.5">
          <p className="text-[13px] font-medium">{t("Social Media & Streaming")}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {SOCIAL_PLATFORMS.map((platform) => (
              <label
                key={platform.kind}
                className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface pl-3 transition-[border-color,box-shadow] focus-within:border-accent/70 focus-within:ring-[3px] focus-within:ring-accent/15"
              >
                <span className={linkUrl(platform.kind) ? "text-fg" : "text-subtle"}><SocialIcon kind={platform.kind} className="size-4" /></span>
                <input
                  className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none placeholder:text-subtle disabled:opacity-60"
                  disabled={!manage}
                  value={linkUrl(platform.kind)}
                  placeholder={platform.placeholder}
                  aria-label={platform.label}
                  onChange={(event) => setLink(platform.kind, event.target.value, platform.label)}
                />
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Field label={t("Merch-Shop")} optional hint={t("Erscheint als hervorgehobener Button oben auf eurer Seite.")}>
            {(id) => <Input id={id} disabled={!manage} value={linkUrl("merch")} placeholder="eure-band.bigcartel.com" onChange={(event) => setLink("merch", event.target.value, t("Merch-Shop"))} />}
          </Field>
          <Field label={t("Button-Text")}>
            {(id) => <Input id={id} disabled={!manage || !linkUrl("merch")} value={linkOf("merch")?.label ?? t("Merch-Shop")} onChange={(event) => setLinkLabel("merch", event.target.value)} />}
          </Field>
        </div>
        <Field
          label={t("Spotify-Player zum Probehören")}
          optional
          error={linkUrl("player") && !playerEmbed ? t("Bitte einen Link von open.spotify.com einfügen (Song, Album, Profil oder Playlist).") : undefined}
          hint={playerEmbed
            ? t(`✓ ${playerEmbed.label} erkannt – Besucher können direkt auf eurer Seite reinhören.`)
            : t("Ein Song, Album, euer Profil oder eine Playlist. Öffentliche Songs mit Spotify-Link lassen sich dort zusätzlich anspielen.")}
        >
          {(id) => <Input id={id} disabled={!manage} value={linkUrl("player")} placeholder={t("open.spotify.com/track/…")} onChange={(event) => setLink("player", event.target.value, t("Spotify-Player"))} />}
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium">{t("Weitere Links")}</p>
          <div className="space-y-2">
            {customLinks.map(({ link, index: position }) => (
              <div key={position} className="flex gap-2">
                <Input className="w-36" disabled={!manage} value={link.label} placeholder={t("Presse-Kit")} onChange={(event) => set({ links: value.links.map((entry, index) => (index === position ? { ...entry, label: event.target.value } : entry)) })} aria-label={t("Bezeichnung")} />
                <Input disabled={!manage} value={link.url} placeholder="https://…" onChange={(event) => set({ links: value.links.map((entry, index) => (index === position ? { ...entry, url: event.target.value } : entry)) })} aria-label="URL" />
                {manage ? <Button size="icon" variant="ghost" aria-label={t("Link entfernen")} onClick={() => set({ links: value.links.filter((_, index) => index !== position) })}><Trash2 /></Button> : null}
              </div>
            ))}
            {manage && customLinks.length < 8 ? <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => set({ links: [...value.links, { label: "", url: "", kind: "custom" }] })}>{t("Link")}</Button> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {value.pressPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated upload route
            <img src={value.pressPhotoUrl} alt={t("Pressefoto")} className="h-20 w-32 rounded-lg object-cover" />
          ) : null}
          {manage ? (
            <>
              <Button size="sm" icon={<ImageUp />} onClick={() => fileRef.current?.click()}>{value.pressPhotoUrl ? t("Foto ersetzen") : t("Pressefoto")}</Button>
              {value.pressPhotoUrl ? <Button size="sm" variant="ghost" onClick={async () => { await api.delete(`/api/bands/${bandId}/public/photo`); await mutate(); setDraft(null); }}>{t("Entfernen")}</Button> : null}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadPhoto(file);
                event.target.value = "";
              }} />
            </>
          ) : null}
        </div>
        {manage ? <div className="flex justify-end"><Button variant="primary" loading={saving} disabled={!draft} onClick={() => void save()}>{t("Speichern")}</Button></div> : null}
      </div>
    </Card>
  );
}
