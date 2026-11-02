import type { EntityData } from '@/types/editor'

/** Transform depth of a plain entity (objects, scenery) and of characters; see the Depth field help in shared/engine/components.ts. */
export const OBJECT_DEPTH = 10
export const CHARACTER_DEPTH = 20

/**
 * Characters (`characters/...`) draw in the same layer as the player (20), so whoever stands lower on the map covers the
 * other one's feet. New entities now start at 20 already; an entity still on the objects layer (10, e.g. made before that
 * or from an object prefab) moves to the characters layer when a character sprite is picked. Any other depth the author
 * chose is left alone.
 */
export function withCharacterDepth(components: EntityData['components'], spriteAsset: unknown): EntityData['components'] {
  if (typeof spriteAsset !== 'string' || !spriteAsset.startsWith('characters/')) return components
  const transform = components.Transform
  if (!transform || transform.depth !== OBJECT_DEPTH) return components
  return { ...components, Transform: { ...transform, depth: CHARACTER_DEPTH } }
}
