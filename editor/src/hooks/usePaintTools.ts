import { useCallback } from 'react'
import { TileSelection, ActiveTool, PaintMode, DebugInfo, MapData, Pos } from '@/types/editor'
import { brushPaint, bucketFill, cellsOnLine, erase, fillCells, floodRegion, rectangleFill, type TileMap } from '@/lib/paintOps'
import { fitSelectionToLayer, partSelection, targetLayerIndex } from '@/lib/layerSelection'
import { paintCollision } from '@/lib/sceneOps'
import { lockedNode, shown, type SceneIndex } from '@/lib/sceneIndex'
import { polygonEditStore } from '@/lib/polygonEditStore'
import { isDataLayer, updateNode, type DataLayerNode, type SceneNode } from '../../../shared/sceneTree'

const COLLISION_MARKER: TileSelection = { width: 1, height: 1, tiles: [{ tilesetId: '__collision__', x: 0, y: 0 }] }

/** What a layer paints with: a collision layer always takes the collision marker (fitted from the selection, or the marker itself). */
function selectionFor(layer: DataLayerNode, selection: TileSelection | null): TileSelection | null {
  if (layer.type === 'collision') return (selection && fitSelectionToLayer('collision', selection)) || COLLISION_MARKER
  return selection && fitSelectionToLayer(layer.type, selection)
}

/**
 * The layer with its newly painted data. On a collision layer the new cells join the picked tiles item of the Collision
 * panel; with none picked (or a shape picked) a new tiles item is made and picked, so every painted tile is in an item.
 */
export function withPaintedData(layer: DataLayerNode, data: TileMap): DataLayerNode {
  if (layer.type !== 'collision') return { ...layer, data }
  const painted = paintCollision(layer, data, polygonEditStore.get().selectedShapeId, () => crypto.randomUUID())
  if (painted.created && painted.tilesId) polygonEditStore.set({ selectedShapeId: painted.tilesId, brush: 'tiles' })
  return painted.layer
}

interface UsePaintToolsProps {
  activeMap: MapData | null
  activeLayerId: string | null
  tileSelection: TileSelection | null
  /** Pinned: a multi-layer selection paints into every layer it was sampled from. */
  pinSelection?: boolean
  activeTool: ActiveTool
  paintMode: PaintMode
  paintStartPos: Pos | null
  /** The latest scene tree index, read synchronously so several paint calls in one tick compose. */
  getIndex: () => SceneIndex
  /** Changes the tree: with a history step (`commit`) or without one (`commitView`, a stroke in progress). */
  commit: (updater: (prev: SceneNode[]) => SceneNode[]) => void
  commitView: (updater: (prev: SceneNode[]) => SceneNode[]) => void
  setDebugInfo: (info: DebugInfo) => void
}

/** The active layer if it can be painted, otherwise the reason it cannot. */
function locatePaintableLayer(index: SceneIndex, layerId: string): string | DataLayerNode {
  const node = index.byId.get(layerId)?.node
  if (!node) return 'Layer not found'
  if (node.type === 'group' || node.type === 'ySort') return 'Node hold nodes, not tiles'
  if (!isDataLayer(node)) return 'Only layers can be painted'
  if (lockedNode(index, layerId) || !shown(index, layerId)) return 'Layer locked/hidden'
  return node
}

interface MultiTarget {
  layer: DataLayerNode
  selection: TileSelection
}

/** The paintable layers of a multi-layer selection, each with the cells it contributed. */
function multiTargets(index: SceneIndex, selection: TileSelection): MultiTarget[] {
  const seen = new Set<string>()
  const targets: MultiTarget[] = []
  for (const part of selection.layers || []) {
    const at = targetLayerIndex(index.layers, part)
    if (at === -1) continue
    const layer = index.layers[at]
    if (seen.has(layer.id) || !isDataLayer(layer) || locatePaintableLayer(index, layer.id) === 'Layer locked/hidden') continue
    seen.add(layer.id)
    targets.push({ layer, selection: partSelection(selection, part) })
  }
  return targets
}

/**
 * Thin React wrapper around the pure operations in `lib/paintOps`:
 * validates the target layer, runs the op, then publishes the result once
 * (tree change, optional history step). No side effects run inside React updaters.
 */
export function usePaintTools({
  activeMap,
  activeLayerId,
  tileSelection,
  pinSelection = false,
  activeTool,
  paintMode,
  paintStartPos,
  getIndex,
  commit,
  commitView,
  setDebugInfo,
}: UsePaintToolsProps) {
  const mapWidth = activeMap?.width ?? 0
  const mapHeight = activeMap?.height ?? 0
  const hasMap = !!activeMap
  const size = { width: mapWidth, height: mapHeight }

  const isMulti = pinSelection && !!tileSelection?.layers && tileSelection.layers.length > 1
  // Several layers painted at once stay in step: per-cell randomness would give each layer a different pick.
  const multiMode: PaintMode = paintMode === 'random' ? 'discontinuous' : paintMode

  const publishMany = useCallback(
    (updates: Map<string, TileMap>, withHistory: boolean) => {
      const apply = (prev: SceneNode[]) => {
        let next = prev
        for (const [id, data] of updates) next = updateNode(next, id, (n) => (isDataLayer(n) ? withPaintedData(n, data) : n))
        return next
      }
      if (withHistory) commit(apply)
      else commitView(apply)
    },
    [commit, commitView]
  )

  const publish = useCallback((layerId: string, data: TileMap, withHistory: boolean) => publishMany(new Map([[layerId, data]]), withHistory), [publishMany])

  /**
   * Paints (brush) or erases the cell (gridX, gridY); with `from` (the cell the stroke was at before this mouse move), every
   * cell on the way too, in one change. Success is not reported to the debug info: a stroke would re-render on every cell.
   */
  const handlePaint = useCallback(
    (gridX: number, gridY: number, from?: { x: number; y: number }) => {
      const time = Date.now()
      if (!hasMap) { setDebugInfo({ action: 'paint', error: 'No active map', time }); return }
      if (!activeLayerId) { setDebugInfo({ action: 'paint', error: 'No active layer', time }); return }
      const activeIsCollision = getIndex().byId.get(activeLayerId)?.node.type === 'collision'
      if (activeTool === 'brush' && !tileSelection && !activeIsCollision) { setDebugInfo({ action: 'paint', error: 'No tile selected', time }); return }
      if (gridX < 0 || gridX >= mapWidth || gridY < 0 || gridY >= mapHeight) {
        setDebugInfo({ action: 'paint', error: 'Out of bounds', x: gridX, y: gridY, time })
        return
      }

      const cells = from ? cellsOnLine(from.x, from.y, gridX, gridY).slice(1) : [{ x: gridX, y: gridY }]
      // Each cell of the stroke applied to the data in turn; null when nothing changed.
      const stroke = (start: TileMap | undefined, one: (data: TileMap | undefined, x: number, y: number) => TileMap | null): TileMap | null => {
        let data = start
        let changed = false
        for (const c of cells) {
          const next = one(data, c.x, c.y)
          if (next && next !== data) {
            data = next
            changed = true
          }
        }
        return changed && data ? data : null
      }

      if (isMulti && tileSelection) {
        const targets = multiTargets(getIndex(), tileSelection)
        if (targets.length === 0) { setDebugInfo({ action: 'paint', error: 'No paintable layer in the selection', time }); return }
        const updates = new Map<string, TileMap>()
        for (const t of targets) {
          const data =
            activeTool === 'brush'
              ? stroke(t.layer.data, (d, x, y) => brushPaint(d, size, x, y, t.selection, multiMode, paintStartPos))
              : activeTool === 'eraser'
                ? stroke(t.layer.data, (d, x, y) => erase(d, size, x, y))
                : null
          if (data) updates.set(t.layer.id, data)
        }
        if (updates.size > 0) publishMany(updates, false)
        return
      }

      const layer = locatePaintableLayer(getIndex(), activeLayerId)
      if (typeof layer === 'string') { setDebugInfo({ action: 'paint', error: layer, time }); return }

      let data: TileMap | null = null
      if (activeTool === 'brush') {
        const fitted = selectionFor(layer, tileSelection)
        if (!fitted) { setDebugInfo({ action: 'paint', error: 'Pick a tile for this layer', time }); return }
        data = stroke(layer.data, (d, x, y) => brushPaint(d, size, x, y, fitted, paintMode, paintStartPos))
      } else if (activeTool === 'eraser') {
        data = stroke(layer.data, (d, x, y) => erase(d, size, x, y))
        if (!data) return
      }

      if (data) publish(layer.id, data, false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMap, mapWidth, mapHeight, activeLayerId, tileSelection, activeTool, paintMode, paintStartPos, isMulti, multiMode, getIndex, publish, publishMany, setDebugInfo]
  )

  const handlePaintBucket = useCallback(
    (gridX: number, gridY: number) => {
      if (!hasMap || !activeLayerId) return

      if (isMulti && tileSelection) {
        const targets = multiTargets(getIndex(), tileSelection)
        // The region is decided on the active layer (or the first one in the selection) and filled on all of them.
        const primary = targets.find((t) => t.layer.id === activeLayerId) ?? targets[0]
        if (!primary) return
        const region = floodRegion(primary.layer.data, size, gridX, gridY)
        if (!region) return
        const anchor = paintStartPos ?? { x: gridX, y: gridY }
        const updates = new Map<string, TileMap>()
        for (const t of targets) {
          const data = fillCells(t.layer.data, size, region, t.selection, multiMode, anchor)
          if (data) updates.set(t.layer.id, data)
        }
        if (updates.size > 0) publishMany(updates, true)
        return
      }

      const layer = locatePaintableLayer(getIndex(), activeLayerId)
      if (typeof layer === 'string') return
      const fitted = selectionFor(layer, tileSelection)
      if (!fitted) return
      const data = bucketFill(layer.data, size, gridX, gridY, fitted, paintMode, paintStartPos)
      if (data) publish(layer.id, data, true)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMap, mapWidth, mapHeight, activeLayerId, tileSelection, paintMode, paintStartPos, isMulti, multiMode, getIndex, publish, publishMany]
  )

  const handleRectangleFill = useCallback(
    (startPos: Pos, endPos: Pos) => {
      if (!hasMap || !activeLayerId) return

      if (isMulti && tileSelection) {
        const updates = new Map<string, TileMap>()
        for (const t of multiTargets(getIndex(), tileSelection)) {
          const data = rectangleFill(t.layer.data, size, startPos, endPos, t.selection, multiMode)
          if (data) updates.set(t.layer.id, data)
        }
        if (updates.size > 0) publishMany(updates, true)
        return
      }

      const layer = locatePaintableLayer(getIndex(), activeLayerId)
      if (typeof layer === 'string') return
      const fitted = selectionFor(layer, tileSelection)
      if (!fitted) return
      const data = rectangleFill(layer.data, size, startPos, endPos, fitted, paintMode)
      if (data) publish(layer.id, data, true)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMap, mapWidth, mapHeight, activeLayerId, tileSelection, paintMode, isMulti, multiMode, getIndex, publish, publishMany]
  )

  return { handlePaint, handlePaintBucket, handleRectangleFill }
}
