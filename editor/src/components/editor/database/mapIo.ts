import type { MapData } from '@/types/editor'
import type { OpResult } from '@/lib/opResult'

/** Writes a map file the way the Map Editor does (used when a rename rewrites the maps that refer to something). */
export async function saveMapFile(map: MapData): Promise<OpResult> {
  try {
    const r = await window.electronAPI?.saveMap(map.folderPath ?? null, map.fileName, map)
    return r?.success ? { ok: true } : { ok: false, error: r?.error ?? 'not saved' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
