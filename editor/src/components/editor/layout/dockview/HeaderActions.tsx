import React from 'react';
import { Plus, Database } from 'lucide-react';
import { useEditorSelector, type EditorContextValue } from '../EditorContext';

const selectTilesetActions = (c: EditorContextValue) => ({
  handlePickFile: c.handlePickFile,
});

/** Tileset panel header: add a new tileset; renaming and organising them lives in the Database. */
export function TilesetsActions() {
  const ctx = useEditorSelector(selectTilesetActions);
  return (
    <div className="flex items-center space-x-1 px-2">
      <a
        href="#/database?table=tilesets"
        className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground transition-colors"
        title="Rename, move and organise tilesets in the Database"
        aria-label="Manage tilesets in the Database"
      >
        <Database className="w-4 h-4" />
      </a>
      <button
        onClick={() => ctx.handlePickFile(null)}
        className="flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity shadow-sm"
      >
        <Plus className="w-3.5 h-3.5" /> Add
      </button>
    </div>
  );
}

export const DefaultHeaderActions = (props: any) => {
  const panelId = props.group?.activePanel?.id || props.panel?.id;
  if (panelId === 'tilesets') return <TilesetsActions />;
  return null;
};
