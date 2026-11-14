import { useCallback } from 'react'
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
