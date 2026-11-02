import { Layer, MapData, TilesetData } from '@/types/editor'
// The conversion and validation live in /shared so the editor and scripts/export-maps.mjs use the same code.
import { collectUsedTilesetIds, convertEditorMapToTiled, serializeTiledMap } from '../../../shared/mapExport'
import { validateEditorMap, validateTiledMap } from '../../../shared/mapSchema'
import type { EditorMap, TilesetInfo } from '../../../shared/mapTypes'

function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 0, h: 0 })
    img.src = dataUrl
  })
}

function formatErrors(title: string, errors: string[]): string {
  const shown = errors.slice(0, 10).map(e => '- ' + e)
  if (errors.length > shown.length) shown.push(`- ... and ${errors.length - shown.length} more`)
  return `${title}\n${shown.join('\n')}`
}

export type BuiltMap = { ok: true; json: string } | { ok: false; error: string }

/** Validates the map and converts it to the Tiled JSON the game loads. Never throws; failures come back as `error`. */
export async function buildGameMapJson(
  mapToExportRaw: MapData,
  tilesets: TilesetData[],
  activeMap: MapData | null,
  layers: Layer[]
): Promise<BuiltMap> {
  const mapToExport: EditorMap = (activeMap && mapToExportRaw.fileName === activeMap.fileName)
    ? { ...mapToExportRaw, layers, entities: activeMap.entities || [] }
    : mapToExportRaw

  // Measure the images of the tilesets the map actually uses.
  const used = new Set(collectUsedTilesetIds(mapToExport))
  const tilesetInfos: TilesetInfo[] = []
  for (const ts of tilesets) {
    const dim = used.has(ts.fileName) ? await loadImageSize(ts.dataUrl) : { w: 0, h: 0 }
    tilesetInfos.push({ name: ts.name, fileName: ts.fileName, width: dim.w, height: dim.h })
  }

  const unreadable = tilesetInfos.filter(t => used.has(t.fileName) && (t.width === 0 || t.height === 0))
  if (unreadable.length > 0) {
    return {
      ok: false,
      error: formatErrors('Some tileset images could not be loaded:', unreadable.map(t => t.fileName)),
    }
  }

  const editorCheck = validateEditorMap(mapToExport, { tilesets: tilesetInfos })
  if (!editorCheck.ok) {
    return { ok: false, error: formatErrors(`The map "${mapToExport?.name}" is invalid:`, editorCheck.errors) }
  }

  const tiledMap = convertEditorMapToTiled(mapToExport, tilesetInfos)
  const tiledCheck = validateTiledMap(tiledMap)
  if (!tiledCheck.ok) {
    return { ok: false, error: formatErrors('The exported map would be invalid:', tiledCheck.errors) }
  }

  return { ok: true, json: serializeTiledMap(tiledMap) }
}

/** "Export as file...": asks where to save the converted map. */
export async function exportMap(
  mapToExportRaw: MapData,
  tilesets: TilesetData[],
  activeMap: MapData | null,
  layers: Layer[]
): Promise<void> {
  if (!window.electronAPI) return
  const built = await buildGameMapJson(mapToExportRaw, tilesets, activeMap, layers)
  if (!built.ok) {
    alert('Export failed: ' + built.error)
    return
  }

  const res = await window.electronAPI.exportMap(built.json, mapToExportRaw.name + '.json')
  if (res && res.error && res.error !== 'Canceled') {
    alert('Export failed: ' + res.error)
  }
}

export type GameExportOutcome = { ok: true; id: string; changed: boolean; assetsWritten: number; assetsNote?: string } | { ok: false; error: string }

/** "Export to game": writes the converted map to game/public/data/maps/<id>.json, no dialog. */
export async function exportMapToGame(
  mapToExportRaw: MapData,
  tilesets: TilesetData[],
  activeMap: MapData | null,
  layers: Layer[]
): Promise<GameExportOutcome> {
  if (!window.electronAPI) return { ok: false, error: 'The editor is not connected to the project files.' }
  // A window started before this feature existed has the old preload: say so instead of failing silently.
  if (typeof window.electronAPI.exportMapToGame !== 'function') {
    return { ok: false, error: 'This editor window is out of date. Restart the editor (npm run dev) and try again.' }
  }
  try {
    const built = await buildGameMapJson(mapToExportRaw, tilesets, activeMap, layers)
    if (!built.ok) return built

    const res = await window.electronAPI.exportMapToGame(mapToExportRaw.fileName, built.json)
    if (!res.success) return { ok: false, error: res.error }
    return { ok: true, id: res.id, changed: res.changed, assetsWritten: res.assets?.written ?? 0, assetsNote: res.assets?.skipped }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
