import React, { useRef, useState, useCallback, useEffect } from 'react';
import { DockviewApi, DockviewReadyEvent } from 'dockview-react';
import { PanelId } from './types';

export function useDockviewLayout() {
  const apiRef = useRef<DockviewApi | null>(null);
  const [openPanels, setOpenPanels] = useState<string[]>([
    'maps', 'layers', 'properties', 'tilesets', 'preview', 'activeSelection', 'canvas'
  ]);

  const updateOpenPanels = useCallback(() => {
    if (!apiRef.current) return;
    const ids = apiRef.current.panels.map((p) => p.id);
    setOpenPanels(ids);
  }, []);

  const buildDefaultLayout = useCallback((api: DockviewApi) => {
    // Add Center Canvas
    const canvasPanel = api.addPanel({
      id: 'canvas',
      component: 'canvas',
      title: 'CANVAS',
    });
    canvasPanel.group.header.hidden = true;

    // Add Left Sidebar panels
    const mapsPanel = api.addPanel({
      id: 'maps',
      component: 'maps',
      title: 'MAPS',
      position: { referencePanel: canvasPanel, direction: 'left' },
    });

    const layersPanel = api.addPanel({
      id: 'layers',
      component: 'layers',
      title: 'LAYERS',
      position: { referencePanel: mapsPanel, direction: 'below' },
    });

    const propsPanel = api.addPanel({
      id: 'properties',
      component: 'properties',
      title: 'PROPERTIES',
      position: { referencePanel: layersPanel, direction: 'below' },
    });

    // Add Right Sidebar panels
    const tilesetsPanel = api.addPanel({
      id: 'tilesets',
      component: 'tilesets',
      title: 'TILESET BROWSER',
      position: { referencePanel: canvasPanel, direction: 'right' },
    });

    const previewPanel = api.addPanel({
      id: 'preview',
      component: 'preview',
      title: 'TILESET',
      position: { referencePanel: tilesetsPanel, direction: 'below' },
    });

    const selectionPanel = api.addPanel({
      id: 'activeSelection',
      component: 'activeSelection',
      title: 'ACTIVE SELECTION',
      position: { referencePanel: previewPanel, direction: 'below' },
    });

    api.layout(api.width, api.height);
  }, []);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;

    buildDefaultLayout(api);

    api.onDidAddPanel(updateOpenPanels);
    api.onDidRemovePanel(updateOpenPanels);
    updateOpenPanels();
  }, [buildDefaultLayout, updateOpenPanels]);

  const openPanel = useCallback((id: PanelId | string) => {
    if (!apiRef.current) return;
    const api = apiRef.current;
    const existing = api.getPanel(id);
    if (existing) {
      existing.api.setActive();
      return;
    }

    const canvas = api.getPanel('canvas');

    switch (id) {
      case 'maps': {
        const ref = api.getPanel('layers') || api.getPanel('properties');
        if (ref) {
          api.addPanel({
            id: 'maps',
            component: 'maps',
            title: 'MAPS',
            position: { referencePanel: ref, direction: 'above' }
          });
        } else if (canvas) {
          api.addPanel({
            id: 'maps',
            component: 'maps',
            title: 'MAPS',
            position: { referencePanel: canvas, direction: 'left' }
          });
        } else {
          api.addPanel({ id: 'maps', component: 'maps', title: 'MAPS' });
        }
        break;
      }
      case 'layers': {
        const ref = api.getPanel('maps');
        const refBelow = api.getPanel('properties');
        if (ref) {
          api.addPanel({
            id: 'layers',
            component: 'layers',
            title: 'LAYERS',
            position: { referencePanel: ref, direction: 'below' }
          });
        } else if (refBelow) {
          api.addPanel({
            id: 'layers',
            component: 'layers',
            title: 'LAYERS',
            position: { referencePanel: refBelow, direction: 'above' }
          });
        } else if (canvas) {
          api.addPanel({
            id: 'layers',
            component: 'layers',
            title: 'LAYERS',
            position: { referencePanel: canvas, direction: 'left' }
          });
        } else {
          api.addPanel({ id: 'layers', component: 'layers', title: 'LAYERS' });
        }
        break;
      }
      case 'properties': {
        const ref = api.getPanel('layers') || api.getPanel('maps');
        if (ref) {
          api.addPanel({
            id: 'properties',
            component: 'properties',
            title: 'PROPERTIES',
            position: { referencePanel: ref, direction: 'below' }
          });
        } else if (canvas) {
          api.addPanel({
            id: 'properties',
            component: 'properties',
            title: 'PROPERTIES',
            position: { referencePanel: canvas, direction: 'left' }
          });
        } else {
          api.addPanel({ id: 'properties', component: 'properties', title: 'PROPERTIES' });
        }
        break;
      }
      case 'tilesets': {
        const refBelow = api.getPanel('preview') || api.getPanel('activeSelection');
        if (refBelow) {
          api.addPanel({
            id: 'tilesets',
            component: 'tilesets',
            title: 'TILESET BROWSER',
            position: { referencePanel: refBelow, direction: 'above' }
          });
        } else if (canvas) {
          api.addPanel({
            id: 'tilesets',
            component: 'tilesets',
            title: 'TILESET BROWSER',
            position: { referencePanel: canvas, direction: 'right' }
          });
        } else {
          api.addPanel({ id: 'tilesets', component: 'tilesets', title: 'TILESET BROWSER' });
        }
        break;
      }
      case 'preview': {
        const refAbove = api.getPanel('tilesets');
        const refBelow = api.getPanel('activeSelection');
        if (refAbove) {
          api.addPanel({
            id: 'preview',
            component: 'preview',
            title: 'TILESET',
            position: { referencePanel: refAbove, direction: 'below' }
          });
        } else if (refBelow) {
          api.addPanel({
            id: 'preview',
            component: 'preview',
            title: 'TILESET',
            position: { referencePanel: refBelow, direction: 'above' }
          });
        } else if (canvas) {
          api.addPanel({
            id: 'preview',
            component: 'preview',
            title: 'TILESET',
            position: { referencePanel: canvas, direction: 'right' }
          });
        } else {
          api.addPanel({ id: 'preview', component: 'preview', title: 'TILESET' });
        }
        break;
      }
      case 'activeSelection': {
        const refAbove = api.getPanel('preview') || api.getPanel('tilesets');
        if (refAbove) {
          api.addPanel({
            id: 'activeSelection',
            component: 'activeSelection',
            title: 'ACTIVE SELECTION',
            position: { referencePanel: refAbove, direction: 'below' }
          });
        } else if (canvas) {
          api.addPanel({
            id: 'activeSelection',
            component: 'activeSelection',
            title: 'ACTIVE SELECTION',
            position: { referencePanel: canvas, direction: 'right' }
          });
        } else {
          api.addPanel({ id: 'activeSelection', component: 'activeSelection', title: 'ACTIVE SELECTION' });
        }
        break;
      }
    }

    api.layout(api.width, api.height);
    updateOpenPanels();
  }, [updateOpenPanels]);

  const closePanel = useCallback((id: string) => {
    if (!apiRef.current) return;
    const panel = apiRef.current.getPanel(id);
    if (panel) {
      panel.api.close();
      updateOpenPanels();
    }
  }, [updateOpenPanels]);

  const togglePanel = useCallback((id: string) => {
    if (!apiRef.current) return;
    const panel = apiRef.current.getPanel(id);
    if (panel) {
      panel.api.close();
      updateOpenPanels();
    } else {
      openPanel(id);
    }
  }, [openPanel, updateOpenPanels]);

  const resetLayout = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.clear();
    buildDefaultLayout(apiRef.current);
    updateOpenPanels();
  }, [buildDefaultLayout, updateOpenPanels]);

  // IPC and Custom Window Events
  useEffect(() => {
    const unsubToggle = window.electronAPI?.onTogglePanel?.((panelId: string) => {
      togglePanel(panelId);
    });
    const unsubReset = window.electronAPI?.onResetLayout?.(() => {
      resetLayout();
    });

    const handleCustomToggle = (e: any) => {
      if (e.detail) togglePanel(e.detail);
    };
    const handleCustomReset = () => {
      resetLayout();
    };

    window.addEventListener('editor:toggle-panel', handleCustomToggle);
    window.addEventListener('editor:reset-layout', handleCustomReset);

    return () => {
      unsubToggle?.();
      unsubReset?.();
      window.removeEventListener('editor:toggle-panel', handleCustomToggle);
      window.removeEventListener('editor:reset-layout', handleCustomReset);
    };
  }, [togglePanel, resetLayout]);

  return {
    apiRef,
    openPanels,
    onReady,
    openPanel,
    closePanel,
    togglePanel,
    resetLayout,
    isPanelOpen: (id: string) => openPanels.includes(id),
  };
}
