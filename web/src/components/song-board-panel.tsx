"use client";

import { BoardTask, BoardTaskStatus } from "@/components/song-workspace-types";

export function SongBoardPanel(props: {
  newSongBoardTaskTitle: string;
  setNewSongBoardTaskTitle: (value: string) => void;
  addSongBoardTask: () => Promise<void>;
  songBoardColumns: { open: BoardTask[]; inProgress: BoardTask[]; done: BoardTask[] };
  moveSongBoardTask: (taskId: string, status: BoardTaskStatus) => Promise<void>;
  deleteSongBoardTask: (taskId: string) => Promise<void>;
}) {
  const {
    newSongBoardTaskTitle,
    setNewSongBoardTaskTitle,
    addSongBoardTask,
    songBoardColumns,
    moveSongBoardTask,
    deleteSongBoardTask,
  } = props;

  return (
    <section className="box">
      <h3>Song Aufgabenboard</h3>
      <div className="thread-form">
        <input
          value={newSongBoardTaskTitle}
          onChange={(event) => setNewSongBoardTaskTitle(event.target.value)}
          placeholder="Neue Song-Aufgabe"
        />
        <button type="button" onClick={() => void addSongBoardTask()}>Aufgabe erstellen</button>
      </div>
      <div className="kanban-board" style={{ marginTop: "0.6rem" }}>
        <div className="kanban-col">
          <h5>Offen</h5>
          {songBoardColumns.open.map((task) => (
            <div key={task.id} className="kanban-task">
              <strong>{task.title}</strong>
              <div className="upload-queue-actions">
                <button type="button" className="ghost" onClick={() => void moveSongBoardTask(task.id, "in_progress")}>Start</button>
                <button type="button" className="ghost" onClick={() => void deleteSongBoardTask(task.id)}>Loeschen</button>
              </div>
            </div>
          ))}
        </div>
        <div className="kanban-col">
          <h5>In Arbeit</h5>
          {songBoardColumns.inProgress.map((task) => (
            <div key={task.id} className="kanban-task">
              <strong>{task.title}</strong>
              <div className="upload-queue-actions">
                <button type="button" className="ghost" onClick={() => void moveSongBoardTask(task.id, "done")}>Fertig</button>
                <button type="button" className="ghost" onClick={() => void moveSongBoardTask(task.id, "open")}>Zurueck</button>
              </div>
            </div>
          ))}
        </div>
        <div className="kanban-col">
          <h5>Fertig</h5>
          {songBoardColumns.done.map((task) => (
            <div key={task.id} className="kanban-task">
              <strong>{task.title}</strong>
              <div className="upload-queue-actions">
                <button type="button" className="ghost" onClick={() => void moveSongBoardTask(task.id, "open")}>Wieder oeffnen</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
