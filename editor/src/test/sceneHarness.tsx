import type React from 'react'
import { useCallback, useEffect } from 'react'
import { render } from '@testing-library/react'
import { EditorProvider, type EditorBaseContextValue } from '@/components/editor/layout/EditorContext'
import type { MapData } from '@/types/editor'
import type { SceneNode } from '../../../shared/sceneTree'
import { useSyncedState } from '@/hooks/useSyncedState'
import { useSceneTree } from '@/hooks/editor/useSceneTree'
import { useLayerManager } from '@/hooks/editor/useLayerManager'
import { useEntityManager } from '@/hooks/editor/useEntityManager'

/**
 * The open map, the scene tree on it and the layer and entity managers, wired like the editor page wires them (the map is
 * held by a synchronous setter, so several changes in one tick compose). `onCommitHistory` gets the tree after each commit.
 */
export function useSceneHarness(initial: MapData, onCommitHistory?: (nodes: SceneNode[]) => void) {
  const [activeMap, setActiveMap, mapRef] = useSyncedState<MapData | null>(initial)
  const getActiveMap = useCallback(() => mapRef.current, [mapRef])
  const tree = useSceneTree({ activeMap, getActiveMap, setActiveMap, onCommitHistory })
  const layers = useLayerManager(tree)
  const entities = useEntityManager(tree)
  return { activeMap, setActiveMap, tree, layers, entities }
}

/** The context fields the scene panels read, from the managers of `useSceneHarness`, named as `editor.tsx` names them. */
export function sceneContext(h: ReturnType<typeof useSceneHarness>): Partial<EditorBaseContextValue> {
  const { layers: l, entities: e, tree } = h
  return {
    activeMap: h.activeMap,
    selectionView: tree.view,
    activeLayerId: l.activeLayerId,
    setActiveLayerId: l.setActiveLayerId,
    selectNode: tree.select,
    clearSelection: tree.clearSelection,
    selectedLayerIds: l.selectedLayerIds,
    justCreatedLayer: l.justCreatedLayer,
    pendingImage: l.pendingImage,
    startImagePlacement: l.startImagePlacement,
    cancelImagePlacement: l.cancelImagePlacement,
    selectedImageId: l.selectedImageId,
    resizingImageId: l.resizingImageId,
    setResizingImageId: l.setResizingImageId,
    pickedImageIds: l.pickedImageIds,
    openImageGroupId: l.openImageGroupId,
    selectImage: l.selectImage,
    moveImages: l.moveImages,
    placeMultiple: l.placeMultiple,
    addImage: l.addImage,
    updateImage: l.updateImage,
    reorderImage: l.reorderImage,
    setNodesYSort: l.setNodesYSort,
    createNode: l.createNode,
    renameNode: l.renameNode,
    editNode: l.editNode,
    addCollisionTiles: l.addCollisionTiles,
    setCollisionShapes: l.setCollisionShapes,
    toggleNodeVisibility: l.toggleNodeVisibility,
    toggleNodeLock: l.toggleNodeLock,
    setNodeYSort: l.setNodeYSort,
    setPickAsOne: l.setPickAsOne,
    toggleCollapsed: l.toggleCollapsed,
    deleteNodes: l.deleteNodes,
    requestDeleteNodes: l.deleteNodes,
    copyNodes: l.copyNodes,
    pasteNodes: l.pasteNodes,
    duplicateNodes: l.duplicateNodes,
    groupNodes: l.groupNodes,
    ungroupNode: l.ungroupNode,
    moveNodes: l.moveNodes,
    placeNodeAt: l.placeNodeAt,
    translateNodesBy: l.translateNodesBy,
    rotateNodeTo: l.rotateNodeTo,
    setNodeTagOf: l.setNodeTagOf,
    addPlacedNode: l.addPlacedNode,
    activeLayerType: l.activeLayerType,
    entities: e.entities,
    selectedEntityId: e.selectedEntityId,
    setSelectedEntityId: e.setSelectedEntityId,
    handleCreateEntity: e.createEntity,
    handleAddComponent: e.addComponent,
    handleRemoveComponent: e.removeComponent,
    handleUpdateComponentProp: e.updateComponentProp,
    handleUpdateComponentProps: e.updateComponentProps,
    toggleEntityVisibility: e.toggleEntityVisibility,
  } as Partial<EditorBaseContextValue>
}

/**
 * Renders `ui` inside an editor context backed by the real scene tree and managers (so a panel's clicks really edit the
 * map). `extra` adds or overrides context fields; `onReady` is called with the harness on every render. Returns a getter
 * for the current map.
 */
export function renderWithScene(
  ui: React.ReactElement,
  map: MapData,
  { extra = {}, activeLayerId, onReady }: { extra?: Partial<EditorBaseContextValue>; activeLayerId?: string; onReady?: (h: ReturnType<typeof useSceneHarness>) => void } = {},
) {
  const ref: { current: ReturnType<typeof useSceneHarness> | null } = { current: null }
  function Host() {
    const h = useSceneHarness(map)
    ref.current = h
    onReady?.(h)
    const { setActiveLayerId } = h.layers
    useEffect(() => {
      if (activeLayerId) setActiveLayerId(activeLayerId)
    }, [setActiveLayerId])
    return <EditorProvider value={{ ...BASE, ...sceneContext(h), ...extra } as EditorBaseContextValue}>{ui}</EditorProvider>
  }
  const result = render(<Host />)
  return { ...result, harness: () => ref.current!, map: () => ref.current!.activeMap! }
}

const BASE = { setFocusedDomain: () => {}, setConfirmDialog: () => {}, spriteAssets: {}, spriteList: [], spriteWarnings: [], maps: [], switches: [], variables: [], getSwitch: () => undefined, getVariable: () => undefined }
