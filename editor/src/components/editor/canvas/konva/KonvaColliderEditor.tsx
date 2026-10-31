// Area editing on the canvas for the selected entity (its collider, or the tile it stands on when it has none):
//  * always: 8 resize handles on the area (corners + edges); resizing an entity without a Collider creates one,
//  * Collider tool (C): drag the body to move it, drag on empty ground to draw a new one,
//  * everything snaps to 4px (Shift = free, Alt = from the centre), Escape cancels, Enter commits,
//  * ONE change is reported per gesture (so one undo step).

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Rect as KonvaRect, Shape } from 'react-konva'
import Konva from 'konva'
import type { PropBag } from '@/types/editor'
import {
  COLLIDER_SNAP,
  HANDLES,
  colliderWorldRect,
  formatColliderRect,
  handleCursor,
  handlePoint,
  hitTestCollider,
  moveRect,
  rectFromDrag,
  rectToColliderProps,
  resizeRect,
  sameCollider,
  normalizeCollider,
  type ColliderPatch,
  type Handle,
  type Point,
  type Rect,
} from '@/lib/entityVisuals'
import { drawFootprint, drawHandle, drawReadout } from './entityDraw'
import { setStageCursor } from '../canvasUtils'

export interface ColliderEditEntity {
  id: string
  x: number
  y: number
  collider: PropBag | undefined
}

interface Gesture {
  kind: 'draw' | 'resize' | 'move'
  handle?: Handle
  startWorld: Point
  startRect: Rect
  rect: Rect
}

interface KonvaColliderEditorProps {
  entity: ColliderEditEntity | null
  /** Collider tool active: body drag + drawing on empty ground. */
  toolActive: boolean
  /** `r,g,b` of the overlay tint the area is drawn in. */
  rgb: string
  mapWidthPx: number
  mapHeightPx: number
  /** Called once per finished gesture. `isSolid` is only set when a new collider is created. */
  onCommit: (entityId: string, patch: ColliderPatch & { isSolid?: boolean }) => void
  /** Written while a gesture runs so the overlay can skip the selected entity's own footprint. */
  liveRef: React.MutableRefObject<Rect | null>
}

function clientToWorld(stage: Konva.Stage, clientX: number, clientY: number): Point {
  const box = stage.container().getBoundingClientRect()
  const s = stage.scaleX() || 1
  return { x: (clientX - box.left - stage.x()) / s, y: (clientY - box.top - stage.y()) / s }
}

export function KonvaColliderEditor({ entity, toolActive, rgb, mapWidthPx, mapHeightPx, onCommit, liveRef }: KonvaColliderEditorProps) {
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  // An entity without a Collider is edited as its tile (the defaults of a new collider).
  const hasCollider = !!entity?.collider
  const collider = entity ? normalizeCollider(entity.collider) : null
  const rect = entity && collider ? colliderWorldRect(entity.x, entity.y, collider) : null

  const finish = useCallback(
    (commit: boolean) => {
      const g = gestureRef.current
      cleanupRef.current?.()
      cleanupRef.current = null
      gestureRef.current = null
      liveRef.current = null
      setGesture(null)
      if (!commit || !g || !entity) return
      const patch = rectToColliderProps(g.rect, { x: entity.x, y: entity.y })
      const prev = collider ? { width: collider.width, height: collider.height, offsetX: collider.offsetX, offsetY: collider.offsetY } : null
      if (prev && sameCollider(prev, patch)) return
      onCommit(entity.id, hasCollider ? patch : { ...patch, isSolid: true })
    },
    [entity, collider, hasCollider, onCommit, liveRef],
  )

  useEffect(() => () => cleanupRef.current?.(), [])

  // A different entity (or none) selected mid-gesture: drop it.
  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  })
  const entityId = entity?.id ?? null
  useEffect(() => {
    if (gestureRef.current) finishRef.current(false)
  }, [entityId])

  const begin = useCallback(
    (stage: Konva.Stage, g: Gesture, e: MouseEvent | { clientX: number; clientY: number }) => {
      void e
      cleanupRef.current?.()
      gestureRef.current = g
      liveRef.current = g.rect
      setGesture(g)

      const compute = (ev: MouseEvent): Rect => {
        const cur = gestureRef.current!
        const w = clientToWorld(stage, ev.clientX, ev.clientY)
        const step = ev.shiftKey ? 0 : COLLIDER_SNAP
        const clampPoint = (p: Point): Point => ({
          x: Math.max(0, Math.min(mapWidthPx, p.x)),
          y: Math.max(0, Math.min(mapHeightPx, p.y)),
        })
        if (cur.kind === 'draw') return rectFromDrag(cur.startWorld, clampPoint(w), { step, fromCenter: ev.altKey })
        const dx = w.x - cur.startWorld.x
        const dy = w.y - cur.startWorld.y
        if (cur.kind === 'move') return moveRect(cur.startRect, dx, dy, { step })
        return resizeRect(cur.startRect, cur.handle as Handle, dx, dy, { step, fromCenter: ev.altKey })
      }

      const move = (ev: MouseEvent) => {
        const cur = gestureRef.current
        if (!cur) return
        const next = { ...cur, rect: compute(ev) }
        gestureRef.current = next
        liveRef.current = next.rect
        setGesture(next)
        stage.batchDraw()
      }
      const up = (ev: MouseEvent) => {
        const cur = gestureRef.current
        if (!cur) return
        const next = { ...cur, rect: compute(ev) }
        gestureRef.current = next
        // A click without a drag draws nothing.
        const s = stage.scaleX() || 1
        const moved = Math.hypot(next.rect.x - cur.startRect.x, next.rect.y - cur.startRect.y) + Math.abs(next.rect.w - cur.startRect.w) + Math.abs(next.rect.h - cur.startRect.h)
        finish(cur.kind !== 'draw' || moved * s >= 3)
        stage.batchDraw()
      }
      const key = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          ev.preventDefault()
          ev.stopPropagation()
          finish(false)
          stage.batchDraw()
        } else if (ev.key === 'Enter') {
          ev.preventDefault()
          ev.stopPropagation()
          finish(true)
          stage.batchDraw()
        }
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
      window.addEventListener('keydown', key, true)
      cleanupRef.current = () => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        window.removeEventListener('keydown', key, true)
      }
    },
    [finish, liveRef, mapWidthPx, mapHeightPx],
  )

  const onHandlesDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0 || !rect) return
    const stage = e.target.getStage()
    if (!stage) return
    const world = stage.getPointerPosition()
    if (!world) return
    const s = stage.scaleX() || 1
    const p = { x: (world.x - stage.x()) / s, y: (world.y - stage.y()) / s }
    const hit = hitTestCollider(rect, p, s, { includeBody: toolActive })
    if (!hit) return
    e.cancelBubble = true
    begin(stage, hit === 'body' ? { kind: 'move', startWorld: p, startRect: rect, rect } : { kind: 'resize', handle: hit, startWorld: p, startRect: rect, rect }, e.evt)
  }

  const onHandlesMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage || !rect || gestureRef.current) return
    const ptr = stage.getPointerPosition()
    if (!ptr) return
    const s = stage.scaleX() || 1
    const hit = hitTestCollider(rect, { x: (ptr.x - stage.x()) / s, y: (ptr.y - stage.y()) / s }, s, { includeBody: toolActive })
    setStageCursor(stage, hit === 'body' ? 'move' : hit ? handleCursor(hit) : '')
  }

  const onDrawDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0 || !entity) return
    const stage = e.target.getStage()
    const ptr = stage?.getPointerPosition()
    if (!stage || !ptr) return
    e.cancelBubble = true
    const s = stage.scaleX() || 1
    const p = { x: (ptr.x - stage.x()) / s, y: (ptr.y - stage.y()) / s }
    const start: Rect = { x: p.x, y: p.y, w: 0, h: 0 }
    begin(stage, { kind: 'draw', startWorld: p, startRect: start, rect: start }, e.evt)
  }

  const live = gesture?.rect ?? null
  const handlesVisible = !!rect && !gesture

  return (
    <>
      {/* Collider tool: the ground accepts a drag that draws the collider. */}
      {toolActive && entity && (
        <KonvaRect
          name="collider-draw-surface"
          x={0}
          y={0}
          width={mapWidthPx}
          height={mapHeightPx}
          fill="rgba(0,0,0,0.001)"
          onMouseDown={onDrawDown}
          onMouseEnter={(e) => setStageCursor(e.target.getStage(), 'crosshair')}
          onMouseLeave={(e) => setStageCursor(e.target.getStage(), '')}
        />
      )}

      {/* Handles (and the body in tool mode) */}
      {rect && handlesVisible && (
        <Shape
          name="collider-handles"
          fill="#000"
          perfectDrawEnabled={false}
          sceneFunc={(context, shape) => {
            const ctx = context._context as CanvasRenderingContext2D
            const s = shape.getStage()?.scaleX() || 1
            for (const h of HANDLES) {
              const p = handlePoint(rect, h)
              drawHandle(ctx, p.x, p.y, s)
            }
          }}
          hitFunc={(context, shape) => {
            const s = shape.getStage()?.scaleX() || 1
            const half = 6 / s
            context.beginPath()
            if (toolActive) context.rect(rect.x, rect.y, rect.w, rect.h)
            for (const h of HANDLES) {
              const p = handlePoint(rect, h)
              context.rect(p.x - half, p.y - half, half * 2, half * 2)
            }
            context.closePath()
            context.fillShape(shape)
          }}
          onMouseDown={onHandlesDown}
          onMouseMove={onHandlesMove}
          onMouseLeave={(e) => setStageCursor(e.target.getStage(), '')}
        />
      )}

      {/* Live rectangle + read-out while a gesture runs */}
      {gesture && live && entity && (
        <Shape
          listening={false}
          sceneFunc={(context, shape) => {
            const ctx = context._context as CanvasRenderingContext2D
            const s = shape.getStage()?.scaleX() || 1
            drawFootprint(ctx, live.x, live.y, live.w, live.h, rgb, s, true)
            for (const h of HANDLES) {
              const p = handlePoint(live, h)
              drawHandle(ctx, p.x, p.y, s)
            }
            drawReadout(ctx, formatColliderRect(rectToColliderProps(live, { x: entity.x, y: entity.y })), live.x, live.y + live.h + 6 / s, s)
          }}
        />
      )}
    </>
  )
}
