import { FormEvent } from "react";

type Setlist = {
  id: string;
  name: string;
  items: Array<{
    id: string;
    position: number;
    song: {
      id: string;
      title: string;
    };
  }>;
};

export function SetlistsPanel(props: {
  filteredSetlists: Setlist[];
  newSetlistName: string;
  canCreateSetlists: boolean;
  isEditMode: boolean;
  isStageMode: boolean;
  onCreateSetlist: (event: FormEvent) => void;
  onChangeSetlistName: (value: string) => void;
  onSelectSetlist: (setlistId: string) => void;
  onCopySetlist: (setlistId: string) => void;
  onSelectSetlistSong: (songId: string) => void;
  onExportPdf: (setlistId: string) => void;
  onToggleStage: () => void;
}) {
  const {
    filteredSetlists,
    newSetlistName,
    canCreateSetlists,
    isEditMode,
    isStageMode,
    onCreateSetlist,
    onChangeSetlistName,
    onSelectSetlist,
    onCopySetlist,
    onSelectSetlistSong,
    onExportPdf,
    onToggleStage,
  } = props;

  return (
    <>
      <form className="quick-form" onSubmit={onCreateSetlist}>
        <input
          value={newSetlistName}
          onChange={(event) => onChangeSetlistName(event.target.value)}
          placeholder="Neue Setlist"
          disabled={!canCreateSetlists}
        />
        <button type="submit" disabled={!canCreateSetlists} title={canCreateSetlists ? undefined : "Keine Berechtigung"}>
          + Setlist
        </button>
      </form>
      <ul>
        {filteredSetlists.map((setlist) => (
          <li key={setlist.id}>
            <div className="setlist-item">
              <button type="button" className="setlist-title" onClick={() => onSelectSetlist(setlist.id)}>
                {setlist.name}
              </button>
              <button type="button" className="ghost" onClick={() => onCopySetlist(setlist.id)} disabled={!isEditMode}>
                Kopieren
              </button>
            </div>
            <div className="setlist-songs">
              {setlist.items.map((item) => (
                <button key={item.id} type="button" onClick={() => onSelectSetlistSong(item.song.id)}>
                  {item.position}. {item.song.title}
                </button>
              ))}

              <button type="button" onClick={() => onExportPdf(setlist.id)}>
                PDF Export
              </button>

              <button type="button" className="ghost" onClick={onToggleStage}>
                {isStageMode ? "Stage aus" : "Stage-Modus"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
