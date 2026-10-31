import React, { useMemo } from 'react';
import { DockviewReact, DockviewDefaultTab } from 'dockview-react';
import { IDockviewPanelHeaderProps } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import './DockviewTheme.css';

import { EditorExtensionProvider, useEditorSelector, type EditorContextValue } from './EditorContext';
import { dockviewComponents } from './dockview/PanelWrappers';
import { DefaultHeaderActions } from './dockview/HeaderActions';
import { useDockviewLayout } from './dockview/useDockviewLayout';
import { isMapPanelId } from './dockview/types';
import { EditorTopToolbar } from './EditorTopToolbar';

const TabHeaderComponent = (props: IDockviewPanelHeaderProps) => {
  const isMap = isMapPanelId(props.api.id);
  return <DockviewDefaultTab {...props} hideClose={!isMap} />;
};

const selectDockInputs = (c: EditorContextValue) => ({
  maps: c.maps,
  activeMap: c.activeMap,
  onSelectMap: c.onSelectMap,
  onClearActiveMap: c.onClearActiveMap,
  entityFocus: !!c.selectedEntityId,
});

export function EditorDockview() {
  const parentCtx = useEditorSelector(selectDockInputs);
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
    entityFocus: parentCtx.entityFocus,
  });

  const layoutValue = useMemo(
    () => ({
      openPanels,
      openPanel,
      closePanel,
      togglePanel,
      resetLayout,
      openMapTab,
      closeMapTab,
      isPanelOpen,
    }),
    [openPanels, openPanel, closePanel, togglePanel, resetLayout, openMapTab, closeMapTab, isPanelOpen]
  );

  return (
    <EditorExtensionProvider extension={layoutValue}>
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
    </EditorExtensionProvider>
  );
}


