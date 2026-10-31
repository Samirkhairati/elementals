import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import type { useMapManager } from '@/hooks/editor/useMapManager'
import type { useLayerManager } from '@/hooks/editor/useLayerManager'
import type { useEntityManager } from '@/hooks/editor/useEntityManager'
import type { useEditorDialogs } from '@/hooks/editor/useEditorDialogs'
import type { useGridSettings } from '@/hooks/editor/useGridSettings'
import type { useEntityPlacement } from '@/hooks/editor/useEntityPlacement'
import type { useTilesetManager } from '@/hooks/editor/useTilesetManager'
import type { usePaintTools } from '@/hooks/usePaintTools'
import type { useSpriteAssets } from '@/hooks/useSpriteAssets'
import type { useDatabase } from '@/hooks/useDatabase'
import type { LayerType, MapData } from '@/types/editor'

// ── Value type ──────────────────────────────────────────────────────────────
// Derived from the hooks that supply each field, so the context can never drift from them.

type MapManager = ReturnType<typeof useMapManager>
type LayerManager = ReturnType<typeof useLayerManager>
type EntityManager = ReturnType<typeof useEntityManager>
type Dialogs = ReturnType<typeof useEditorDialogs>
type GridSettings = ReturnType<typeof useGridSettings>
type Placement = ReturnType<typeof useEntityPlacement>
type TilesetManager = ReturnType<typeof useTilesetManager>
type PaintTools = ReturnType<typeof usePaintTools>
type Sprites = ReturnType<typeof useSpriteAssets>
type Db = ReturnType<typeof useDatabase>

export type FocusedDomain = 'maps' | 'layers' | 'entities' | 'tilesets' | null

export interface EditorBaseContextValue
  extends Pick<
      MapManager,
      | 'maps'
      | 'mapFolders'
      | 'activeMap'
      | 'expandedMapFolders'
      | 'toggleMapFolder'
      | 'handleDeleteMapFolder'
      | 'handleDeleteMap'
      | 'handleMapDrop'
      | 'onSelectMap'
    >,
    Pick<
      Dialogs,
      | 'setCreateMapData'
      | 'setCreateMapDialog'
      | 'setCreateMapFolderDialog'
      | 'setRenameInput'
      | 'setRenameDialog'
      | 'setConfirmDialog'
    >,
    Pick<
      LayerManager,
      | 'layers'
      | 'activeLayerId'
      | 'toggleLayerVisibility'
      | 'toggleLayerLock'
      | 'handleDeleteLayer'
      | 'handleReorderLayers'
      | 'handleCreateLayer'
      | 'handleRenameLayer'
      | 'updateLayers'
      | 'activeLayerType'
      | 'activeTool'
      | 'paintMode'
      | 'setActiveTool'
      | 'setPaintMode'
      | 'tileSelection'
      | 'setTileSelection'
      | 'isPainting'
      | 'setIsPainting'
      | 'paintStartPos'
      | 'setPaintStartPos'
      | 'debugInfo'
    >,
    Pick<
      EntityManager,
      | 'entities'
      | 'selectedEntityId'
      | 'showEntities'
      | 'setShowEntities'
      | 'toggleShowEntities'
      | 'entityFolders'
      | 'createEntityFolder'
      | 'renameEntityFolder'
      | 'deleteEntityFolder'
      | 'toggleEntityFolderVisibility'
      | 'toggleEntityFolderExpanded'
      | 'toggleEntityVisibility'
      | 'moveEntityToFolder'
    >,
    Pick<PaintTools, 'handlePaint' | 'handlePaintBucket' | 'handleRectangleFill'>,
    Pick<
      GridSettings,
      | 'showGrid'
      | 'setShowGrid'
      | 'toggleShowGrid'
      | 'snapToGrid'
      | 'setSnapToGrid'
      | 'toggleSnapToGrid'
      | 'snapEntityPos'
      | 'snapCoord'
      | 'snapDimension'
    >,
    Pick<Placement, 'pendingPlacement' | 'startPlacement' | 'cancelPlacement'>,
    Pick<
      TilesetManager,
      | 'tilesets'
      | 'folders'
      | 'activeTileset'
      | 'setActiveTileset'
      | 'expandedFolders'
      | 'selectedFolder'
      | 'setSelectedFolder'
      | 'toggleFolder'
      | 'handlePickFile'
      | 'handleOpenCreateFolderDialog'
      | 'handleDeleteFolder'
      | 'handleDrop'
      | 'tilesetDimensions'
      | 'setTilesetDimensions'
      | 'tilesetSelectionStart'
      | 'setTilesetSelectionStart'
      | 'tilesetSelectionCurrent'
      | 'setTilesetSelectionCurrent'
      | 'hoverTile'
      | 'setHoverTile'
    > {
  // Focus tracking
  focusedDomain: FocusedDomain
  setFocusedDomain: (domain: FocusedDomain) => void

  // Maps (renamed / wrapped fields)
  setCreateMapFolderName: Dialogs['setCreateMapFolderName']
  handleExportMap: (map: MapData) => void
  /** Called by the dock when the last map tab closed: persists pending edits, then clears the editor state. */
  onClearActiveMap: () => void

  // Layers (wrapped to also move focus / clear entity selection)
  setActiveLayerId: (layerId: string | null) => void
  handleCreateLayerOfType: (type: LayerType) => void
  handleDuplicateLayer: (id: string) => void

  // Entities
  setSelectedEntityId: (entityId: string | null) => void
  handleCreateEntity: EntityManager['createEntity']
  handleDuplicateEntity: EntityManager['duplicateEntity']
  handleDeleteEntity: EntityManager['deleteEntity']
  handleRenameEntity: EntityManager['renameEntity']
  handleMoveEntity: EntityManager['moveEntity']
  handleReorderEntities: EntityManager['reorderEntities']
  handleAddComponent: EntityManager['addComponent']
  handleRemoveComponent: EntityManager['removeComponent']
  handleUpdateComponentProp: EntityManager['updateComponentProp']
  handleUpdateComponentProps: EntityManager['updateComponentProps']

  // History
  historyIndex: number
  historyLength: number
  handleUndo: () => void
  handleRedo: () => void
  handleCommit: () => void

  // Placement (wrapped to create the entity)
  commitPlacement: (x: number, y: number) => void

  // Sprite assets (project/sprites)
  spriteAssets: Sprites['assets']
  spriteList: Sprites['list']
  spriteFolders: Sprites['folders']
  spriteWarnings: Sprites['warnings']
  getSpriteAsset: Sprites['getAsset']
  reloadSprites: Sprites['reload']
  pickSpriteFile: Sprites['pickFile']
  importSprite: Sprites['importSprite']
  saveSpriteMeta: Sprites['saveMeta']
  renameSprite: Sprites['rename']
  removeSprite: Sprites['remove']
  createSpriteFolder: Sprites['createFolder']
  renameSpriteFolder: Sprites['renameFolder']
  moveSpriteFolder: Sprites['moveFolder']
  deleteSpriteFolder: Sprites['deleteFolder']

  // Game database (project/database.json): global switches and variables
  database: Db['database']
  switches: Db['switches']
  variables: Db['variables']
  getSwitch: Db['getSwitch']
  getVariable: Db['getVariable']
  addSwitch: Db['addSwitch']
  renameSwitch: Db['renameSwitch']
  removeSwitch: Db['removeSwitch']
  addVariable: Db['addVariable']
  renameVariable: Db['renameVariable']
  setVariableInitial: Db['setVariableInitial']
  removeVariable: Db['removeVariable']
  reloadDatabase: Db['reload']
}

/** Fields contributed by the Dockview layout (see `EditorDockview`). */
export interface DockviewLayoutValue {
  openPanels: string[]
  openPanel: (id: string) => void
  closePanel: (id: string) => void
  togglePanel: (id: string) => void
  resetLayout: () => void
  openMapTab: (map: MapData) => void
  closeMapTab: (folderPath: string | null, fileName: string) => void
  isPanelOpen: (id: string) => boolean
}

/** What panels inside the dock see. */
export type EditorContextValue = EditorBaseContextValue & DockviewLayoutValue

// ── External store ──────────────────────────────────────────────────────────

export interface EditorStore<T> {
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
}

interface MutableEditorStore<T> extends EditorStore<T> {
  set: (value: T) => void
}

export function createEditorStore<T>(initial: T): MutableEditorStore<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: next => {
      if (Object.is(next, value)) return
      value = next
      listeners.forEach(l => l())
    },
  }
}

const EditorStoreContext = createContext<EditorStore<EditorContextValue> | null>(null)

/**
 * Holds the latest context value in a store instead of propagating it through React context,
 * so only consumers whose selected slice changed re-render. The store is updated in a layout
 * effect (before paint), then subscribers are notified.
 */
export function EditorProvider({
  value,
  children,
}: {
  value: EditorBaseContextValue
  children: React.ReactNode
}) {
  const [store] = useState(() => createEditorStore<EditorBaseContextValue>(value))
  useLayoutEffect(() => {
    store.set(value)
  }, [store, value])
  return (
    <EditorStoreContext.Provider value={store as unknown as EditorStore<EditorContextValue>}>
      {children}
    </EditorStoreContext.Provider>
  )
}

/**
 * Nested provider that layers extra fields on top of the parent store without
 * subscribing the component that renders it to every parent change.
 */
export function EditorExtensionProvider({
  extension,
  children,
}: {
  extension: DockviewLayoutValue
  children: React.ReactNode
}) {
  const parent = useContext(EditorStoreContext)
  if (!parent) throw new Error('EditorExtensionProvider must be used within EditorProvider')

  const extRef = useRef(extension)
  const listenersRef = useRef(new Set<() => void>())

  const store = useMemo<EditorStore<EditorContextValue>>(() => {
    let cachedParent: EditorContextValue | null = null
    let cachedExt: DockviewLayoutValue | null = null
    let cachedMerged: EditorContextValue | null = null
    const listeners = listenersRef.current
    return {
      getSnapshot: () => {
        const p = parent.getSnapshot()
        const e = extRef.current
        if (!cachedMerged || p !== cachedParent || e !== cachedExt) {
          cachedParent = p
          cachedExt = e
          cachedMerged = { ...p, ...e }
        }
        return cachedMerged
      },
      subscribe: listener => {
        listeners.add(listener)
        const unsubscribeParent = parent.subscribe(listener)
        return () => {
          listeners.delete(listener)
          unsubscribeParent()
        }
      },
    }
  }, [parent])

  useLayoutEffect(() => {
    if (extRef.current === extension) return
    extRef.current = extension
    listenersRef.current.forEach(l => l())
  }, [extension])

  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>
}

function useEditorStore(): EditorStore<EditorContextValue> {
  const store = useContext(EditorStoreContext)
  if (!store) throw new Error('useEditorContext must be used within EditorProvider')
  return store
}

// ── Consumption ─────────────────────────────────────────────────────────────

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false
  }
  return true
}

/**
 * Subscribe to a slice of the editor context. The component re-renders only when the
 * selected value changes according to `isEqual` (shallow comparison by default), so
 * selectors may build fresh objects/arrays of context fields.
 */
export function useEditorSelector<S>(
  selector: (ctx: EditorContextValue) => S,
  isEqual: (a: S, b: S) => boolean = shallowEqual
): S {
  const store = useEditorStore()
  const last = useRef<{ selected: S } | null>(null)

  const getSelection = useMemo(() => {
    let hasMemo = false
    let memoSnapshot: EditorContextValue
    let memoSelection: S
    return () => {
      const snapshot = store.getSnapshot()
      if (hasMemo && snapshot === memoSnapshot) return memoSelection
      const next = selector(snapshot)
      hasMemo = true
      memoSnapshot = snapshot
      // Keep the previous reference when the new selection is equal (also across selector changes).
      const prev = last.current
      memoSelection = prev && isEqual(prev.selected, next) ? prev.selected : next
      return memoSelection
    }
  }, [store, selector, isEqual])

  const selected = useSyncExternalStore(store.subscribe, getSelection, getSelection)
  useLayoutEffect(() => {
    last.current = { selected }
  })
  return selected
}

const identity = (ctx: EditorContextValue) => ctx

/** The whole context value. Subscribes to every change - prefer `useEditorSelector`. */
export function useEditorContext(): EditorContextValue {
  return useEditorSelector(identity, Object.is)
}
