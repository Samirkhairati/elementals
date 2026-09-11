import React from 'react';
import { Plus, FolderPlus } from 'lucide-react';
import { useEditorContext } from '../EditorContext';

export function TilesetsActions() {
  const ctx = useEditorContext();
  return (
    <div className="flex items-center space-x-1 px-2">
      <button
        onClick={() => ctx.handleOpenCreateFolderDialog(null)}
        className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground transition-colors"
        title="New Folder"
      >
        <FolderPlus className="w-4 h-4" />
      </button>
      <button
        onClick={() => ctx.handlePickFile(null)}
        className="flex items-center gap-1 text-xs font-medium font-mono bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity shadow-sm"
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

