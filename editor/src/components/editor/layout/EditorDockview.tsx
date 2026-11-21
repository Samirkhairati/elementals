import React, { useCallback, useMemo } from 'react';
import { DockviewReact, DockviewDefaultTab } from 'dockview-react';
import { IDockviewPanelHeaderProps } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import './DockviewTheme.css';

import { EditorExtensionProvider, useEditorSelector, type EditorContextValue } from './EditorContext';
import { dockviewComponents } from './dockview/PanelWrappers';
import { DefaultHeaderActions } from './dockview/HeaderActions';
import { useDockviewLayout } from './dockview/useDockviewLayout';
import { isMapPanelId } from './dockview/types';
import { sceneIndex } from '@/lib/sceneIndex';
import { useLookView } from '@/lib/look/lookView';
import { EditorTopToolbar } from './EditorTopToolbar';
import { usePicturePickerOpen } from '@/lib/picturePickerEvent';

const TabHeaderComponent = (props: IDockviewPanelHeaderProps) => {
  const isMap = isMapPanelId(props.api.id);
  return <DockviewDefaultTab {...props} hideClose={!isMap} />;
};

const selectDockInputs = (c: EditorContextValue) => {
  const primary = c.selectionView.primaryId ? c.activeMap?.nodes && sceneIndex(c.activeMap.nodes).byId.get(c.selectionView.primaryId)?.node : undefined
  return {
    maps: c.maps,
    activeMap: c.activeMap,
    onSelectMap: c.onSelectMap,
    onClearActiveMap: c.onClearActiveMap,
    openLook: c.openLook,
    // The Properties panel alone: an entity (its components) or a Look (the look editor).
    entityFocus: !!c.selectedEntityId || primary?.type === 'look',
    nothingSelected: !primary,
    // The Graphics panel: only while a sprite is picked or one is being placed (or chosen, below).
    imageFocus: primary?.type === 'picture' || !!c.pendingImage,
    collisionFocus: c.activeLayerType === 'collision',
  };
};

export function EditorDockview() {
  const parentCtx = useEditorSelector(selectDockInputs);
  const pickerOpen = usePicturePickerOpen();
  // The map's look is open (its Look row in the Scene panel) while no node is selected.
  const mapLookOpen = useLookView().pinned?.kind === 'map' && parentCtx.nothingSelected;
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
    entityFocus: parentCtx.entityFocus || mapLookOpen,
    imageFocus: parentCtx.imageFocus || pickerOpen,
    collisionFocus: parentCtx.collisionFocus,
  });

  const { openLook } = parentCtx;
  // The Look panel is the Properties panel showing a Look node: "open the Look panel" selects the selection's Look.
  const openPanelOrLook = useCallback((id: string) => (id === 'look' ? openLook() : openPanel(id)), [openLook, openPanel]);
  const layoutValue = useMemo(
    () => ({
      openPanels,
      openPanel: openPanelOrLook,
      closePanel,
      togglePanel,
      resetLayout,
      openMapTab,
      closeMapTab,
      isPanelOpen,
    }),
    [openPanels, openPanelOrLook, closePanel, togglePanel, resetLayout, openMapTab, closeMapTab, isPanelOpen]
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


