import { useSyncExternalStore } from 'react'

/**
 * What the collision-shape editor on the canvas is working on, shared with the panels without going through the
 * editor context: the picked shape of the active polygon layer, and the entity whose polygon collider is being
 * drawn on the map (Collider › Draw on map).
 */
export interface PolygonEditState {
  selectedShapeId: string | null
  /** While set, the canvas edits this entity's polygon collider instead of the active layer's shapes. */
  colliderEntityId: string | null
  /** A shape is being drawn (points placed, not finished yet). */
  drawing: boolean
}

let state: PolygonEditState = { selectedShapeId: null, colliderEntityId: null, drawing: false }
const listeners = new Set<() => void>()

export const polygonEditStore = {
  get: (): PolygonEditState => state,
  set(patch: Partial<PolygonEditState>) {
    const next = { ...state, ...patch }
    if (next.selectedShapeId === state.selectedShapeId && next.colliderEntityId === state.colliderEntityId && next.drawing === state.drawing) return
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
