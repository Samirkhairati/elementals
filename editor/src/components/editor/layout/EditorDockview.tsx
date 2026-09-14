import React, { useMemo } from 'react';
import { DockviewReact, DockviewDefaultTab } from 'dockview-react';
import { IDockviewPanelHeaderProps } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import './DockviewTheme.css';

import { EditorContext, useEditorContext } from './EditorContext';
import { dockviewComponents } from './dockview/PanelWrappers';
import { DefaultHeaderActions } from './dockview/HeaderActions';
import { useDockviewLayout } from './dockview/useDockviewLayout';
import { isMapPanelId } from './dockview/types';
import { EditorTopToolbar } from './EditorTopToolbar';

const TabHeaderComponent = (props: IDockviewPanelHeaderProps) => {
  const isMap = isMapPanelId(props.api.id);
  return <DockviewDefaultTab {...props} hideClose={!isMap} />;
};

export function EditorDockview() {
  const parentCtx = useEditorContext();
  const {
    onReady,
    openPanels,
    openPanel,
    closePanel,
    togglePanel,
    resetLayout,
    openMapTab,
    closeMapTab,
    isPanelOpen,
  } = useDockviewLayout({
    maps: parentCtx.maps,
    activeMap: parentCtx.activeMap,
    onSelectMap: parentCtx.onSelectMap,
    onClearActiveMap: parentCtx.onClearActiveMap,
  });

  const contextValue = useMemo(
    () => ({
      ...parentCtx,
      openPanels,
      openPanel,
      closePanel,
      togglePanel,
      resetLayout,
      openMapTab,
      closeMapTab,
      isPanelOpen,
    }),
    [
      parentCtx,
      openPanels,
      openPanel,
      closePanel,
      togglePanel,
      resetLayout,
      openMapTab,
      closeMapTab,
      isPanelOpen,
    ]
  );

  return (
    <EditorContext.Provider value={contextValue}>
      <div className="flex flex-col flex-1 w-full h-full overflow-hidden">
        <EditorTopToolbar mode="map" />
        <div className="flex-1 w-full h-full overflow-hidden min-h-0">
          <DockviewReact
            components={dockviewComponents}
            onReady={onReady}
            className="dockview-theme-elementals"
            defaultTabComponent={TabHeaderComponent}
            rightHeaderActionsComponent={DefaultHeaderActions}
          />
        </div>
      </div>
    </EditorContext.Provider>
  );
}


