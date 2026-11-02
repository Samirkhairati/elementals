import type { EntityData } from '@/types/editor'

/** Transform depth of a plain entity (objects, scenery) and of characters; see the Depth field help in shared/engine/components.ts. */
export const OBJECT_DEPTH = 10
export const CHARACTER_DEPTH = 20

/**
 * Characters (`characters/...`) draw in the same layer as the player (20), so whoever stands lower on the map covers the
 * other one's feet. A new entity starts at the objects layer (10): picking a character sprite on such an entity moves it
 * to the characters layer. A depth the author already changed is left alone.
 */
export function withCharacterDepth(components: EntityData['components'], spriteAsset: unknown): EntityData['components'] {
  if (typeof spriteAsset !== 'string' || !spriteAsset.startsWith('characters/')) return components
  const transform = components.Transform
  if (!transform || transform.depth !== OBJECT_DEPTH) return components
  return { ...components, Transform: { ...transform, depth: CHARACTER_DEPTH } }
}
