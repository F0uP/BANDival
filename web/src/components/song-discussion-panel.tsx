"use client";

import { FormEvent } from "react";
import { ThreadCard } from "@/components/song-detail-widgets";
import { Song } from "@/components/song-workspace-types";

export function SongDiscussionPanel(props: {
  selectedSong: Song;
  threadTitle: string;
  setThreadTitle: (value: string) => void;
  threadBody: string;
  setThreadBody: (value: string) => void;
  createThread: (event: FormEvent) => Promise<void>;
  addPost: (threadId: string, body: string) => Promise<void>;
}) {
  const {
    selectedSong,
    threadTitle,
    setThreadTitle,
    threadBody,
    setThreadBody,
    createThread,
    addPost,
  } = props;

  return (
    <section className="box discussion-box shell-comments">
      <h3>Diskussionen und Themen</h3>
      <form className="thread-form" onSubmit={(event) => void createThread(event)}>
        <input
          value={threadTitle}
          onChange={(event) => setThreadTitle(event.target.value)}
          placeholder="Thema"
        />
        <textarea
          value={threadBody}
          onChange={(event) => setThreadBody(event.target.value)}
          placeholder="Beschreibung"
          rows={3}
        />
        <button type="submit">Thema erstellen</button>
      </form>

      <div className="thread-list">
        {(selectedSong.threads ?? []).map((thread) => (
          <ThreadCard key={thread.id} thread={thread} onAddPost={addPost} />
        ))}
      </div>
    </section>
  );
}
