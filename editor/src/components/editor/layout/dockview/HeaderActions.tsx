import React from 'react';
import { Database } from 'lucide-react';

/** Tileset panel header: tilesets are imported, renamed and organised in the Database; here you only pick them. */
export function TilesetsActions() {
  return (
    <div className="flex items-center px-2">
      <a
        href="#/database?table=tilesets"
        className="flex items-center gap-1 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent px-2 py-1.5 rounded-md transition-colors"
        title="Import, rename and organise tilesets in the Database"
      >
        <Database className="w-3.5 h-3.5" /> Manage
      </a>
    </div>
  );
}

export const DefaultHeaderActions = (props: any) => {
  const panelId = props.group?.activePanel?.id || props.panel?.id;
  if (panelId === 'tilesets') return <TilesetsActions />;
  return null;
};
