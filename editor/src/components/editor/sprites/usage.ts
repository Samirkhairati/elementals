import type { MapData } from '@/types/editor'
import type { EntityData } from '@/types/editor'

/** Number of entities per sprite asset id (Sprite component + Event state appearance overrides). */
export function countSpriteUsage(
  maps: Pick<MapData, 'fileName' | 'folderPath' | 'entities'>[],
  active?: { fileName: string; folderPath: string | null; entities: EntityData[] } | null,
): Record<string, number> {
  const counts: Record<string, number> = {}
  const add = (id: unknown) => {
    if (typeof id === 'string' && id) counts[id] = (counts[id] ?? 0) + 1
  }
  for (const map of maps) {
    // The live (possibly unsaved) entities of the open map win over its last loaded copy.
    const isActive = !!active && map.fileName === active.fileName && (map.folderPath || null) === (active.folderPath || null)
    const entities = isActive ? active!.entities : map.entities ?? []
    for (const e of entities) {
      const used = new Set<string>()
      const sprite = e.components?.Sprite?.asset
      if (typeof sprite === 'string' && sprite) used.add(sprite)
      const states = e.components?.Event?.states
      if (Array.isArray(states)) for (const p of states) if (typeof p?.appearance?.asset === 'string' && p.appearance.asset) used.add(p.appearance.asset)
      used.forEach(add)
    }
  }
  return counts
}
