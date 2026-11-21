// Entities on the map canvas: real sprites (pixel-perfect, turned by the node's rotation), the anchor of every node,
// collider footprints (only where a StaticBody or Area holds a CollisionShape: a Node has no box of its own), badges,
// labels, hover and selection visuals.
//
// Performance model (the earlier panning work must not regress):
//  * Sprites are plain Konva shapes inside memoised nodes; they only re-render when their entity changes.
//  * Everything that depends on zoom or pointer state (footprints, badges, labels, frames) is ONE overlay
//    shape whose sceneFunc reads refs and the stage scale at draw time: no React state per mouse move.
//  * The per-entity geometry is computed once per entities/assets change, not per frame.

import React, { useMemo, useRef } from 'react'
import { Group, Rect, Shape } from 'react-konva'
import type { EntityData, MapData } from '@/types/editor'
import type { SpriteAssetInfo } from '../../../../../../shared/engine/types'
import {
  entityBounds,
  colliderLocalRect,
  entityAreaLocal,
  normalizeCollider,
  sortByDepth,
  summarizeEntity,
  translateRect,
  type Rect as GeoRect,
} from '@/lib/entityVisuals'
import { drawResolvedSprite, resolveSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import type { CanvasViewSettings } from '@/hooks/editor/canvas/canvasView'
import { overlayRgb } from '@/hooks/editor/canvas/canvasView'
import {
  EVENT_RGB,
  MOVE_RGB,
  drawAnchorCross,
  drawBadge,
  drawFootprint,
  drawHoverFrame,
  drawLabel,
  drawSelectionFrame,
  drawWanderRing,
} from './entityDraw'
import { snapEntityAnchor } from '@/lib/entitySnap'
import { setStageCursor } from '../canvasUtils'

const EMPTY_ASSETS: Record<string, SpriteAssetInfo> = {}

interface KonvaEntitiesProps {
  /** The entities to handle: the shown ones of a run of the draw order (`sprites`), or of the whole map (`hits`, `overlays`). */
  entities: readonly EntityData[]
  selectedEntityId: string | null
  setSelectedEntityId: (id: string | null) => void
  /** Moves a node's anchor; `carry` = what it holds moves along (off while Alt is held: only the anchor moves). */
  moveEntity: (id: string, x: number, y: number, carry: boolean) => void
  activeMap: MapData
  /** The magnet: on, a dragged entity's area lands on grid lines; off, on whole pixels. */
  snapToGrid?: boolean
  onRightClickEntity?: (entity: EntityData, clientX: number, clientY: number) => void
  spriteAssets?: Record<string, SpriteAssetInfo>
  view: CanvasViewSettings
  /** Double-click on an entity that has an Event. */
  onOpenEvent?: (entityId: string) => void
  /**
   * The entities can be drawn in several places of the canvas: the sprites sit in the tree's draw order where the entities
   * are, the editing overlays (areas, selection, badges, labels) go on top of everything so they stay readable. The parts
   * share `visuals`. Default: everything in one place.
   */
  /**
   * Which of the entity layers to render. `sprites` only draws, `hits` is the invisible part that picks, drags and
   * right-clicks (put above the picture handles so an entity over a picture wins), `overlays` draws areas, selection and labels.
   * `all` is sprites + hits in one node.
   */
  part?: 'all' | 'sprites' | 'hits' | 'overlays'
  visuals?: React.MutableRefObject<Visuals>
}

/** Per-entity geometry, derived once per entities/assets change. All rects are relative to the anchor. */
interface EntityInfo {
  entity: EntityData
  id: string
  asset: SpriteAssetInfo | undefined
  bounds: GeoRect
  /** What snapping keeps on the grid: the collider box, or the tile the anchor stands on. */
  foot: GeoRect
  /** The collider box, drawn as the node's area; none without a StaticBody / Area holding a shape. */
  area: GeoRect | null
  solid: boolean
  /** Degrees, clockwise, around the anchor. */
  rotation: number
  /** A polygon collider (points relative to the anchor), drawn instead of the box. */
  poly: { points: { x: number; y: number }[]; closed: boolean } | null
  hasEvent: boolean
  controller: 'none' | 'player' | 'wander' | null
  wanderRadius: number
  spriteHidden: boolean
  /** `r,g,b` of the area outline (the entity's Tag colour). */
  rgb: string
}

function buildInfo(entity: EntityData, assets: Record<string, SpriteAssetInfo>): EntityInfo {
  const sum = summarizeEntity(entity)
  const sprite = entity.components.Sprite
  const asset = sprite?.asset ? assets[sprite.asset] : undefined
  const collider = entity.components.Collider ? normalizeCollider(entity.components.Collider) : null
  const abs = entityBounds(entity, asset?.meta)
  return {
    entity,
    id: entity.id,
    asset,
    bounds: translateRect(abs, -entity.x, -entity.y),
    foot: entityAreaLocal(entity),
    area: collider ? colliderLocalRect(collider) : null,
    solid: collider ? collider.isSolid : true,
    rotation: typeof entity.rotation === 'number' && Number.isFinite(entity.rotation) ? entity.rotation : 0,
    poly: collider?.points ? { points: collider.points, closed: collider.closed !== false } : null,
    hasEvent: sum.hasEvent,
    controller: sum.controller,
    wanderRadius: sum.wanderRadius,
    spriteHidden: sum.spriteHidden,
    rgb: overlayRgb(entity.components.Tag?.color),
  }
}

export interface Visuals {
  hoverId: string | null
  dragId: string | null
  dragX: number
  dragY: number
}

// ── one entity ──────────────────────────────────────────────────────────────────────────────────

interface KonvaEntityNodeProps {
  /** `draw`: only the sprite (follows a drag through `visuals`); `hit`: only the invisible grab area and its events. */
  mode: 'both' | 'draw' | 'hit'
  info: EntityInfo
  /** Bumped when a sheet image finished loading so the sprite re-resolves. */
  imagesVersion: number
  showSprites: boolean
  listening: boolean
  draggable: boolean
  snapToGrid: boolean
  visuals: React.MutableRefObject<Visuals>
  setSelectedEntityId: (id: string | null) => void
  moveEntity: (id: string, x: number, y: number, carry: boolean) => void
  onRightClickEntity?: (entity: EntityData, clientX: number, clientY: number) => void
  onOpenEvent?: (entityId: string) => void
}

const KonvaEntityNode = React.memo(function KonvaEntityNode({
  mode,
  info,
  imagesVersion,
  showSprites,
  listening,
  draggable,
  snapToGrid,
  visuals,
  setSelectedEntityId,
  moveEntity,
  onRightClickEntity,
  onOpenEvent,
}: KonvaEntityNodeProps) {
  const { entity, bounds } = info
  const sprite = entity.components.Sprite

  const resolved = useMemo(() => {
    void imagesVersion
    return showSprites && sprite && info.asset ? resolveSprite(info.asset, sprite, 0) : null
  }, [showSprites, sprite, info.asset, imagesVersion])

  const dim = info.spriteHidden

  // Entities can be dragged past the map's edge too (off-screen spawners, things walking in).
  const clampSnap = (x: number, y: number) => snapEntityAnchor(info.foot, x, y, snapToGrid)

  return (
    <Group
      x={entity.x}
      y={entity.y}
      listening={listening && mode !== 'draw'}
      draggable={draggable && mode !== 'draw'}
      onDragStart={(e) => {
        e.cancelBubble = true
        setSelectedEntityId(entity.id)
        visuals.current.dragId = entity.id
        visuals.current.dragX = entity.x
        visuals.current.dragY = entity.y
        setStageCursor(e.target.getStage(), 'grabbing')
      }}
      onDragMove={(e) => {
        e.cancelBubble = true
        const p = clampSnap(e.target.x(), e.target.y())
        e.target.x(p.x)
        e.target.y(p.y)
        visuals.current.dragX = p.x
        visuals.current.dragY = p.y
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true
        const p = clampSnap(e.target.x(), e.target.y())
        e.target.x(p.x)
        e.target.y(p.y)
        visuals.current.dragId = null
        setStageCursor(e.target.getStage(), 'move')
        moveEntity(entity.id, p.x, p.y, !e.evt.altKey)
      }}
      onMouseEnter={(e) => {
        visuals.current.hoverId = entity.id
        setStageCursor(e.target.getStage(), draggable ? 'move' : 'pointer')
        e.target.getLayer()?.batchDraw()
      }}
      onMouseLeave={(e) => {
        if (visuals.current.hoverId === entity.id) visuals.current.hoverId = null
        setStageCursor(e.target.getStage(), '')
        e.target.getLayer()?.batchDraw()
      }}
      onClick={(e) => {
        e.cancelBubble = true
        // Only the left button selects (the middle button pans the canvas).
        if (e.evt.button === 0) setSelectedEntityId(entity.id)
      }}
      onTap={(e) => {
        e.cancelBubble = true
        setSelectedEntityId(entity.id)
      }}
      onDblClick={(e) => {
        e.cancelBubble = true
        if (e.evt.button === 0 && info.hasEvent) onOpenEvent?.(entity.id)
      }}
      onDblTap={(e) => {
        e.cancelBubble = true
        if (info.hasEvent) onOpenEvent?.(entity.id)
      }}
      onMouseDown={(e) => {
        if (e.evt.button === 0) {
          e.cancelBubble = true
          setSelectedEntityId(entity.id)
        } else if (e.evt.button === 2) {
          e.cancelBubble = true
          e.evt.preventDefault()
          setSelectedEntityId(entity.id)
          onRightClickEntity?.(entity, e.evt.clientX, e.evt.clientY)
        }
      }}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        e.cancelBubble = true
      }}
    >
      {/* grab area: the sprite frame united with the collider, or the square around the anchor */}
      {mode !== 'draw' && <Rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="rgba(0,0,0,0.001)" />}

      {mode !== 'hit' && <Shape
        name="entity-sprite"
        listening={false}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        sceneFunc={(context, shape) => {
          const ctx = context._context as CanvasRenderingContext2D
          const stage = shape.getStage()
          const parent = shape.getParent()
          // Drawn apart from its grab area, the sprite follows a drag through the shared visuals.
          const dragging = mode === 'draw' && visuals.current.dragId === entity.id
          const dx = dragging ? visuals.current.dragX - entity.x : 0
          const dy = dragging ? visuals.current.dragY - entity.y : 0
          ctx.save()
          if (dragging) ctx.translate(dx, dy)
          if (stage && parent) {
            const s = stage.scaleX() || 1
            const left = (-stage.x()) / s
            const top = (-stage.y()) / s
            const right = left + stage.width() / s
            const bottom = top + stage.height() / s
            const px = parent.x()
            const py = parent.y()
            if (px + dx + bounds.x + bounds.w < left || px + dx + bounds.x > right || py + dy + bounds.y + bounds.h < top || py + dy + bounds.y > bottom) {
              ctx.restore()
              return
            }
          }
          if (resolved) {
            if (info.rotation) ctx.rotate((info.rotation * Math.PI) / 180)
            drawResolvedSprite(ctx, resolved, {
              anchorX: 0,
              anchorY: 0,
              opacity: dim ? Math.min(0.35, sprite?.opacity ?? 1) : sprite?.opacity,
              tint: sprite?.tint || undefined,
            })
          }
          ctx.restore()
        }}
      />}
    </Group>
  )
})

// ── the layer of entities ───────────────────────────────────────────────────────────────────────

export const KonvaEntities = React.memo(function KonvaEntities({
  entities,
  selectedEntityId,
  setSelectedEntityId,
  moveEntity,
  activeMap,
  snapToGrid = true,
  onRightClickEntity,
  spriteAssets = EMPTY_ASSETS,
  view,
  onOpenEvent,
  part = 'all',
  visuals: sharedVisuals,
}: KonvaEntitiesProps) {
  const imagesVersion = useSpriteImagesVersion()
  const ownVisuals = useRef<Visuals>({ hoverId: null, dragId: null, dragX: 0, dragY: 0 })
  const visuals = sharedVisuals ?? ownVisuals

  const mapWidthPx = activeMap.width * 32
  const mapHeightPx = activeMap.height * 32

  // Per-entity geometry, once per entities / assets change. Entities of a part are all shown ones (hidden ones are left out upstream).
  const infos = useMemo(() => sortByDepth(entities).map((e) => buildInfo(e, spriteAssets)), [entities, spriteAssets])

  const selected = useMemo(() => infos.find((i) => i.id === selectedEntityId) ?? null, [infos, selectedEntityId])

  return (
    <Group>
      {part !== 'overlays' && infos.map((info) => {
        return (
          <KonvaEntityNode
            key={info.id}
            mode={part === 'sprites' ? 'draw' : part === 'hits' ? 'hit' : 'both'}
            info={info}
            imagesVersion={imagesVersion}
            showSprites={view.sprites}
            listening
            draggable
            snapToGrid={snapToGrid}
            visuals={visuals}
            setSelectedEntityId={setSelectedEntityId}
            moveEntity={moveEntity}
            onRightClickEntity={onRightClickEntity}
            onOpenEvent={onOpenEvent}
          />
        )
      })}

      {/* Footprints, badges, labels, hover + selection (one shape, zoom-aware, no React state) */}
      {(part === 'all' || part === 'overlays') && <Shape
        name="entity-overlays"
        listening={false}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        sceneFunc={(context, shape) => {
          const ctx = context._context as CanvasRenderingContext2D
          const stage = shape.getStage()
          const s = stage?.scaleX() || 1
          const left = stage ? -stage.x() / s : 0
          const top = stage ? -stage.y() / s : 0
          const right = stage ? left + stage.width() / s : mapWidthPx
          const bottom = stage ? top + stage.height() / s : mapHeightPx
          const v = visuals.current

          // 1) the area of every visible entity that has one (a collider), and the anchor of every one
          for (let i = 0; i < infos.length; i++) {
            const info = infos[i]
            if (info.id === selectedEntityId) continue
            const ax = info.id === v.dragId ? v.dragX : info.entity.x
            const ay = info.id === v.dragId ? v.dragY : info.entity.y
            const f = info.area
            if (f && !(ax + f.x + f.w < left || ax + f.x > right || ay + f.y + f.h < top || ay + f.y > bottom)) {
              drawFootprint(ctx, ax + f.x, ay + f.y, f.w, f.h, info.rgb, s, false, info.poly && { ...info.poly, ax, ay })
            }
            if (ax >= left && ax <= right && ay >= top && ay <= bottom) drawAnchorCross(ctx, ax, ay, s, false)
          }

          // 2) hover
          if (v.hoverId && v.hoverId !== selectedEntityId && v.dragId === null) {
            const info = infos.find((i) => i.id === v.hoverId)
            if (info) drawHoverFrame(ctx, translateRect(info.bounds, info.entity.x, info.entity.y), s)
          }

          // 3) selection: frame, prominent footprint, wander ring, anchor
          if (selected) {
            const ax = v.dragId === selected.id ? v.dragX : selected.entity.x
            const ay = v.dragId === selected.id ? v.dragY : selected.entity.y
            if (selected.controller === 'wander') drawWanderRing(ctx, ax, ay, selected.wanderRadius, s)
            drawSelectionFrame(ctx, translateRect(selected.bounds, ax, ay), s)
            const f = selected.area
            if (f) drawFootprint(ctx, ax + f.x, ay + f.y, f.w, f.h, selected.rgb, s, true, selected.poly && { ...selected.poly, ax, ay })
            drawAnchorCross(ctx, ax, ay, s, true)
          }

          // 4) badges (event for everyone, movement for the selected entity)
          if (view.badges && s >= 0.5) {
            for (let i = 0; i < infos.length; i++) {
              const info = infos[i]
              const isSel = info.id === selectedEntityId
              const showMove = isSel && info.controller !== null && info.controller !== 'none'
              if (!info.hasEvent && !showMove) continue
              const ax = info.id === v.dragId ? v.dragX : info.entity.x
              const ay = info.id === v.dragId ? v.dragY : info.entity.y
              const b = info.bounds
              if (ax + b.x + b.w < left || ax + b.x > right || ay + b.y + b.h < top || ay + b.y > bottom) continue
              let bx = ax + b.x + b.w - 12 / s
              const by = ay + b.y - 5 / s
              if (info.hasEvent) {
                drawBadge(ctx, 'zap', bx, by, s, EVENT_RGB)
                bx -= 19 / s
              }
              if (showMove) drawBadge(ctx, 'footprints', bx, by, s, MOVE_RGB)
            }
          }

          // 5) labels: selected + hovered always, everyone when zoomed in
          const labelAll = view.labels && s >= 1.25
          for (let i = 0; i < infos.length; i++) {
            const info = infos[i]
            const isSel = info.id === selectedEntityId
            const isHover = info.id === v.hoverId && v.dragId === null
            if (!isSel && !isHover && !labelAll) continue
            const ax = info.id === v.dragId ? v.dragX : info.entity.x
            const ay = info.id === v.dragId ? v.dragY : info.entity.y
            const b = info.bounds
            if (ax + b.x + b.w < left || ax + b.x > right || ay + b.y + b.h < top || ay + b.y > bottom) continue
            drawLabel(ctx, info.entity.name, ax + b.x + b.w / 2, ay + b.y, s, isSel ? 'selected' : isHover ? 'hover' : 'plain')
          }
        }}
      />}
    </Group>
  )
})

