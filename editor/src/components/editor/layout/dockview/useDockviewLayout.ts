import { useRef, useState, useCallback, useEffect } from 'react';
import { DockviewApi, DockviewReadyEvent, type IDockviewPanel } from 'dockview-react';
import type { SerializedDockview } from 'dockview-core';
import { ALL_PANELS, PanelId, getMapPanelId, isMapPanelId, parseMapPanelId } from './types';
import { MapData } from '@/types/editor';
import { PANEL_PLACEMENT, panelPosition } from './panelPlacement';

// The layout survives leaving the Map view (the page unmounts) and a reload: it is kept in memory and in
// localStorage, written whenever dockview reports a layout change, and read back when the dock is ready.
const LAYOUT_KEY = 'elementals.editor.dockLayout.v1';
let memoryLayout: SerializedDockview | null = null;

export function readSavedLayout(): SerializedDockview | null {
  if (memoryLayout) return memoryLayout;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LAYOUT_KEY) : null;
    return raw ? (JSON.parse(raw) as SerializedDockview) : null;
  } catch {
    return null;
  }
}

export function writeSavedLayout(layout: SerializedDockview | null): void {
  memoryLayout = layout;
  try {
    if (typeof localStorage === 'undefined') return;
    if (layout) localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    else localStorage.removeItem(LAYOUT_KEY);
  } catch {
    // Storage full or blocked: the in-memory copy still covers switching views.
  }
}

interface UseDockviewLayoutOptions {
  maps?: MapData[];
  activeMap?: MapData | null;
  onSelectMap?: (m: MapData) => void;
  onClearActiveMap?: () => void;
  /** A node without a panel of its own is selected (an entity, a Look...): the properties panel fills the right sidebar. */
  entityFocus?: boolean;
  /** A sprite is picked, placed or chosen (and no entity selected): the Graphics panel replaces the tileset panels instead. */
  imageFocus?: boolean;
  /** A collision layer is active (and no entity selected): the collision panel (its items) replaces them. */
  collisionFocus?: boolean;
}

/** What the right sidebar shows under the properties panel (`inspector`, always shown): `inspector` = nothing else. */
type RightFocus = 'tiles' | 'inspector' | 'images' | 'collision';
const TILE_PANELS = ['tilesets', 'preview', 'activeSelection'];
const FOCUS_PANELS = ['images', 'collision'];
/**
 * Panels of older layouts that no longer exist: the entity list is part of the Scene panel, the left Properties panel and
 * the Look column are the right sidebar's properties panel now.
 */
const RETIRED_PANELS = ['entities', 'properties', 'look'];
/** Panels whose title changed: a saved layout keeps the old one. */
const RENAMED_PANELS: Record<string, string> = { layers: 'SCENE', inspector: 'PROPERTIES', images: 'GRAPHICS' };

export function useDockviewLayout(options: UseDockviewLayoutOptions = {}) {
  const { maps = [], activeMap = null, onSelectMap, onClearActiveMap, entityFocus = false, imageFocus = false, collisionFocus = false } = options;

  const rightFocus: RightFocus = entityFocus ? 'inspector' : imageFocus ? 'images' : collisionFocus ? 'collision' : 'tiles';
  const optionsRef = useRef({ maps, activeMap, onSelectMap, onClearActiveMap, rightFocus });
  useEffect(() => {
    optionsRef.current = { maps, activeMap, onSelectMap, onClearActiveMap, rightFocus };
  }, [maps, activeMap, onSelectMap, onClearActiveMap, rightFocus]);

  const apiRef = useRef<DockviewApi | null>(null);
  // What the right column showed last, and the heights of the tileset panels before they were hidden, so coming back
  // to them restores the sizes you left instead of a fixed split.
  const lastFocus = useRef<RightFocus | null>(null);
  const tileHeights = useRef<Record<string, number> | null>(null);
  const [openPanels, setOpenPanels] = useState<string[]>([
    'maps', 'layers', 'inspector', 'tilesets', 'preview', 'activeSelection'
  ]);

  const updateOpenPanels = useCallback(() => {
    if (!apiRef.current) return;
    const ids = apiRef.current.panels.map((p) => p.id);
    // Keep the same array when nothing changed so context consumers don't re-render needlessly.
    setOpenPanels((prev) =>
      prev.length === ids.length && prev.every((id, i) => id === ids[i]) ? prev : ids
    );
  }, []);

  // The right sidebar shows either the tileset panels, the entity inspector or the images panel: the others are hidden.
  // Sizes only change on a real switch (never when another panel opens), so the column does not jump around.
  const applyRightFocus = useCallback((api: DockviewApi, focus: RightFocus, freshLayout = false) => {
    if (!api.getPanel('inspector')) return;
    const prev = freshLayout ? null : lastFocus.current;
    if (prev === 'tiles' && focus !== 'tiles') {
      const heights: Record<string, number> = {};
      for (const id of TILE_PANELS) {
        const h = api.getPanel(id)?.group.api.height;
        if (typeof h === 'number' && h > 0) heights[id] = h;
      }
      if (Object.keys(heights).length > 0) tileHeights.current = heights;
    }
    const focusGroups = FOCUS_PANELS.map((id) => api.getPanel(id)?.group);
    for (const id of TILE_PANELS) {
      const panel = api.getPanel(id);
      if (panel && !focusGroups.includes(panel.group)) panel.group.api.setVisible(focus === 'tiles');
    }
    for (const id of FOCUS_PANELS) api.getPanel(id)?.group.api.setVisible(id === focus);
    // The properties panel is always shown; alone, it fills the column, else it takes the upper part.
    const inspector = api.getPanel('inspector');
    if (inspector) {
      inspector.group.api.setVisible(true);
      const total = api.height;
      if (focus !== 'inspector' && total > 0 && prev !== focus) {
        const fit = () => inspector.api.setSize({ height: Math.round(total * 0.38) });
        fit();
        if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(fit);
      }
    }
    lastFocus.current = focus;
    if (focus !== 'tiles' || prev === 'tiles') return;
    // Showing the groups again leaves them squeezed: give back the heights they had, or split 40 / 40 / 20 the first time.
    const saved = freshLayout ? null : tileHeights.current;
    const resize = () => {
      const total = api.height;
      if (!(total > 0)) return;
      const heightOf = (id: string, share: number) => saved?.[id] ?? Math.round(total * share);
      api.getPanel('tilesets')?.api.setSize({ height: heightOf('tilesets', 0.4) });
      api.getPanel('preview')?.api.setSize({ height: heightOf('preview', 0.4) });
      api.getPanel('activeSelection')?.api.setSize({ height: heightOf('activeSelection', 0.2) });
    };
    resize();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(resize);
  }, []);

  const buildDefaultLayout = useCallback((api: DockviewApi) => {
    const currentActiveMap = optionsRef.current.activeMap;
    let centerPanel: IDockviewPanel | null = null;

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
      title: 'SCENE',
      position: { referencePanel: mapsPanel, direction: 'below' },
    });

    // Add Right Sidebar panels (Column 3)
    const tilesetsPanel = api.addPanel({
      id: 'tilesets',
      component: 'tilesets',
      title: 'TILESET BROWSER',
      position: { referencePanel: centerPanel, direction: 'right' },
    });

    // Properties of the selected node: always at the top of the right column; the panels below follow the selection.
    const inspectorPanel = api.addPanel({
      id: 'inspector',
      component: 'inspector',
      title: 'PROPERTIES',
      position: { referencePanel: tilesetsPanel, direction: 'above' },
    });

    // Graphics panel: the same spot, shown while a sprite is picked, placed or chosen.
    const imagesPanel = api.addPanel({
      id: 'images',
      component: 'images',
      title: 'GRAPHICS',
      position: { referencePanel: tilesetsPanel, direction: 'above' },
    });

    // Collision panel: the same spot, shown while a collision layer is active.
    const collisionPanel = api.addPanel({
      id: 'collision',
      component: 'collision',
      title: 'COLLISION',
      position: { referencePanel: tilesetsPanel, direction: 'above' },
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
    inspectorPanel.api.setSize({ width: sideWidth });
    imagesPanel.api.setSize({ width: sideWidth });
    collisionPanel.api.setSize({ width: sideWidth });
    tilesetsPanel.api.setSize({ width: sideWidth });
    previewPanel.api.setSize({ width: sideWidth });
    selectionPanel.api.setSize({ width: sideWidth });
    centerPanel.api.setSize({ width: centerWidth });

    api.layout(api.width, api.height);
    applyRightFocus(api, optionsRef.current.rightFocus, true);
  }, [applyRightFocus]);

  const applyDefaultSizes = useCallback((api: DockviewApi) => {
    const totalWidth = api.width > 0 ? api.width : (typeof window !== 'undefined' ? window.innerWidth : 1200);
    if (totalWidth <= 0) return;

    const sideWidth = Math.round(totalWidth * 0.2);
    const centerWidth = Math.max(100, totalWidth - (sideWidth * 2));

    const maps = api.getPanel('maps');
    const layers = api.getPanel('layers');
    const inspector = api.getPanel('inspector');
    const tilesets = api.getPanel('tilesets');
    const preview = api.getPanel('preview');
    const selection = api.getPanel('activeSelection');
    const canvasPanels = api.panels.filter((p) => isMapPanelId(p.id) || p.id === 'empty_canvas');

    if (maps) maps.api.setSize({ width: sideWidth });
    if (layers) layers.api.setSize({ width: sideWidth });
    if (inspector) inspector.api.setSize({ width: sideWidth });
    api.getPanel('images')?.api.setSize({ width: sideWidth });
    api.getPanel('collision')?.api.setSize({ width: sideWidth });

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

  const ensureEmptyCanvasRef = useRef<((api: DockviewApi) => void) | null>(null);
  /** The "no map" placeholder tab, added when the last map tab goes away. */
  const ensureEmptyCanvas = useCallback((api: DockviewApi) => {
    if (api.getPanel('empty_canvas')) return;
    const rightRef =
      api.getPanel('tilesets') ||
      api.getPanel('preview') ||
      api.getPanel('activeSelection');
    const leftRef =
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
  }, []);
  ensureEmptyCanvasRef.current = ensureEmptyCanvas;

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;

    // The layout you left (tabs, sizes, what is open), or the default one when there is none or it no longer loads.
    const saved = readSavedLayout();
    let restored = false;
    if (saved && typeof api.fromJSON === 'function') {
      try {
        api.fromJSON(saved);
        restored = !!api.getPanel('inspector') || api.panels.length > 0;
      } catch {
        restored = false;
      }
      if (!restored) {
        api.clear();
        writeSavedLayout(null);
      }
    }
    if (restored) {
      if (!api.panels.some((p) => isMapPanelId(p.id) || p.id === 'empty_canvas')) ensureEmptyCanvasRef.current?.(api);
      for (const id of RETIRED_PANELS) api.getPanel(id)?.api.close();
      // A layout saved before the properties panel moved to the right column gets it there.
      const right = api.getPanel('images') ?? api.getPanel('collision') ?? api.getPanel('tilesets');
      if (!api.getPanel('inspector') && right) api.addPanel({ id: 'inspector', component: 'inspector', title: 'PROPERTIES', position: { referencePanel: right, direction: 'above' } });
      // Panels renamed since the layout was saved show their current title.
      for (const [id, title] of Object.entries(RENAMED_PANELS)) api.getPanel(id)?.api.setTitle(title);
      // A layout saved before the collision panel existed gets it in the right column, like the images panel.
      const besideRight = api.getPanel('images') ?? api.getPanel('inspector') ?? api.getPanel('tilesets');
      if (!api.getPanel('collision') && besideRight) {
        api.addPanel({ id: 'collision', component: 'collision', title: 'COLLISION', position: { referencePanel: besideRight, direction: 'below' } });
      }
      lastFocus.current = null;
      applyRightFocus(api, optionsRef.current.rightFocus);
    } else {
      buildDefaultLayout(api);
      applyDefaultSizes(api);
      requestAnimationFrame(() => {
        applyDefaultSizes(api);
      });
    }

    if (typeof api.onDidLayoutChange === 'function' && typeof api.toJSON === 'function') {
      api.onDidLayoutChange(() => {
        try {
          writeSavedLayout(api.toJSON());
        } catch {
          // a half-built layout during a reset: the next change saves it
        }
      });
    }

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
      if (!isMapPanelId(panel.id)) return;
      const parsed = parseMapPanelId(panel.id);
      const currentActive = optionsRef.current.activeMap;
      const wasActive =
        !!parsed &&
        !!currentActive &&
        currentActive.fileName === parsed.fileName &&
        (currentActive.folderPath || null) === parsed.folderPath;
      const remainingMapPanels = api.panels.filter((p) => isMapPanelId(p.id));

      if (wasActive && remainingMapPanels.length > 0) {
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
        return;
      }

      if (remainingMapPanels.length === 0) {
        if (wasActive) optionsRef.current.onClearActiveMap?.();
        // The map may already have been deactivated (deleted) before its tab went away: still leave a placeholder.
        ensureEmptyCanvas(api);
      }
    });

    updateOpenPanels();
  }, [buildDefaultLayout, applyDefaultSizes, applyRightFocus, updateOpenPanels, ensureEmptyCanvas]);

  // Sync activeMap tab when the active map *identity* changes from outside
  // (content edits produce a new activeMap object on every stroke and must not re-run this).
  const activeMapFile = activeMap?.fileName;
  const activeMapFolder = activeMap?.folderPath;
  useEffect(() => {
    const current = optionsRef.current.activeMap;
    if (current && apiRef.current) {
      openMapTab(current);
    }
  }, [activeMapFile, activeMapFolder, openMapTab]);

  // A map that disappears from the project (deleted, or its folder was) closes its tab. Only maps that were
  // in the previous list count, so the empty list before the first load never closes anything.
  const knownMapIds = useRef<Set<string>>(new Set());
  const reconciled = useRef(false);
  useEffect(() => {
    const api = apiRef.current;
    const present = new Set(maps.map((m) => getMapPanelId(m.folderPath || null, m.fileName)));
    const gone = [...knownMapIds.current].filter((id) => !present.has(id));
    knownMapIds.current = present;
    if (!api) return;
    for (const id of gone) {
      const panel = api.getPanel(id);
      if (panel) panel.api.close();
    }
    if (reconciled.current || present.size === 0) return;
    reconciled.current = true;
    // A restored layout may hold tabs of maps that are gone since; and the map whose tab was in front opens again.
    for (const panel of api.panels.filter((p) => isMapPanelId(p.id) && !present.has(p.id))) panel.api.close();
    if (!optionsRef.current.activeMap) {
      const front = api.panels.find((p) => isMapPanelId(p.id) && p.api.isActive) ?? api.panels.find((p) => isMapPanelId(p.id) && p.api.isVisible);
      const parsed = front ? parseMapPanelId(front.id) : null;
      const map = parsed && maps.find((m) => m.fileName === parsed.fileName && (m.folderPath || null) === parsed.folderPath);
      if (map) optionsRef.current.onSelectMap?.(map);
    }
  }, [maps, openPanels]);

  // Entity selected: the inspector replaces the right sidebar (tileset browser, tileset, active selection); on an image
  // layer the images panel does; otherwise the tileset panels are back. Also re-applied after a layout reset.
  useEffect(() => {
    if (apiRef.current) applyRightFocus(apiRef.current, rightFocus);
  }, [rightFocus, openPanels, applyRightFocus]);

  const openPanel = useCallback((id: PanelId | string) => {
    if (!apiRef.current) return;
    const api = apiRef.current;
    const existing = api.getPanel(id);
    if (existing) {
      existing.api.setActive();
      return;
    }

    const placement = PANEL_PLACEMENT[id];
    if (placement?.edge) {
      const panel = api.addPanel({ id, component: id, title: placement.title, position: { direction: placement.edge } });
      panel.api.setSize({ width: Math.max(280, Math.round(api.width * 0.18)) });
    } else if (placement) {
      const firstMapPanel = api.panels.find((p) => isMapPanelId(p.id))?.id ?? null;
      const position = panelPosition(placement, (other) => !!api.getPanel(other), firstMapPanel);
      const reference = position && api.getPanel(position.referencePanel);
      api.addPanel({ id, component: id, title: placement.title, ...(position && reference ? { position: { referencePanel: reference, direction: position.direction } } : {}) });
    } else if (id === 'canvas') {
      const { activeMap, maps } = optionsRef.current;
      const map = activeMap ?? maps?.[0];
      if (map) openMapTab(map);
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

  const isPanelOpen = useCallback((id: string) => openPanels.includes(id), [openPanels]);

  const resetLayout = useCallback(() => {
    if (!apiRef.current) return;
    writeSavedLayout(null);
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

    const handleCustomToggle = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) togglePanel(detail);
    };
    const handleCustomReset = () => {
      resetLayout();
    };

    // Alt+<letter> toggles the panel that lists that shortcut (see ALL_PANELS). Uses `code`, because Alt
    // changes `key` on macOS, and runs before the editor's single-key tool shortcuts.
    const handleShortcut = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const info = ALL_PANELS.find(
        (p) => p.id !== 'canvas' && p.shortcut && e.code === `Key${p.shortcut.slice(-1).toUpperCase()}`
      );
      if (!info) return;
      e.preventDefault();
      e.stopPropagation();
      togglePanel(info.id);
    };

    window.addEventListener('editor:toggle-panel', handleCustomToggle);
    window.addEventListener('editor:reset-layout', handleCustomReset);
    window.addEventListener('keydown', handleShortcut, true);

    return () => {
      unsubToggle?.();
      unsubReset?.();
      window.removeEventListener('editor:toggle-panel', handleCustomToggle);
      window.removeEventListener('editor:reset-layout', handleCustomReset);
      window.removeEventListener('keydown', handleShortcut, true);
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
    isPanelOpen,
  };
}

