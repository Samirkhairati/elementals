import { useSyncExternalStore } from 'react'

/** What a click on the map does while a collision layer is active: paint tiles, or draw shapes. */
export type CollisionBrush = 'tiles' | 'shape'

/**
 * What the collision editor on the canvas is working on, shared with the panels without going through the editor
 * context: the picked item of the active collision layer (a shape or a tiles item), the brush, and the entity whose
 * polygon collider is being drawn on the map (Collider › Draw on map).
 */
export interface PolygonEditState {
  /** The picked item of the active collision layer: a shape id or a tiles item id. */
  selectedShapeId: string | null
  brush: CollisionBrush
  /** While set, the canvas edits this entity's polygon collider instead of the active layer's shapes. */
  colliderEntityId: string | null
  /** A shape is being drawn (points placed, not finished yet). */
  drawing: boolean
}

let state: PolygonEditState = { selectedShapeId: null, brush: 'tiles', colliderEntityId: null, drawing: false }
const listeners = new Set<() => void>()

export const polygonEditStore = {
  get: (): PolygonEditState => state,
  set(patch: Partial<PolygonEditState>) {
    const next = { ...state, ...patch }
    if (
      next.selectedShapeId === state.selectedShapeId &&
      next.brush === state.brush &&
      next.colliderEntityId === state.colliderEntityId &&
      next.drawing === state.drawing
    )
      return
    state = next
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function usePolygonEdit(): PolygonEditState {
  return useSyncExternalStore(polygonEditStore.subscribe, polygonEditStore.get, polygonEditStore.get)
}
