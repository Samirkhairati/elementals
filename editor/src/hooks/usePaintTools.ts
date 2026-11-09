import { useCallback } from 'react'
import { Layer, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData, Pos } from '@/types/editor'
import { brushPaint, bucketFill, erase, fillCells, floodRegion, rectangleFill, type TileMap } from '@/lib/paintOps'
import { fitSelectionToLayer, partSelection, targetLayerIndex } from '@/lib/layerSelection'

interface UsePaintToolsProps {
  activeMap: MapData | null
  activeLayerId: string | null
  tileSelection: TileSelection | null
  /** Pinned: a multi-layer selection paints into every layer it was sampled from. */
  pinSelection?: boolean
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
  if (layer.type === 'image') return 'Image layers hold images, not tiles'
  if (layer.type === 'polygons') return 'Collision shape layers hold shapes, not tiles'
  if (layer.type === 'folder') return 'Folders hold layers, not tiles'
  if (layer.locked || !layer.visible) return 'Layer locked/hidden'
  return { layers, layerIndex, layer }
}

interface MultiTarget {
  layerIndex: number
  layer: Layer
  selection: TileSelection
}

/** The paintable layers of a multi-layer selection, each with the cells it contributed. */
function multiTargets(layers: Layer[], selection: TileSelection): MultiTarget[] {
  const seen = new Set<number>()
  const targets: MultiTarget[] = []
  for (const part of selection.layers || []) {
    const layerIndex = targetLayerIndex(layers, part)
    if (layerIndex === -1 || seen.has(layerIndex)) continue
    const layer = layers[layerIndex]
    if (layer.type === 'image' || layer.type === 'polygons' || layer.type === 'folder' || layer.locked || !layer.visible) continue
    seen.add(layerIndex)
    targets.push({ layerIndex, layer, selection: partSelection(selection, part) })
  }
  return targets
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
  pinSelection = false,
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
  const size = { width: mapWidth, height: mapHeight }

  const isMulti = pinSelection && !!tileSelection?.layers && tileSelection.layers.length > 1
  // Several layers painted at once stay in step: per-cell randomness would give each layer a different pick.
  const multiMode: PaintMode = paintMode === 'random' ? 'discontinuous' : paintMode

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

  const publishMany = useCallback(
    (layers: Layer[], updates: Map<number, TileMap>, withHistory: boolean) => {
      const next = layers.map((layer, index) => (updates.has(index) ? { ...layer, data: updates.get(index) } : layer))
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

      if (isMulti && tileSelection) {
        const layers = getLayers()
        const targets = multiTargets(layers, tileSelection)
        if (targets.length === 0) { setDebugInfo({ action: 'paint', error: 'No paintable layer in the selection', time }); return }
        const updates = new Map<number, TileMap>()
        for (const t of targets) {
          const data =
            activeTool === 'brush'
              ? brushPaint(t.layer.data, size, gridX, gridY, t.selection, multiMode, paintStartPos)
              : activeTool === 'eraser'
                ? erase(t.layer.data, size, gridX, gridY)
                : null
          if (data) updates.set(t.layerIndex, data)
        }
        if (updates.size > 0) publishMany(layers, updates, false)
        setDebugInfo({ action: activeTool, error: 'Success', x: gridX, y: gridY, time })
        return
      }

      const target = locatePaintableLayer(getLayers(), activeLayerId)
      if (typeof target === 'string') { setDebugInfo({ action: 'paint', error: target, time }); return }
      const { layers, layerIndex, layer } = target

      let data: TileMap | null = null
      if (activeTool === 'brush' && tileSelection) {
        const fitted = fitSelectionToLayer(layer.type, tileSelection)
        if (!fitted) { setDebugInfo({ action: 'paint', error: 'Pick a tile for this layer', time }); return }
        data = brushPaint(layer.data, size, gridX, gridY, fitted, paintMode, paintStartPos)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMap, mapWidth, mapHeight, activeLayerId, tileSelection, activeTool, paintMode, paintStartPos, isMulti, multiMode, getLayers, publish, publishMany, setDebugInfo]
  )

  const handlePaintBucket = useCallback(
    (gridX: number, gridY: number) => {
      if (!hasMap || !activeLayerId || !tileSelection) return

      if (isMulti) {
        const layers = getLayers()
        const targets = multiTargets(layers, tileSelection)
        // The region is decided on the active layer (or the first one in the selection) and filled on all of them.
        const primary = targets.find(t => t.layer.id === activeLayerId) ?? targets[0]
        if (!primary) return
        const region = floodRegion(primary.layer.data, size, gridX, gridY)
        if (!region) return
        const anchor = paintStartPos ?? { x: gridX, y: gridY }
        const updates = new Map<number, TileMap>()
        for (const t of targets) {
          const data = fillCells(t.layer.data, size, region, t.selection, multiMode, anchor)
          if (data) updates.set(t.layerIndex, data)
        }
        if (updates.size > 0) publishMany(layers, updates, true)
        return
      }

      const target = locatePaintableLayer(getLayers(), activeLayerId)
      if (typeof target === 'string') return
      const { layers, layerIndex, layer } = target
      const fitted = fitSelectionToLayer(layer.type, tileSelection)
      if (!fitted) return
      const data = bucketFill(layer.data, size, gridX, gridY, fitted, paintMode, paintStartPos)
      if (data) publish(layers, layerIndex, layer, data, true)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMap, mapWidth, mapHeight, activeLayerId, tileSelection, paintMode, paintStartPos, isMulti, multiMode, getLayers, publish, publishMany]
  )

  const handleRectangleFill = useCallback(
    (startPos: Pos, endPos: Pos) => {
      if (!hasMap || !activeLayerId || !tileSelection) return

      if (isMulti) {
        const layers = getLayers()
        const updates = new Map<number, TileMap>()
        for (const t of multiTargets(layers, tileSelection)) {
          const data = rectangleFill(t.layer.data, size, startPos, endPos, t.selection, multiMode)
          if (data) updates.set(t.layerIndex, data)
        }
        if (updates.size > 0) publishMany(layers, updates, true)
        return
      }

      const target = locatePaintableLayer(getLayers(), activeLayerId)
      if (typeof target === 'string') return
      const { layers, layerIndex, layer } = target
      const fitted = fitSelectionToLayer(layer.type, tileSelection)
      if (!fitted) return
      const data = rectangleFill(layer.data, size, startPos, endPos, fitted, paintMode)
      if (data) publish(layers, layerIndex, layer, data, true)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMap, mapWidth, mapHeight, activeLayerId, tileSelection, paintMode, isMulti, multiMode, getLayers, publish, publishMany]
  )

  return { handlePaint, handlePaintBucket, handleRectangleFill }
}
