import React, { useMemo } from 'react';
import { DockviewReact } from 'dockview-react';
import 'dockview/dist/styles/dockview.css';
import './DockviewTheme.css';

import { EditorContext, useEditorContext } from './EditorContext';
import { dockviewComponents } from './dockview/PanelWrappers';
import { DefaultHeaderActions } from './dockview/HeaderActions';
import { useDockviewLayout } from './dockview/useDockviewLayout';

export function EditorDockview() {
  const parentCtx = useEditorContext();
  const { onReady, openPanels, openPanel, closePanel, togglePanel, resetLayout, isPanelOpen } = useDockviewLayout();

  const contextValue = useMemo(() => ({
    ...parentCtx,
    openPanels,
    openPanel,
    closePanel,
    togglePanel,
    resetLayout,
    isPanelOpen,
  }), [parentCtx, openPanels, openPanel, closePanel, togglePanel, resetLayout, isPanelOpen]);

  return (
    <EditorContext.Provider value={contextValue}>
      <div className="flex-1 w-full h-full overflow-hidden">
        <DockviewReact
          components={dockviewComponents}
          onReady={onReady}
          className="dockview-theme-elementals"
          defaultTabComponent={undefined}
          rightHeaderActionsComponent={DefaultHeaderActions}
        />
      </div>
    </EditorContext.Provider>
  );
}
