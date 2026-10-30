import { useCallback } from 'react'
import { Layer, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData, Pos } from '@/types/editor'
import { brushPaint, bucketFill, erase, rectangleFill, type TileMap } from '@/lib/paintOps'

interface UsePaintToolsProps {
  activeMap: MapData | null
  activeLayerId: string | null
  tileSelection: TileSelection | null
  activeTool: ActiveTool
  paintMode: PaintMode
  paintStartPos: Pos | null
  /** Latest layers, read synchronously so several paint calls in one tick compose. */
  getLayers: () => Layer[]
  setLayers: (layers: Layer[]) => void
  /** Record a history step for the current layers + entities (no arguments: the caller reads its own refs). */
  commitHistory: () => void
  setDebugInfo: (info: DebugInfo) => void
  setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
}

/** The active layer if it can be painted, otherwise the reason it cannot. */
function locatePaintableLayer(layers: Layer[], layerId: string) {
  const layerIndex = layers.findIndex(l => l.id === layerId)
  if (layerIndex === -1) return 'Layer not found'
  const layer = layers[layerIndex]
  if (layer.locked || !layer.visible) return 'Layer locked/hidden'
  return { layers, layerIndex, layer }
}

/**
 * Thin React wrapper around the pure operations in `lib/paintOps`:
 * validates the target layer, runs the op, then publishes the result once
 * (layers state, active map, optional history step). No side effects run inside React updaters.
 */
export function usePaintTools({
  activeMap,
  activeLayerId,
  tileSelection,
  activeTool,
  paintMode,
  paintStartPos,
  getLayers,
  setLayers,
  commitHistory,
  setDebugInfo,
  setActiveMap,
}: UsePaintToolsProps) {
  const mapWidth = activeMap?.width ?? 0
  const mapHeight = activeMap?.height ?? 0
  const hasMap = !!activeMap

  const publish = useCallback(
    (layers: Layer[], layerIndex: number, layer: Layer, data: TileMap, withHistory: boolean) => {
      const next = [...layers]
      next[layerIndex] = { ...layer, data }
      setLayers(next)
      setActiveMap(m => (m ? { ...m, layers: next } : m))
      if (withHistory) commitHistory()
    },
    [setLayers, setActiveMap, commitHistory]
  )

  const handlePaint = useCallback(
    (gridX: number, gridY: number) => {
      const time = Date.now()
      if (!hasMap) { setDebugInfo({ action: 'paint', error: 'No active map', time }); return }
      if (!activeLayerId) { setDebugInfo({ action: 'paint', error: 'No active layer', time }); return }
      if (activeTool === 'brush' && !tileSelection) { setDebugInfo({ action: 'paint', error: 'No tile selected', time }); return }
      if (gridX < 0 || gridX >= mapWidth || gridY < 0 || gridY >= mapHeight) {
        setDebugInfo({ action: 'paint', error: 'Out of bounds', x: gridX, y: gridY, time })
        return
      }

      const target = locatePaintableLayer(getLayers(), activeLayerId)
      if (typeof target === 'string') { setDebugInfo({ action: 'paint', error: target, time }); return }
      const { layers, layerIndex, layer } = target
      const size = { width: mapWidth, height: mapHeight }

      let data: TileMap | null = null
      if (activeTool === 'brush' && tileSelection) {
        data = brushPaint(layer.data, size, gridX, gridY, tileSelection, paintMode, paintStartPos)
      } else if (activeTool === 'eraser') {
        data = erase(layer.data, size, gridX, gridY)
        if (!data) {
          setDebugInfo({ action: 'erase', error: 'Already empty', x: gridX, y: gridY, time })
          return
        }
      }

      if (data) publish(layers, layerIndex, layer, data, false)
      setDebugInfo({ action: activeTool, error: 'Success', x: gridX, y: gridY, time })
    },
    [hasMap, mapWidth, mapHeight, activeLayerId, tileSelection, activeTool, paintMode, paintStartPos, getLayers, publish, setDebugInfo]
  )

  const handlePaintBucket = useCallback(
    (gridX: number, gridY: number) => {
      if (!hasMap || !activeLayerId || !tileSelection) return
      const target = locatePaintableLayer(getLayers(), activeLayerId)
      if (typeof target === 'string') return
      const { layers, layerIndex, layer } = target
      const data = bucketFill(layer.data, { width: mapWidth, height: mapHeight }, gridX, gridY, tileSelection, paintMode, paintStartPos)
      if (data) publish(layers, layerIndex, layer, data, true)
    },
    [hasMap, mapWidth, mapHeight, activeLayerId, tileSelection, paintMode, paintStartPos, getLayers, publish]
  )

  const handleRectangleFill = useCallback(
    (startPos: Pos, endPos: Pos) => {
      if (!hasMap || !activeLayerId || !tileSelection) return
      const target = locatePaintableLayer(getLayers(), activeLayerId)
      if (typeof target === 'string') return
      const { layers, layerIndex, layer } = target
      const data = rectangleFill(layer.data, { width: mapWidth, height: mapHeight }, startPos, endPos, tileSelection, paintMode)
      if (data) publish(layers, layerIndex, layer, data, true)
    },
    [hasMap, mapWidth, mapHeight, activeLayerId, tileSelection, paintMode, getLayers, publish]
  )

  return { handlePaint, handlePaintBucket, handleRectangleFill }
}
