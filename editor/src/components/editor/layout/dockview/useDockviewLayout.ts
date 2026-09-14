import React, { useRef, useState, useCallback, useEffect } from 'react';
import { DockviewApi, DockviewReadyEvent } from 'dockview-react';
import { PanelId, getMapPanelId, isMapPanelId, parseMapPanelId } from './types';
import { MapData } from '@/types/editor';

interface UseDockviewLayoutOptions {
  maps?: MapData[];
  activeMap?: MapData | null;
  onSelectMap?: (m: MapData) => void;
  onClearActiveMap?: () => void;
}

export function useDockviewLayout(options: UseDockviewLayoutOptions = {}) {
  const { maps = [], activeMap = null, onSelectMap, onClearActiveMap } = options;

  const optionsRef = useRef({ maps, activeMap, onSelectMap, onClearActiveMap });
  useEffect(() => {
    optionsRef.current = { maps, activeMap, onSelectMap, onClearActiveMap };
  }, [maps, activeMap, onSelectMap, onClearActiveMap]);

  const apiRef = useRef<DockviewApi | null>(null);
  const [openPanels, setOpenPanels] = useState<string[]>([
    'maps', 'layers', 'entities', 'properties', 'tilesets', 'preview', 'activeSelection'
  ]);

  const updateOpenPanels = useCallback(() => {
    if (!apiRef.current) return;
    const ids = apiRef.current.panels.map((p) => p.id);
    setOpenPanels(ids);
  }, []);

  const buildDefaultLayout = useCallback((api: DockviewApi) => {
    const currentActiveMap = optionsRef.current.activeMap;
    let centerPanel: any = null;

    if (currentActiveMap) {
      const mapPanelId = getMapPanelId(currentActiveMap.folderPath, currentActiveMap.fileName);
      centerPanel = api.addPanel({
        id: mapPanelId,
        component: 'canvas',
        title: currentActiveMap.name || currentActiveMap.fileName,
        params: {
          folderPath: currentActiveMap.folderPath,
          fileName: currentActiveMap.fileName,
        },
      });
    } else {
      centerPanel = api.addPanel({
        id: 'empty_canvas',
        component: 'emptyCanvas',
        title: 'MAP',
        params: {},
      });
    }

    // Add Left Sidebar panels (Column 1)
    const mapsPanel = api.addPanel({
      id: 'maps',
      component: 'maps',
      title: 'MAPS',
      position: { referencePanel: centerPanel, direction: 'left' },
    });

    const layersPanel = api.addPanel({
      id: 'layers',
      component: 'layers',
      title: 'LAYERS',
      position: { referencePanel: mapsPanel, direction: 'below' },
    });

    const entitiesPanel = api.addPanel({
      id: 'entities',
      component: 'entities',
      title: 'ENTITIES',
      position: { referencePanel: layersPanel, direction: 'within' },
    });

    const propsPanel = api.addPanel({
      id: 'properties',
      component: 'properties',
      title: 'PROPERTIES',
      position: { referencePanel: layersPanel, direction: 'below' },
    });

    // Add Right Sidebar panels (Column 3)
    const tilesetsPanel = api.addPanel({
      id: 'tilesets',
      component: 'tilesets',
      title: 'TILESET BROWSER',
      position: { referencePanel: centerPanel, direction: 'right' },
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

    // Default sizing: 20% left side panels, 60% center canvas, 20% right side panels
    const totalWidth = api.width > 0 ? api.width : (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const sideWidth = Math.round(totalWidth * 0.2);
    const centerWidth = Math.max(100, totalWidth - (sideWidth * 2));

    mapsPanel.api.setSize({ width: sideWidth });
    layersPanel.api.setSize({ width: sideWidth });
    propsPanel.api.setSize({ width: sideWidth });
    tilesetsPanel.api.setSize({ width: sideWidth });
    previewPanel.api.setSize({ width: sideWidth });
    selectionPanel.api.setSize({ width: sideWidth });
    centerPanel.api.setSize({ width: centerWidth });

    api.layout(api.width, api.height);
  }, []);

  const applyDefaultSizes = useCallback((api: DockviewApi) => {
    const totalWidth = api.width > 0 ? api.width : (typeof window !== 'undefined' ? window.innerWidth : 1200);
    if (totalWidth <= 0) return;

    const sideWidth = Math.round(totalWidth * 0.2);
    const centerWidth = Math.max(100, totalWidth - (sideWidth * 2));

    const maps = api.getPanel('maps');
    const layers = api.getPanel('layers');
    const props = api.getPanel('properties');
    const tilesets = api.getPanel('tilesets');
    const preview = api.getPanel('preview');
    const selection = api.getPanel('activeSelection');
    const canvasPanels = api.panels.filter((p) => isMapPanelId(p.id) || p.id === 'empty_canvas');

    if (maps) maps.api.setSize({ width: sideWidth });
    if (layers) layers.api.setSize({ width: sideWidth });
    if (props) props.api.setSize({ width: sideWidth });

    if (tilesets) tilesets.api.setSize({ width: sideWidth });
    if (preview) preview.api.setSize({ width: sideWidth });
    if (selection) selection.api.setSize({ width: sideWidth });

    if (canvasPanels.length > 0) {
      canvasPanels[0].api.setSize({ width: centerWidth });
    }

    api.layout(api.width, api.height);
  }, []);

  const openMapTab = useCallback((map: MapData) => {
    if (!apiRef.current) return;
    const api = apiRef.current;
    const mapPanelId = getMapPanelId(map.folderPath, map.fileName);
    const existing = api.getPanel(mapPanelId);
    if (existing) {
      existing.api.setActive();
      updateOpenPanels();
      return;
    }

    const emptyPanel = api.getPanel('empty_canvas');
    if (emptyPanel) {
      const panel = api.addPanel({
        id: mapPanelId,
        component: 'canvas',
        title: map.name || map.fileName,
        params: {
          folderPath: map.folderPath,
          fileName: map.fileName,
        },
        position: { referencePanel: emptyPanel, direction: 'within' },
      });
      emptyPanel.api.close();
      panel.api.setActive();
      api.layout(api.width, api.height);
      updateOpenPanels();
      return;
    }

    let refPanel = api.panels.find((p) => p.api.isActive && isMapPanelId(p.id));
    let direction: 'within' | 'left' | 'right' | 'above' | 'below' = 'within';

    if (!refPanel) {
      refPanel = api.panels.find((p) => isMapPanelId(p.id));
    }

    if (!refPanel) {
      const rightRef =
        api.getPanel('tilesets') ||
        api.getPanel('preview') ||
        api.getPanel('activeSelection');
      const leftRef =
        api.getPanel('properties') ||
        api.getPanel('entities') ||
        api.getPanel('layers') ||
        api.getPanel('maps');

      if (rightRef) {
        refPanel = rightRef;
        direction = 'left';
      } else if (leftRef) {
        refPanel = leftRef;
        direction = 'right';
      }
    }

    const panel = api.addPanel({
      id: mapPanelId,
      component: 'canvas',
      title: map.name || map.fileName,
      params: {
        folderPath: map.folderPath,
        fileName: map.fileName,
      },
      position: refPanel ? { referencePanel: refPanel, direction } : undefined,
    });

    panel.api.setActive();
    api.layout(api.width, api.height);
    updateOpenPanels();
  }, [updateOpenPanels]);

  const closeMapTab = useCallback((folderPath: string | null, fileName: string) => {
    if (!apiRef.current) return;
    const mapPanelId = getMapPanelId(folderPath, fileName);
    const panel = apiRef.current.getPanel(mapPanelId);
    if (panel) {
      panel.api.close();
      updateOpenPanels();
    }
  }, [updateOpenPanels]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;

    buildDefaultLayout(api);
    applyDefaultSizes(api);

    requestAnimationFrame(() => {
      applyDefaultSizes(api);
    });

    api.onDidAddPanel(updateOpenPanels);

    api.onDidActivePanelChange((event) => {
      const panel = event?.panel;
      if (!panel) return;
      if (isMapPanelId(panel.id)) {
        const parsed = parseMapPanelId(panel.id);
        if (parsed) {
          const currentActive = optionsRef.current.activeMap;
          if (
            !currentActive ||
            currentActive.fileName !== parsed.fileName ||
            (currentActive.folderPath || null) !== parsed.folderPath
          ) {
            const map = optionsRef.current.maps?.find(
              (m) =>
                m.fileName === parsed.fileName &&
                (m.folderPath || null) === parsed.folderPath
            );
            if (map) {
              optionsRef.current.onSelectMap?.(map);
            }
          }
        }
      }
    });

    api.onDidRemovePanel((panel) => {
      updateOpenPanels();
      if (isMapPanelId(panel.id)) {
        const parsed = parseMapPanelId(panel.id);
        const currentActive = optionsRef.current.activeMap;
        if (
          parsed &&
          currentActive &&
          currentActive.fileName === parsed.fileName &&
          (currentActive.folderPath || null) === parsed.folderPath
        ) {
          const remainingMapPanels = api.panels.filter((p) => isMapPanelId(p.id));
          if (remainingMapPanels.length > 0) {
            const nextPanel = remainingMapPanels[0];
            const nextParsed = parseMapPanelId(nextPanel.id);
            if (nextParsed) {
              const nextMap = optionsRef.current.maps?.find(
                (m) =>
                  m.fileName === nextParsed.fileName &&
                  (m.folderPath || null) === nextParsed.folderPath
              );
              if (nextMap) {
                optionsRef.current.onSelectMap?.(nextMap);
              }
            }
            nextPanel.api.setActive();
          } else {
            optionsRef.current.onClearActiveMap?.();
            if (!api.getPanel('empty_canvas')) {
              const rightRef =
                api.getPanel('tilesets') ||
                api.getPanel('preview') ||
                api.getPanel('activeSelection');
              const leftRef =
                api.getPanel('properties') ||
                api.getPanel('entities') ||
                api.getPanel('layers') ||
                api.getPanel('maps');

              api.addPanel({
                id: 'empty_canvas',
                component: 'emptyCanvas',
                title: 'MAP',
                params: {},
                position: rightRef
                  ? { referencePanel: rightRef, direction: 'left' }
                  : leftRef
                  ? { referencePanel: leftRef, direction: 'right' }
                  : undefined,
              });
            }
          }
        }
      }
    });

    updateOpenPanels();
  }, [buildDefaultLayout, updateOpenPanels]);

  // Sync activeMap tab when activeMap changes from outside
  useEffect(() => {
    if (activeMap && apiRef.current) {
      openMapTab(activeMap);
    }
  }, [activeMap, openMapTab]);

  const openPanel = useCallback((id: PanelId | string) => {
    if (!apiRef.current) return;
    const api = apiRef.current;
    const existing = api.getPanel(id);
    if (existing) {
      existing.api.setActive();
      return;
    }

    const firstMapPanel = api.panels.find((p) => isMapPanelId(p.id));

    switch (id) {
      case 'maps': {
        const ref = api.getPanel('layers') || api.getPanel('entities') || api.getPanel('properties');
        if (ref) {
          api.addPanel({
            id: 'maps',
            component: 'maps',
            title: 'MAPS',
            position: { referencePanel: ref, direction: 'above' }
          });
        } else if (firstMapPanel) {
          api.addPanel({
            id: 'maps',
            component: 'maps',
            title: 'MAPS',
            position: { referencePanel: firstMapPanel, direction: 'left' }
          });
        } else {
          api.addPanel({ id: 'maps', component: 'maps', title: 'MAPS' });
        }
        break;
      }
      case 'layers': {
        const ref = api.getPanel('maps');
        const refBelow = api.getPanel('properties');
        const refEntities = api.getPanel('entities');
        if (refEntities) {
          api.addPanel({
            id: 'layers',
            component: 'layers',
            title: 'LAYERS',
            position: { referencePanel: refEntities, direction: 'within' }
          });
        } else if (ref) {
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
        } else if (firstMapPanel) {
          api.addPanel({
            id: 'layers',
            component: 'layers',
            title: 'LAYERS',
            position: { referencePanel: firstMapPanel, direction: 'left' }
          });
        } else {
          api.addPanel({ id: 'layers', component: 'layers', title: 'LAYERS' });
        }
        break;
      }
      case 'entities': {
        const refLayers = api.getPanel('layers');
        const refMaps = api.getPanel('maps');
        const refProps = api.getPanel('properties');
        if (refLayers) {
          api.addPanel({
            id: 'entities',
            component: 'entities',
            title: 'ENTITIES',
            position: { referencePanel: refLayers, direction: 'within' }
          });
        } else if (refMaps) {
          api.addPanel({
            id: 'entities',
            component: 'entities',
            title: 'ENTITIES',
            position: { referencePanel: refMaps, direction: 'below' }
          });
        } else if (refProps) {
          api.addPanel({
            id: 'entities',
            component: 'entities',
            title: 'ENTITIES',
            position: { referencePanel: refProps, direction: 'above' }
          });
        } else if (firstMapPanel) {
          api.addPanel({
            id: 'entities',
            component: 'entities',
            title: 'ENTITIES',
            position: { referencePanel: firstMapPanel, direction: 'left' }
          });
        } else {
          api.addPanel({ id: 'entities', component: 'entities', title: 'ENTITIES' });
        }
        break;
      }
      case 'properties': {
        const ref = api.getPanel('layers') || api.getPanel('entities') || api.getPanel('maps');
        if (ref) {
          api.addPanel({
            id: 'properties',
            component: 'properties',
            title: 'PROPERTIES',
            position: { referencePanel: ref, direction: 'below' }
          });
        } else if (firstMapPanel) {
          api.addPanel({
            id: 'properties',
            component: 'properties',
            title: 'PROPERTIES',
            position: { referencePanel: firstMapPanel, direction: 'left' }
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
        } else if (firstMapPanel) {
          api.addPanel({
            id: 'tilesets',
            component: 'tilesets',
            title: 'TILESET BROWSER',
            position: { referencePanel: firstMapPanel, direction: 'right' }
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
        } else if (firstMapPanel) {
          api.addPanel({
            id: 'preview',
            component: 'preview',
            title: 'TILESET',
            position: { referencePanel: firstMapPanel, direction: 'right' }
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
        } else if (firstMapPanel) {
          api.addPanel({
            id: 'activeSelection',
            component: 'activeSelection',
            title: 'ACTIVE SELECTION',
            position: { referencePanel: firstMapPanel, direction: 'right' }
          });
        } else {
          api.addPanel({ id: 'activeSelection', component: 'activeSelection', title: 'ACTIVE SELECTION' });
        }
        break;
      }
      case 'canvas': {
        if (optionsRef.current.activeMap) {
          openMapTab(optionsRef.current.activeMap);
        } else if (optionsRef.current.maps && optionsRef.current.maps.length > 0) {
          openMapTab(optionsRef.current.maps[0]);
        }
        break;
      }
    }

    api.layout(api.width, api.height);
    updateOpenPanels();
  }, [openMapTab, updateOpenPanels]);

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
    applyDefaultSizes(apiRef.current);
    requestAnimationFrame(() => {
      if (apiRef.current) applyDefaultSizes(apiRef.current);
    });
    updateOpenPanels();
  }, [buildDefaultLayout, applyDefaultSizes, updateOpenPanels]);

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
    openMapTab,
    closeMapTab,
    isPanelOpen: (id: string) => openPanels.includes(id),
  };
}

