"use client";

import { ChordProParser, HtmlDivFormatter } from "chordsheetjs";
import { ReactNode, useEffect, useRef, useState } from "react";

type DiscussionPost = {
  id: string;
  createdAt: string;
  body: string;
  createdBy?: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
};

type DiscussionThread = {
  id: string;
  title: string;
  createdAt?: string;
  createdBy?: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  posts: DiscussionPost[];
};

function sanitizeChordHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export function CreateModal(props: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  children: ReactNode;
}) {
  const { title, isOpen, onClose, onConfirm, confirmLabel, children } = props;
  if (!isOpen) {
    return null;
  }

  return (
    <div className="create-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="create-modal">
        <h3>{title}</h3>
        <div className="create-modal-body">{children}</div>
        <div className="create-modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Abbrechen</button>
          <button type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function ThreadCard({
  thread,
  onAddPost,
}: {
  thread: DiscussionThread;
  onAddPost: (threadId: string, body: string) => Promise<void>;
}) {
  const [reply, setReply] = useState<string>("");
  const fallbackAuthor = "Bandmitglied";
  const starterName = thread.createdBy?.displayName ?? thread.createdBy?.email ?? thread.posts[0]?.createdBy?.displayName ?? thread.posts[0]?.createdBy?.email ?? fallbackAuthor;
  const starterInitial = starterName.slice(0, 1).toUpperCase();

  return (
    <article className="thread-card">
      <h4>{thread.title}</h4>
      <p style={{ margin: "0 0 0.45rem", color: "var(--muted)", fontSize: "0.86rem" }}>
        Gestartet: {thread.createdAt ? new Date(thread.createdAt).toLocaleString("de-DE") : "unbekannt"} | Autor: {starterName}
      </p>
      <ul>
        {thread.posts.map((post) => (
          <li key={post.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: "0.45rem", alignItems: "start", listStyle: "none", marginBottom: "0.5rem" }}>
            {post.createdBy?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.createdBy.avatarUrl} alt={post.createdBy.displayName ?? post.createdBy.email} className="settings-avatar" style={{ width: "28px", height: "28px" }} />
            ) : (
              <span className="settings-avatar settings-avatar-fallback" style={{ width: "28px", height: "28px", fontSize: "0.72rem" }}>{(post.createdBy?.displayName ?? post.createdBy?.email ?? starterInitial).slice(0, 1).toUpperCase()}</span>
            )}
            <span>
              <strong style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)" }}>{post.createdBy?.displayName ?? post.createdBy?.email ?? fallbackAuthor} | {new Date(post.createdAt).toLocaleString("de-DE")}</strong>
              {post.body}
            </span>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onAddPost(thread.id, reply);
          setReply("");
        }}
      >
        <input
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Antwort schreiben"
        />
        <button type="submit">Senden</button>
      </form>
    </article>
  );
}

export function ChordRender({
  chordProText,
  instrumentLabel,
  lyricsText,
}: {
  chordProText: string;
  instrumentLabel?: string;
  lyricsText?: string;
}) {
  if (!chordProText.trim() && !lyricsText?.trim()) {
    return <p>Keine Akkorde vorhanden.</p>;
  }

  let chordHtml: string | null = null;
  let failed = false;

  if (chordProText.trim()) {
    try {
      const parser = new ChordProParser();
      const song = parser.parse(chordProText);
      const formatter = new HtmlDivFormatter();
      chordHtml = sanitizeChordHtml(formatter.format(song));
    } catch {
      failed = true;
    }
  }

  if (failed) {
    return <p>Akkorde konnten nicht gerendert werden. Bitte ChordPro Syntax pruefen.</p>;
  }

  return (
    <div className="chord-render-wrap">
      {instrumentLabel ? <p className="chord-render-label">Arrangement: {instrumentLabel}</p> : null}
      {chordHtml ? <div className="chord-render" dangerouslySetInnerHTML={{ __html: chordHtml }} /> : null}
      {lyricsText?.trim() ? (
        <pre className="lyrics-pane">{lyricsText}</pre>
      ) : null}
    </div>
  );
}

export function SheetRender({ musicXmlUrl }: { musicXmlUrl: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isCancelled = false;

    async function render() {
      if (!musicXmlUrl || !containerRef.current) {
        return;
      }

      try {
        const [osmdModule, xmlRes] = await Promise.all([
          import("opensheetmusicdisplay"),
          fetch(musicXmlUrl),
        ]);

        const xmlContent = await xmlRes.text();
        const osmd = new osmdModule.OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          drawingParameters: "compact",
        });
        await osmd.load(xmlContent);
        if (!isCancelled) {
          osmd.render();
          setError("");
        }
      } catch {
        if (!isCancelled) {
          setError("Notenblatt konnte nicht gerendert werden.");
        }
      }
    }

    void render();
    return () => {
      isCancelled = true;
    };
  }, [musicXmlUrl]);

  if (!musicXmlUrl) {
    return <p>Noch kein MusicXML Notenblatt vorhanden.</p>;
  }

  return (
    <div>
      {error ? <p>{error}</p> : null}
      <div ref={containerRef} className="sheet-render" />
    </div>
  );
}
