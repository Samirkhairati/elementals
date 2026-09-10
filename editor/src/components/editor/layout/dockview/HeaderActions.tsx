import React from 'react';
import { Plus, FolderPlus } from 'lucide-react';
import { useEditorContext } from '../EditorContext';

export function MapsActions() {
  const ctx = useEditorContext();
  return (
    <div className="flex items-center space-x-1 px-2">
      <button
        onClick={() => {
          ctx.setCreateMapFolderName(`Folder ${ctx.mapFolders.length + 1}`);
          ctx.setCreateMapFolderDialog({ open: true, parentPath: null });
        }}
        className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground transition-colors"
        title="New Folder"
      >
        <FolderPlus className="w-4 h-4" />
      </button>
      <button
        onClick={() => {
          ctx.setCreateMapData({ name: '', width: 50, height: 50 });
          ctx.setCreateMapDialog({ open: true, parentPath: null });
        }}
        className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground transition-colors"
        title="New Map"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

export function LayersActions() {
  const ctx = useEditorContext();
  return (
    <div className="flex items-center space-x-1 px-2">
      <button
        onClick={() => {
          if (!ctx.activeMap) {
            alert('Please select a map first');
            return;
          }
          ctx.handleCreateLayer();
        }}
        className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground transition-colors"
        title="New Layer"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

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
  if (panelId === 'maps') return <MapsActions />;
  if (panelId === 'layers') return <LayersActions />;
  if (panelId === 'tilesets') return <TilesetsActions />;
  return null;
};
