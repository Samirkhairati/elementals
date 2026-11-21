import { useState, useCallback, useEffect } from 'react'
import { ComponentType, type PropBag } from '@/types/editor'
import type { NodePrefab } from '../../../../shared/prefabs'
import { componentsOfEntity } from '../../../../shared/sceneEntity'

/** What the next click on the map places: an entity from components, a prefab's node tree, or a plain Node. */
export interface PendingEntityPlacement {
  name: string
  components?: Partial<Record<ComponentType, PropBag>>
  /** A prefab: its whole tree is placed with its anchor on the click. */
  prefab?: NodePrefab
  /** Where it goes in the tree (a Node that can hold it); undefined = next to the selection. */
  parentId?: string | null
}

const NO_COMPONENTS: Partial<Record<ComponentType, PropBag>> = {}
const prefabComponents = new WeakMap<NodePrefab, Partial<Record<ComponentType, PropBag>>>()

/** The components of what is being placed (a prefab's root node's, from its child nodes; a plain Node has none). Cached per prefab. */
export function placementComponents(p: PendingEntityPlacement): Partial<Record<ComponentType, PropBag>> {
  if (!p.prefab) return p.components ?? NO_COMPONENTS
  let hit = prefabComponents.get(p.prefab)
  if (!hit) {
    hit = p.prefab.node.type === 'entity' ? (componentsOfEntity(p.prefab.node) as Partial<Record<ComponentType, PropBag>>) : NO_COMPONENTS
    prefabComponents.set(p.prefab, hit)
  }
  return hit
}

export interface EntityPlacementManager {
  pendingPlacement: PendingEntityPlacement | null
  startPlacement: (template: PendingEntityPlacement) => void
  cancelPlacement: () => void
}

export function useEntityPlacement(): EntityPlacementManager {
  const [pendingPlacement, setPendingPlacement] = useState<PendingEntityPlacement | null>(null)

  const startPlacement = useCallback((template: PendingEntityPlacement) => {
    setPendingPlacement(template)
  }, [])

  const cancelPlacement = useCallback(() => {
    setPendingPlacement(null)
  }, [])

  // Cancel placement on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pendingPlacement) {
        cancelPlacement()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingPlacement, cancelPlacement])

  return {
    pendingPlacement,
    startPlacement,
    cancelPlacement,
  }
}
