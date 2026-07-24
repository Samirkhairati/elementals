import { Layer, MapData, TilesetData } from '@/types/editor'

export async function exportMap(
  mapToExportRaw: any,
  tilesets: TilesetData[],
  activeMap: MapData | null,
  layers: Layer[]
): Promise<void> {
  if (!window.electronAPI) return

  const mapToExport = (activeMap && mapToExportRaw.fileName === activeMap.fileName)
    ? { ...mapToExportRaw, layers }
    : mapToExportRaw

  const usedTilesets = new Set<string>()
  for (const layer of mapToExport.layers || []) {
    for (const tile of Object.values(layer.data || {}) as any[]) {
      usedTilesets.add(tile.tilesetId)
    }
  }

  const exportTilesets: any[] = []
  let currentGid = 1
  for (const tsId of usedTilesets) {
    const ts = tilesets.find(t => t.fileName === tsId)
    if (!ts) continue

    const dim = await new Promise<{ w: number; h: number }>(resolve => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve({ w: 0, h: 0 })
      img.src = ts.dataUrl
    })

    if (dim.w === 0 || dim.h === 0) continue

    const columns = Math.floor(dim.w / 32)
    const tilecount = columns * Math.floor(dim.h / 32)

    exportTilesets.push({
      columns,
      firstgid: currentGid,
      image: ts.fileName,
      imageheight: dim.h,
      imagewidth: dim.w,
      margin: 0,
      name: ts.name,
      spacing: 0,
      tilecount,
      tileheight: 32,
      tilewidth: 32,
    })

    currentGid += tilecount
  }

  const exportLayers = (mapToExport.layers || []).map((layer: any, index: number) => {
    const data = new Array(mapToExport.width * mapToExport.height).fill(0)

    for (const [indexStr, tile] of Object.entries(layer.data || {}) as any[]) {
      const idx = parseInt(indexStr)
      const tsExport = exportTilesets.find(t => t.name === tilesets.find(ts => ts.fileName === tile.tilesetId)?.name)
      if (tsExport) {
        const gid = tsExport.firstgid + (tile.y * tsExport.columns + tile.x)
        data[idx] = gid
      }
    }

    const exportLayer: any = {
      data,
      height: mapToExport.height,
      id: index + 1,
      name: layer.name,
      opacity: 1,
      type: layer.type === 'tile' ? 'tilelayer' : (layer.type === 'objects' ? 'objectgroup' : 'tilelayer'),
      visible: layer.visible,
      width: mapToExport.width,
      x: 0,
      y: 0,
    }

    const props: any[] = []
    if (layer.z !== undefined) {
      props.push({ name: 'z', type: 'int', value: Number(layer.z) })
    }
    if (props.length > 0) {
      exportLayer.properties = props
    }

    return exportLayer
  })

  const tiledMap = {
    compressionlevel: -1,
    height: mapToExport.height,
    infinite: false,
    layers: exportLayers,
    nextlayerid: exportLayers.length + 1,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 32,
    tilesets: exportTilesets,
    tilewidth: 32,
    type: 'map',
    version: '1.10',
    width: mapToExport.width,
  }

  const res = await window.electronAPI.exportMap(JSON.stringify(tiledMap, null, 2), mapToExport.name + '.json')
  if (res && res.error && res.error !== 'Canceled') {
    alert('Export failed: ' + res.error)
  }
}
