// Tile-based vs free entities, as the editor's creation flows use them (the contract is shared/engine/placement.ts).

import { COMPONENT_SCHEMAS } from '../../../shared/engine/components'
import { snapAnchorToTile } from '../../../shared/engine/placement'
import type { ComponentType } from '@/types/editor'

type Components = Partial<Record<ComponentType, Record<string, any>>>

/** `components` (a prefab's, or none for an empty entity) with the Transform marked tile-based or free. */
export function withPlacement(components: Components | undefined, free: boolean): Components {
  return { ...components, Transform: { ...(COMPONENT_SCHEMAS.Transform.defaultProps as Record<string, unknown>), ...components?.Transform, free } }
}

/** Where an entity of this kind goes when the pointer is at (x, y) in map pixels: the tile anchor, or the pixel itself. */
export function placeAt(free: boolean, x: number, y: number): { x: number; y: number } {
  return free ? { x: Math.round(x), y: Math.round(y) } : snapAnchorToTile(x, y)
}
