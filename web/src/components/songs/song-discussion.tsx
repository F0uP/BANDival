"use client";

import { useState } from "react";
import { MessageSquarePlus, Send } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { formatRelative } from "@/lib/client/format";
import type { DiscussionThread, SongDetail } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState } from "@/components/ui/display";
import { Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/feedback";

function Thread({ thread, onChanged }: { thread: DiscussionThread; onChanged: () => void }) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const toast = useToast();
  const hidden = expanded ? 0 : Math.max(0, thread.posts.length - 4);
  const visible = thread.posts.slice(hidden);

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/threads/${thread.id}/posts`, { body: reply.trim() });
      setReply("");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card padded={false}>
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h3 className="font-semibold">{thread.title}</h3>
        <p className="text-xs text-muted">
          {thread.createdBy?.displayName ?? "Bandmitglied"} · {formatRelative(thread.createdAt)} · {thread.posts.length} {thread.posts.length === 1 ? "Beitrag" : "Beiträge"}
        </p>
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {hidden > 0 ? (
          <button type="button" onClick={() => setExpanded(true)} className="text-xs font-medium text-accent-text hover:underline">
            {hidden} ältere {hidden === 1 ? "Antwort" : "Antworten"} anzeigen
          </button>
        ) : null}
        {visible.map((post) => (
          <div key={post.id} className="flex gap-3">
            <Avatar name={post.createdBy?.displayName ?? "?"} src={post.createdBy?.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{post.createdBy?.displayName ?? "Bandmitglied"}</span>
                <span className="text-xs text-subtle">{formatRelative(post.createdAt)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.body}</p>
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex items-end gap-2 border-t border-border px-4 py-3 sm:px-5"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          rows={1}
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Antworten …"
          className="min-h-10 resize-none"
        />
        <Button type="submit" variant="primary" size="icon" loading={sending} disabled={!reply.trim()} aria-label="Senden">
          {!sending ? <Send /> : null}
        </Button>
      </form>
    </Card>
  );
}

export function SongDiscussion({ song, onChanged }: { song: SongDetail; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const create = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/songs/${song.id}/threads`, { title: title.trim(), body: body.trim() });
      setTitle("");
      setBody("");
      setOpen(false);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {open ? (
        <Card>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void create(); }}>
            <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Thema, z. B. „Tempo im Refrain“" />
            <Textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Worum geht's?" />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!title.trim() || !body.trim()}>Thema starten</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button icon={<MessageSquarePlus />} onClick={() => setOpen(true)}>Neues Thema</Button>
      )}

      {song.threads.length === 0 && !open ? (
        <EmptyState
          icon={<MessageSquarePlus />}
          title="Noch keine Diskussion"
          description="Sammelt Feedback zu Arrangement, Tempo oder Text direkt am Song."
        />
      ) : (
        song.threads.map((thread) => <Thread key={thread.id} thread={thread} onChanged={onChanged} />)
      )}
    </div>
  );
}
