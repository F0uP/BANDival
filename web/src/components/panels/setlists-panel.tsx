import { ReactNode } from "react";

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
  canCreateSetlists: boolean;
  isStageMode: boolean;
  searchQuery: string;
  onOpenCreateSetlist: () => void;
  onSelectSetlist: (setlistId: string) => void;
  onOpenSetlistPage: (setlistId: string) => void;
  onCopySetlist: (setlistId: string) => void;
  onDeleteSetlist: (setlistId: string) => void;
  onSelectSetlistSong: (songId: string) => void;
  onExportPdf: (setlistId: string) => void;
  onToggleStage: () => void;
}) {
  const {
    filteredSetlists,
    canCreateSetlists,
    isStageMode,
    searchQuery,
    onOpenCreateSetlist,
    onSelectSetlist,
    onOpenSetlistPage,
    onCopySetlist,
    onDeleteSetlist,
    onSelectSetlistSong,
    onExportPdf,
    onToggleStage,
  } = props;

  function highlight(text: string): ReactNode {
    const query = searchQuery.trim();
    if (!query) {
      return text;
    }

    const normalized = text.toLowerCase();
    const idx = normalized.indexOf(query.toLowerCase());
    if (idx < 0) {
      return text;
    }

    const end = idx + query.length;
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, end)}</mark>
        {text.slice(end)}
      </>
    );
  }

  return (
    <>
      <div className="quick-actions">
        <button type="button" onClick={onOpenCreateSetlist} disabled={!canCreateSetlists} title={canCreateSetlists ? undefined : "Keine Berechtigung"}>
          Neue Setlist
        </button>
      </div>
      <ul className="stagger-in">
        {filteredSetlists.map((setlist) => (
          <li key={setlist.id}>
            <div className="setlist-item">
              <button type="button" className="setlist-title" onClick={() => onSelectSetlist(setlist.id)}>
                {highlight(setlist.name)}
              </button>
              <div className="upload-queue-actions">
                <button type="button" className="ghost" onClick={() => onOpenSetlistPage(setlist.id)}>
                  Oeffnen
                </button>
                <button type="button" className="ghost" onClick={() => onCopySetlist(setlist.id)}>
                  Kopieren
                </button>
                <button type="button" className="ghost" onClick={() => onExportPdf(setlist.id)}>
                  PDF
                </button>
                <button type="button" className="ghost" onClick={() => onDeleteSetlist(setlist.id)}>
                  Loeschen
                </button>
              </div>
            </div>
            <div className="setlist-songs">
              {setlist.items.map((item) => (
                <button key={item.id} type="button" onClick={() => onSelectSetlistSong(item.song.id)}>
                  {item.position}. {highlight(item.song.title)}
                </button>
              ))}

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
