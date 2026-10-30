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

export async function exportMap(
  mapToExportRaw: any,
  tilesets: TilesetData[],
  activeMap: MapData | null,
  layers: Layer[]
): Promise<void> {
  if (!window.electronAPI) return

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
    alert('Export failed: ' + formatErrors(
      'Some tileset images could not be loaded:',
      unreadable.map(t => t.fileName)
    ))
    return
  }

  const editorCheck = validateEditorMap(mapToExport, { tilesets: tilesetInfos })
  if (!editorCheck.ok) {
    alert('Export failed: ' + formatErrors(`The map "${mapToExport?.name}" is invalid:`, editorCheck.errors))
    return
  }

  const tiledMap = convertEditorMapToTiled(mapToExport, tilesetInfos)
  const tiledCheck = validateTiledMap(tiledMap)
  if (!tiledCheck.ok) {
    alert('Export failed: ' + formatErrors('The exported map would be invalid:', tiledCheck.errors))
    return
  }

  const res = await window.electronAPI.exportMap(serializeTiledMap(tiledMap), mapToExport.name + '.json')
  if (res && res.error && res.error !== 'Canceled') {
    alert('Export failed: ' + res.error)
  }
}
