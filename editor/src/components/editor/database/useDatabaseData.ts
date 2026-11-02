import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MapData, TilesetData } from '@/types/editor'
import { migrateLoadedMap } from '@/hooks/editor/useMapManager'
import { useSpriteAssets, type UseSpriteAssets } from '@/hooks/useSpriteAssets'
import { buildProjectReferences, type ProjectReferences } from '@/lib/referenceIndex'
import { useTilesetOps, type TilesetOps } from './useTilesetOps'

export interface DatabaseData {
  sprites: UseSpriteAssets
  tilesets: TilesetData[]
  /** Every folder under project/tilesets, empty ones included. */
  tilesetFolders: string[]
  tilesetOps: TilesetOps
  maps: MapData[]
  /** Where every character / graphic / tileset / flag is used (one index). */
  refs: ProjectReferences
  reload: () => Promise<void>
}

/** Everything the Database tables read: characters + graphics, tilesets and maps (maps are only read). */
export function useDatabaseData(): DatabaseData {
  const sprites = useSpriteAssets()
  const [tilesets, setTilesets] = useState<TilesetData[]>([])
  const [tilesetFolders, setTilesetFolders] = useState<string[]>([])
  const [maps, setMaps] = useState<MapData[]>([])

  const loadOthers = useCallback(async () => {
    const api = window.electronAPI
    const [t, m] = await Promise.all([api?.getTilesets?.().catch(() => undefined), api?.getMaps?.().catch(() => undefined)])
    if (t?.success) {
      setTilesets(t.tilesets ?? [])
      setTilesetFolders(t.folders ?? [])
    }
    if (m?.success) setMaps((m.maps ?? []).map(migrateLoadedMap))
  }, [])

  useEffect(() => {
    void loadOthers()
  }, [loadOthers])

  const reloadSprites = sprites.reload
  const reload = useCallback(async () => {
    await Promise.all([reloadSprites(), loadOthers()])
  }, [reloadSprites, loadOthers])

  const tilesetOps = useTilesetOps(reload)
  const refs = useMemo(() => buildProjectReferences(maps as never, Object.values(sprites.characters).map((c) => ({ id: c.id, def: c.def }))), [maps, sprites.characters])
  return useMemo(() => ({ sprites, tilesets, tilesetFolders, tilesetOps, maps, refs, reload }), [sprites, tilesets, tilesetFolders, tilesetOps, maps, refs, reload])
}
