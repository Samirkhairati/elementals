import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Group, Rect, Shape } from 'react-konva'
import type { CollisionShape, EntityData, Layer, ShapePoint } from '@/types/editor'
import { translatePoints } from '../../../../../../shared/collisionShapes'
import { colliderLocalRect, colliderPolygon, normalizeCollider } from '@/lib/entityVisuals'
import {
  alignmentGuides,
  closesAt,
  dedupePoints,
  hitEdge,
  hitShape,
  hitVertex,
  insertPoint,
  lockAxis,
  newShapeId,
  polygonColliderBox,
  rectCorners,
  removePoint,
  roundPoint,
  type Guide,
} from '@/lib/polygonEdit'
import { polygonEditStore, usePolygonEdit } from '@/lib/polygonEditStore'
import { setStageCursor } from '../canvasUtils'

/** Id of the one shape shown while an entity's polygon collider is edited. */
const COLLIDER_SHAPE_ID = '__collider__'
const FILL = 'rgba(239,68,68,0.22)'
const STROKE = 'rgba(239,68,68,0.95)'
const SELECTED = '#fbbf24'
const GUIDE_EXACT = '#22d3ee'
const GUIDE_NEAR = 'rgba(34,211,238,0.55)'

interface Props {
  layers: Layer[]
  activeLayerId: string | null
  entities: EntityData[]
  /** Editing is only on in the active map's canvas; other map tabs just draw the shapes. */
  enabled?: boolean
  /** An entity or a picture is being placed: clicks go to the placement, not to the shapes. */
  placing?: boolean
  /** Replaces the layer list (one undo step). */
  updateLayers?: (layers: Layer[]) => void
  updateComponentProps?: (entityId: string, type: 'Collider', props: Record<string, unknown>) => void
}

type Drag =
  | { kind: 'vertex'; shapeId: string; index: number; start: ShapePoint; moved: boolean }
  | { kind: 'shape'; shapeId: string; start: ShapePoint; moved: boolean }

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

/**
 * Collision shapes on the map: every visible polygon layer's shapes (and, while one is edited, an entity's polygon
 * collider), plus the editor for them. Active while a polygon layer is the active layer or Collider › Draw on map
 * is on: click to place points (Shift keeps the new edge horizontal or vertical), click the first point to close
 * the shape, double-click / Enter / right-click to finish an open line, Backspace removes the last point, Esc
 * cancels. Drag a point or a shape to move it, Alt+click a point to remove it, double-click an edge to add one,
 * Delete removes the picked shape. Guides show while a point lines up with another collider's points; nothing snaps.
 */
export const KonvaShapes = React.memo(function KonvaShapes({ layers, activeLayerId, entities, enabled = true, placing = false, updateLayers, updateComponentProps }: Props) {
  const { selectedShapeId, colliderEntityId } = usePolygonEdit()
  const groupRef = useRef<Konva.Group>(null)
  const [draft, setDraft] = useState<ShapePoint[]>([])
  const [pointer, setPointer] = useState<ShapePoint | null>(null)
  const [shiftDown, setShiftDown] = useState(false)
  // Shapes moved by a drag, shown until the drag ends and is committed.
  const [preview, setPreview] = useState<CollisionShape | null>(null)
  const drag = useRef<Drag | null>(null)
  // Space + drag pans the view (handled by the canvas), so it never places a point.
  const spaceDown = useRef(false)

  const colliderEntity = enabled && colliderEntityId ? entities.find((e) => e.id === colliderEntityId) ?? null : null
  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? null
  const layerMode = enabled && !colliderEntity && activeLayer?.type === 'polygons'
  const editable = colliderEntity !== null || (layerMode && !!activeLayer && activeLayer.visible && !activeLayer.locked)
  const active = !placing && (colliderEntity !== null || layerMode)

  // The collider mode ends when its entity goes away.
  useEffect(() => {
    if (enabled && colliderEntityId && !colliderEntity) polygonEditStore.set({ colliderEntityId: null })
  }, [enabled, colliderEntityId, colliderEntity])

  // A new target starts clean.
  const targetKey = colliderEntity ? `e:${colliderEntity.id}` : layerMode ? `l:${activeLayer?.id}` : ''
  useEffect(() => {
    setDraft([])
    setPreview(null)
    drag.current = null
    polygonEditStore.set({ selectedShapeId: null, drawing: false })
  }, [targetKey])

  useEffect(() => {
    polygonEditStore.set({ drawing: draft.length > 0 })
  }, [draft.length])

  /** The shapes being edited, in map pixels. */
  const shapes = useMemo<CollisionShape[]>(() => {
    if (colliderEntity) {
      const poly = colliderPolygon(colliderEntity.components.Collider)
      return poly.points ? [{ id: COLLIDER_SHAPE_ID, points: translatePoints(poly.points, colliderEntity.x, colliderEntity.y), closed: poly.closed !== false }] : []
    }
    return layerMode ? activeLayer?.shapes ?? [] : []
  }, [colliderEntity, layerMode, activeLayer])
  const shown = useMemo(() => (preview ? shapes.map((s) => (s.id === preview.id ? preview : s)) : shapes), [shapes, preview])

  /** Every collider point on the map, for the guides. */
  const anchors = useMemo<ShapePoint[]>(() => {
    const out: ShapePoint[] = []
    for (const l of layers) if (l.type === 'polygons' && l.visible) for (const s of l.shapes ?? []) out.push(...s.points)
    for (const e of entities) {
      const c = e.components.Collider
      if (!c) continue
      const poly = colliderPolygon(c)
      if (poly.points) out.push(...translatePoints(poly.points, e.x, e.y))
      else {
        const r = colliderLocalRect(normalizeCollider(c))
        out.push(...rectCorners({ ...r, x: r.x + e.x, y: r.y + e.y }))
      }
    }
    return out
  }, [layers, entities])

  const commit = useCallback(
    (next: CollisionShape[]) => {
      if (colliderEntity) {
        const shape = next[0]
        if (!shape) {
          updateComponentProps?.(colliderEntity.id, 'Collider', { shape: undefined, points: undefined, closed: undefined })
          return
        }
        const points = translatePoints(shape.points, -colliderEntity.x, -colliderEntity.y)
        updateComponentProps?.(colliderEntity.id, 'Collider', { shape: 'polygon', points, closed: shape.closed, ...polygonColliderBox(points) })
        return
      }
      if (!activeLayer) return
      updateLayers?.(layers.map((l) => (l.id === activeLayer.id ? { ...l, shapes: next } : l)))
    },
    [colliderEntity, activeLayer, layers, updateLayers, updateComponentProps]
  )

  const finish = useCallback(
    (closed: boolean, points: ShapePoint[] = draft) => {
      const pts = dedupePoints(points)
      setDraft([])
      if (pts.length < (closed ? 3 : 2)) return
      const shape: CollisionShape = { id: colliderEntity ? COLLIDER_SHAPE_ID : newShapeId(), points: pts, closed }
      // An entity has one collider: a new polygon replaces the old one.
      commit(colliderEntity ? [shape] : [...shapes, shape])
      polygonEditStore.set({ selectedShapeId: shape.id })
    },
    [draft, colliderEntity, shapes, commit]
  )

  const scale = () => groupRef.current?.getStage()?.scaleX() || 1
  const worldPointer = (): ShapePoint | null => {
    const p = groupRef.current?.getRelativePointerPosition()
    return p ? { x: p.x, y: p.y } : null
  }
  /** Where a click / drag puts a point: whole pixels, Shift-locked to the axis through `from`. */
  const placeAt = (raw: ShapePoint, shift: boolean, from: ShapePoint | null) => roundPoint(shift && from ? lockAxis(from, raw) : raw)

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const raw = worldPointer()
    if (!raw || !editable) return
    const s = scale()
    const tol = 6 / s
    if (e.evt.button === 2) {
      if (draft.length) finish(false)
      return
    }
    if (e.evt.button !== 0 || spaceDown.current) return
    if (draft.length) {
      const p = placeAt(raw, e.evt.shiftKey, draft[draft.length - 1])
      if (closesAt(draft, raw, 8 / s)) finish(true)
      else setDraft([...draft, p])
      return
    }
    const v = hitVertex(shapes, raw, tol)
    if (v) {
      const shape = shapes.find((x) => x.id === v.shapeId)!
      if (e.evt.altKey) {
        const next = removePoint(shape, v.index)
        commit(next ? shapes.map((x) => (x.id === shape.id ? next : x)) : shapes.filter((x) => x.id !== shape.id))
        return
      }
      polygonEditStore.set({ selectedShapeId: shape.id })
      drag.current = { kind: 'vertex', shapeId: shape.id, index: v.index, start: shape.points[v.index], moved: false }
      return
    }
    const hit = hitShape(shapes, raw, tol)
    if (hit) {
      polygonEditStore.set({ selectedShapeId: hit })
      drag.current = { kind: 'shape', shapeId: hit, start: raw, moved: false }
      return
    }
    if (selectedShapeId) {
      polygonEditStore.set({ selectedShapeId: null })
      return
    }
    setDraft([roundPoint(raw)])
  }

  const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const raw = worldPointer()
    if (!raw) return
    setPointer(raw)
    setShiftDown(e.evt.shiftKey)
    const d = drag.current
    if (!d) return
    const shape = shapes.find((x) => x.id === d.shapeId)
    if (!shape) return
    if (d.kind === 'vertex') {
      const p = placeAt(raw, e.evt.shiftKey, d.start)
      if (!d.moved && p.x === d.start.x && p.y === d.start.y) return
      d.moved = true
      setPreview({ ...shape, points: shape.points.map((q, i) => (i === d.index ? p : q)) })
    } else {
      const to = placeAt(raw, e.evt.shiftKey, d.start)
      const dx = Math.round(to.x - d.start.x)
      const dy = Math.round(to.y - d.start.y)
      if (!d.moved && dx === 0 && dy === 0) return
      d.moved = true
      setPreview({ ...shape, points: translatePoints(shape.points, dx, dy) })
    }
  }

  // A drag ends wherever the mouse is let go.
  useEffect(() => {
    if (!active) return
    const up = () => {
      const d = drag.current
      drag.current = null
      if (d?.moved && preview) commit(shapes.map((s) => (s.id === preview.id ? preview : s)))
      setPreview(null)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [active, preview, shapes, commit])

  const onDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!editable || e.evt.button !== 0) return
    if (draft.length) {
      // Konva reports two quick clicks anywhere as a double-click: only finish when both landed on the same spot
      // (otherwise fast clicking would end the line early).
      const a = draft[draft.length - 1]
      const b = draft[draft.length - 2]
      if (b && Math.hypot(a.x - b.x, a.y - b.y) <= 4 / scale()) finish(false)
      return
    }
    const raw = worldPointer()
    if (!raw) return
    const edge = hitEdge(shapes, raw, 6 / scale())
    if (!edge || hitVertex(shapes, raw, 6 / scale())) return
    const shape = shapes.find((x) => x.id === edge.shapeId)!
    commit(shapes.map((x) => (x.id === shape.id ? insertPoint(shape, edge.index, roundPoint(raw)) : x)))
  }

  // Keys while the editor is active (before the editor's own shortcuts, which would act on layers or entities).
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftDown(e.type === 'keydown')
      if (e.key === ' ') spaceDown.current = e.type === 'keydown'
      if (e.type !== 'keydown' || isTyping(e.target)) return
      let handled = true
      if (draft.length && e.key === 'Enter') finish(false)
      else if (draft.length && e.key === 'Escape') setDraft([])
      else if (draft.length && e.key === 'Backspace') setDraft(draft.slice(0, -1))
      else if (!draft.length && selectedShapeId && editable && (e.key === 'Delete' || e.key === 'Backspace')) {
        commit(shapes.filter((s) => s.id !== selectedShapeId))
        polygonEditStore.set({ selectedShapeId: null })
      } else if (!draft.length && e.key === 'Escape' && selectedShapeId) polygonEditStore.set({ selectedShapeId: null })
      else if (!draft.length && e.key === 'Escape' && colliderEntity) polygonEditStore.set({ colliderEntityId: null })
      else handled = false
      if (handled) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
    }
  }, [active, draft, selectedShapeId, editable, shapes, commit, finish, colliderEntity])

  // The point the guides are for: the dragged point, or where the next click would put one.
  const d = drag.current
  const live: ShapePoint | null =
    d?.kind === 'vertex' && preview ? preview.points[d.index] : draft.length && pointer ? placeAt(pointer, shiftDown, draft[draft.length - 1]) : null
  const guides = useMemo<Guide[]>(() => {
    if (!live) return []
    const own = d?.kind === 'vertex' ? d.start : null
    const pool = [...anchors.filter((a) => !own || a.x !== own.x || a.y !== own.y), ...draft]
    return alignmentGuides(pool, live, 5 / (groupRef.current?.getStage()?.scaleX() || 1))
  }, [live?.x, live?.y, anchors, draft, d]) // eslint-disable-line react-hooks/exhaustive-deps

  const otherLayers = useMemo(() => layers.filter((l) => l.type === 'polygons' && l.visible && (colliderEntity || l.id !== activeLayerId)), [layers, activeLayerId, colliderEntity])
  const closable = draft.length >= 3 && pointer !== null && closesAt(draft, pointer, 8 / (groupRef.current?.getStage()?.scaleX() || 1))

  return (
    <Group ref={groupRef}>
      <Shape
        listening={false}
        perfectDrawEnabled={false}
        sceneFunc={(context, node) => {
          const ctx = context._context as CanvasRenderingContext2D
          const s = node.getStage()?.scaleX() || 1
          const path = (pts: readonly ShapePoint[], closed: boolean) => {
            ctx.beginPath()
            pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
            if (closed) ctx.closePath()
          }
          const drawShape = (shape: CollisionShape, alpha: number, selected: boolean) => {
            ctx.save()
            ctx.globalAlpha = alpha
            path(shape.points, shape.closed)
            if (shape.closed) {
              ctx.fillStyle = FILL
              ctx.fill()
            }
            ctx.lineWidth = (shape.closed ? 1.5 : 2.5) / s
            ctx.strokeStyle = selected ? SELECTED : STROKE
            ctx.stroke()
            ctx.restore()
          }
          const handle = (p: ShapePoint, size: number, fill: string) => {
            const h = size / s
            ctx.fillStyle = fill
            ctx.fillRect(p.x - h / 2, p.y - h / 2, h, h)
            ctx.lineWidth = 1 / s
            ctx.strokeStyle = 'rgba(0,0,0,0.8)'
            ctx.strokeRect(p.x - h / 2, p.y - h / 2, h, h)
          }

          for (const l of otherLayers) for (const shape of l.shapes ?? []) drawShape(shape, active ? 0.45 : 1, false)
          for (const shape of layerMode && !activeLayer?.visible ? [] : shown) {
            const sel = shape.id === selectedShapeId
            drawShape(shape, 1, sel)
            if (active) for (const p of shape.points) handle(p, sel ? 7 : 5, sel ? SELECTED : '#fff')
          }

          // The shape being drawn and the edge to the pointer.
          if (draft.length) {
            ctx.save()
            path(draft, false)
            ctx.lineWidth = 2 / s
            ctx.strokeStyle = SELECTED
            ctx.stroke()
            if (live) {
              ctx.beginPath()
              ctx.moveTo(draft[draft.length - 1].x, draft[draft.length - 1].y)
              ctx.lineTo(closable ? draft[0].x : live.x, closable ? draft[0].y : live.y)
              ctx.setLineDash([6 / s, 4 / s])
              ctx.stroke()
            }
            ctx.restore()
            draft.forEach((p, i) => handle(p, i === 0 ? (closable ? 11 : 8) : 6, i === 0 ? (closable ? '#4ade80' : SELECTED) : '#fff'))
          }

          // Alignment guides: from the collider point to the live point, solid when exactly in line.
          for (const g of guides) {
            if (!live) break
            ctx.save()
            ctx.beginPath()
            const pad = 24 / s
            if (g.axis === 'x') {
              ctx.moveTo(g.value, Math.min(g.from.y, live.y) - pad)
              ctx.lineTo(g.value, Math.max(g.from.y, live.y) + pad)
            } else {
              ctx.moveTo(Math.min(g.from.x, live.x) - pad, g.value)
              ctx.lineTo(Math.max(g.from.x, live.x) + pad, g.value)
            }
            ctx.lineWidth = 1 / s
            ctx.strokeStyle = g.exact ? GUIDE_EXACT : GUIDE_NEAR
            if (!g.exact) ctx.setLineDash([4 / s, 3 / s])
            ctx.stroke()
            ctx.restore()
            const m = 4 / s
            ctx.beginPath()
            ctx.moveTo(g.from.x - m, g.from.y - m)
            ctx.lineTo(g.from.x + m, g.from.y + m)
            ctx.moveTo(g.from.x + m, g.from.y - m)
            ctx.lineTo(g.from.x - m, g.from.y + m)
            ctx.lineWidth = 1.5 / s
            ctx.strokeStyle = g.exact ? GUIDE_EXACT : GUIDE_NEAR
            ctx.stroke()
          }
        }}
      />
      {/* Takes every click on the map while the shape editor is on (panning with the middle button / Space still works). */}
      {active && (
        <Rect
          name="shape-editor"
          x={-100000}
          y={-100000}
          width={200000}
          height={200000}
          fill="rgba(0,0,0,0)"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onDblClick={onDblClick}
          onMouseEnter={(e) => setStageCursor(e.target.getStage(), 'crosshair')}
          onMouseLeave={(e) => {
            setPointer(null)
            setStageCursor(e.target.getStage(), '')
          }}
        />
      )}
    </Group>
  )
})
