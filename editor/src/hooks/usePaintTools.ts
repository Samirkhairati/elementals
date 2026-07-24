import { Layer, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData, Pos } from '@/types/editor'

interface UsePaintToolsProps {
  activeMap: MapData | null
  activeLayerId: string | null
  tileSelection: TileSelection | null
  activeTool: ActiveTool
  paintMode: PaintMode
  paintStartPos: Pos | null
  setLayers: React.Dispatch<React.SetStateAction<Layer[]>>
  commitHistory: (layers: Layer[]) => void
  setDebugInfo: (info: DebugInfo) => void
  setActiveMap: (m: MapData) => void
}

export function usePaintTools({
  activeMap,
  activeLayerId,
  tileSelection,
  activeTool,
  paintMode,
  paintStartPos,
  setLayers,
  commitHistory,
  setDebugInfo,
  setActiveMap,
}: UsePaintToolsProps) {
  const handlePaint = (gridX: number, gridY: number) => {
    const time = Date.now()
    if (!activeMap) { setDebugInfo({ action: 'paint', error: 'No active map', time }); return }
    if (!activeLayerId) { setDebugInfo({ action: 'paint', error: 'No active layer', time }); return }
    if (activeTool === 'brush' && !tileSelection) { setDebugInfo({ action: 'paint', error: 'No tile selected', time }); return }
    if (gridX < 0 || gridX >= activeMap.width || gridY < 0 || gridY >= activeMap.height) {
      setDebugInfo({ action: 'paint', error: 'Out of bounds', x: gridX, y: gridY, time })
      return
    }

    setLayers(prevLayers => {
      const layerIndex = prevLayers.findIndex(l => l.id === activeLayerId)
      if (layerIndex === -1) { setDebugInfo({ action: 'paint', error: 'Layer not found', time }); return prevLayers }
      const layer = prevLayers[layerIndex]
      if (layer.locked || !layer.visible) { setDebugInfo({ action: 'paint', error: 'Layer locked/hidden', time }); return prevLayers }

      const tileIndex = gridY * activeMap.width + gridX
      const currentData = layer.data || {}
      let newData = { ...currentData }

      if (activeTool === 'brush' && tileSelection) {
        for (let dy = 0; dy < tileSelection.height; dy++) {
          for (let dx = 0; dx < tileSelection.width; dx++) {
            const targetX = gridX + dx
            const targetY = gridY + dy
            if (targetX < 0 || targetX >= activeMap.width || targetY < 0 || targetY >= activeMap.height) continue

            const tIndex = targetY * activeMap.width + targetX
            let sourceTile = null

            if (paintMode === 'continuous' && paintStartPos) {
              const offsetX = (targetX - paintStartPos.x) % tileSelection.width
              const offsetY = (targetY - paintStartPos.y) % tileSelection.height
              const srcX = offsetX >= 0 ? offsetX : tileSelection.width + offsetX
              const srcY = offsetY >= 0 ? offsetY : tileSelection.height + offsetY
              sourceTile = tileSelection.tiles[srcY * tileSelection.width + srcX]
            } else if (paintMode === 'random') {
              sourceTile = tileSelection.tiles[Math.floor(Math.random() * tileSelection.tiles.length)]
            } else {
              // discontinuous
              sourceTile = tileSelection.tiles[dy * tileSelection.width + dx]
            }

            if (sourceTile === null) {
              delete newData[tIndex]
            } else {
              newData[tIndex] = { tilesetId: sourceTile.tilesetId, x: sourceTile.x, y: sourceTile.y }
            }
          }
        }
      } else if (activeTool === 'eraser') {
        if (!newData[tileIndex]) {
          setDebugInfo({ action: 'erase', error: 'Already empty', x: gridX, y: gridY, time })
          return prevLayers // no change
        }
        delete newData[tileIndex]
      }

      const newLayers = [...prevLayers]
      newLayers[layerIndex] = { ...layer, data: newData }

      setDebugInfo({ action: activeTool, error: 'Success', x: gridX, y: gridY, time })

      // Also persist to backend
      if (activeMap) {
        const updatedMap = { ...activeMap, layers: newLayers }
        setActiveMap(updatedMap)
        window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
      }

      return newLayers
    })
  }

  const handlePaintBucket = (gridX: number, gridY: number) => {
    if (!activeMap || !activeLayerId || !tileSelection) return

    setLayers(prevLayers => {
      const layerIndex = prevLayers.findIndex(l => l.id === activeLayerId)
      if (layerIndex === -1) return prevLayers
      const layer = prevLayers[layerIndex]
      if (layer.locked || !layer.visible) return prevLayers

      const currentData = layer.data || {}
      let newData = { ...currentData }

      const startIndex = gridY * activeMap.width + gridX
      const targetTile = currentData[startIndex]

      // BFS flood fill
      const queue: Pos[] = [{ x: gridX, y: gridY }]
      const visited = new Set<number>()

      const getTileStr = (t: any) => t ? `${t.tilesetId}_${t.x}_${t.y}` : 'empty'
      const targetStr = getTileStr(targetTile)

      while (queue.length > 0) {
        const { x, y } = queue.shift()!
        const idx = y * activeMap.width + x

        if (visited.has(idx)) continue
        visited.add(idx)

        let sourceTile = null
        if (paintMode === 'continuous' && paintStartPos) {
          const offsetX = (x - paintStartPos.x) % tileSelection.width
          const offsetY = (y - paintStartPos.y) % tileSelection.height
          const srcX = offsetX >= 0 ? offsetX : tileSelection.width + offsetX
          const srcY = offsetY >= 0 ? offsetY : tileSelection.height + offsetY
          sourceTile = tileSelection.tiles[srcY * tileSelection.width + srcX]
        } else if (paintMode === 'random') {
          sourceTile = tileSelection.tiles[Math.floor(Math.random() * tileSelection.tiles.length)]
        } else {
          const rootX = paintStartPos ? paintStartPos.x : gridX
          const rootY = paintStartPos ? paintStartPos.y : gridY
          const offsetX = (x - rootX) % tileSelection.width
          const offsetY = (y - rootY) % tileSelection.height
          const srcX = offsetX >= 0 ? offsetX : tileSelection.width + offsetX
          const srcY = offsetY >= 0 ? offsetY : tileSelection.height + offsetY
          sourceTile = tileSelection.tiles[srcY * tileSelection.width + srcX]
        }

        if (sourceTile === null) {
          delete newData[idx]
        } else {
          newData[idx] = { tilesetId: sourceTile.tilesetId, x: sourceTile.x, y: sourceTile.y }
        }

        const neighbors = [
          { nx: x, ny: y - 1 }, { nx: x, ny: y + 1 },
          { nx: x - 1, ny: y }, { nx: x + 1, ny: y }
        ]
        for (const { nx, ny } of neighbors) {
          if (nx >= 0 && nx < activeMap.width && ny >= 0 && ny < activeMap.height) {
            const nIdx = ny * activeMap.width + nx
            if (!visited.has(nIdx) && getTileStr(currentData[nIdx]) === targetStr) {
              queue.push({ x: nx, y: ny })
            }
          }
        }
      }

      const newLayers = [...prevLayers]
      newLayers[layerIndex] = { ...layer, data: newData }
      commitHistory(newLayers)
      return newLayers
    })
  }

  const handleRectangleFill = (startPos: Pos, endPos: Pos) => {
    if (!activeMap || !activeLayerId || !tileSelection) return

    setLayers(prevLayers => {
      const layerIndex = prevLayers.findIndex(l => l.id === activeLayerId)
      if (layerIndex === -1) return prevLayers
      const layer = prevLayers[layerIndex]
      if (layer.locked || !layer.visible) return prevLayers

      const currentData = layer.data || {}
      let newData = { ...currentData }

      const minX = Math.max(0, Math.min(startPos.x, endPos.x))
      const minY = Math.max(0, Math.min(startPos.y, endPos.y))
      const maxX = Math.min(activeMap.width - 1, Math.max(startPos.x, endPos.x))
      const maxY = Math.min(activeMap.height - 1, Math.max(startPos.y, endPos.y))

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const idx = y * activeMap.width + x
          let sourceTile = null

          if (paintMode === 'continuous' || paintMode === 'discontinuous') {
            // For rectangle fill, continuous and discontinuous act identically anchoring to startPos
            const offsetX = (x - startPos.x) % tileSelection.width
            const offsetY = (y - startPos.y) % tileSelection.height
            const srcX = offsetX >= 0 ? offsetX : tileSelection.width + offsetX
            const srcY = offsetY >= 0 ? offsetY : tileSelection.height + offsetY
            sourceTile = tileSelection.tiles[srcY * tileSelection.width + srcX]
          } else if (paintMode === 'random') {
            sourceTile = tileSelection.tiles[Math.floor(Math.random() * tileSelection.tiles.length)]
          }

          if (sourceTile === null) {
            delete newData[idx]
          } else {
            newData[idx] = { tilesetId: sourceTile.tilesetId, x: sourceTile.x, y: sourceTile.y }
          }
        }
      }

      const newLayers = [...prevLayers]
      newLayers[layerIndex] = { ...layer, data: newData }
      commitHistory(newLayers)
      return newLayers
    })
  }

  return { handlePaint, handlePaintBucket, handleRectangleFill }
}
