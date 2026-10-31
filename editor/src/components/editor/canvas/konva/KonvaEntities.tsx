// Entities on the map canvas: real sprites (pixel-perfect), placeholders for entities without one, collider
// footprints, badges, labels, hover and selection visuals, and the collider editor for the selected entity.
//
// Performance model (the earlier panning work must not regress):
//  * Sprites are plain Konva shapes inside memoised nodes; they only re-render when their entity changes.
//  * Everything that depends on zoom or pointer state (footprints, badges, labels, frames) is ONE overlay
//    shape whose sceneFunc reads refs and the stage scale at draw time: no React state per mouse move.
//  * The per-entity geometry is computed once per entities/assets change, not per frame.

import React, { useCallback, useMemo, useRef } from 'react'
import { Group, Rect, Shape } from 'react-konva'
import { EntityData, EntityFolder, MapData } from '@/types/editor'
import type { SpriteAssetInfo } from '../../../../../../shared/engine/types'
import {
  entityBounds,
  colliderLocalRect,
  entityIconName,
  normalizeCollider,
  sortByDepth,
  summarizeEntity,
  translateRect,
  type ColliderPatch,
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
  drawPlaceholder,
  drawSelectionFrame,
  drawWanderRing,
} from './entityDraw'
import { setStageCursor } from '../canvasUtils'

const EMPTY_ASSETS: Record<string, SpriteAssetInfo> = {}

interface KonvaEntitiesProps {
  entities: EntityData[]
  selectedEntityId: string | null
  setSelectedEntityId: (id: string | null) => void
  moveEntity: (id: string, x: number, y: number) => void
  activeMap: MapData
  snapToGrid?: boolean
  snapEntityPos?: (x: number, y: number) => { x: number; y: number }
  onRightClickEntity?: (entity: EntityData, clientX: number, clientY: number) => void
  showEntities?: boolean
  entityFolders?: EntityFolder[]
  spriteAssets?: Record<string, SpriteAssetInfo>
  view: CanvasViewSettings
  /** Double-click on an entity that has an Event. */
  onOpenEvent?: (entityId: string) => void
}

/** Per-entity geometry, derived once per entities/assets change. All rects are relative to the anchor. */
interface EntityInfo {
  entity: EntityData
  id: string
  asset: SpriteAssetInfo | undefined
  bounds: GeoRect
  /** The entity's area: its collider box, or the tile it stands on when it has no collider. */
  foot: GeoRect
  solid: boolean
  hasEvent: boolean
  controller: 'none' | 'player' | 'wander' | null
  wanderRadius: number
  spriteHidden: boolean
  icon: string
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
    foot: colliderLocalRect(collider ?? normalizeCollider(null)),
    solid: collider ? collider.isSolid : true,
    hasEvent: sum.hasEvent,
    controller: sum.controller,
    wanderRadius: sum.wanderRadius,
    spriteHidden: sum.spriteHidden,
    icon: entityIconName(entity),
    rgb: overlayRgb(entity.components.Tag?.color),
  }
}

interface Visuals {
  hoverId: string | null
  dragId: string | null
  dragX: number
  dragY: number
}

// ── one entity ──────────────────────────────────────────────────────────────────────────────────

interface KonvaEntityNodeProps {
  info: EntityInfo
  /** Bumped when a sheet image finished loading so the sprite re-resolves. */
  imagesVersion: number
  showSprites: boolean
  listening: boolean
  draggable: boolean
  mapWidthPx: number
  mapHeightPx: number
  snapToGrid: boolean
  snapEntityPos: (x: number, y: number) => { x: number; y: number }
  visuals: React.MutableRefObject<Visuals>
  setSelectedEntityId: (id: string | null) => void
  moveEntity: (id: string, x: number, y: number) => void
  onRightClickEntity?: (entity: EntityData, clientX: number, clientY: number) => void
  onOpenEvent?: (entityId: string) => void
}

const KonvaEntityNode = React.memo(function KonvaEntityNode({
  info,
  imagesVersion,
  showSprites,
  listening,
  draggable,
  mapWidthPx,
  mapHeightPx,
  snapToGrid,
  snapEntityPos,
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

  const tone = info.hasEvent ? 'event' : info.entity.components.Collider && !info.solid ? 'trigger' : 'default'
  const dim = info.spriteHidden

  const clampSnap = (x: number, y: number) => {
    const bx = Math.max(0, Math.min(mapWidthPx, x))
    const by = Math.max(0, Math.min(mapHeightPx, y))
    return snapToGrid ? snapEntityPos(bx, by) : { x: bx, y: by }
  }

  return (
    <Group
      x={entity.x}
      y={entity.y}
      listening={listening}
      draggable={draggable}
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
        moveEntity(entity.id, p.x, p.y)
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
      {/* grab area: the sprite frame united with the tile */}
      <Rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="rgba(0,0,0,0.001)" />

      <Shape
        name="entity-sprite"
        listening={false}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        sceneFunc={(context, shape) => {
          const ctx = context._context as CanvasRenderingContext2D
          const stage = shape.getStage()
          const parent = shape.getParent()
          if (stage && parent) {
            const s = stage.scaleX() || 1
            const left = (-stage.x()) / s
            const top = (-stage.y()) / s
            const right = left + stage.width() / s
            const bottom = top + stage.height() / s
            const px = parent.x()
            const py = parent.y()
            if (px + bounds.x + bounds.w < left || px + bounds.x > right || py + bounds.y + bounds.h < top || py + bounds.y > bottom) return
          }
          if (resolved) {
            drawResolvedSprite(ctx, resolved, {
              anchorX: 0,
              anchorY: 0,
              opacity: dim ? Math.min(0.35, sprite?.opacity ?? 1) : sprite?.opacity,
              tint: sprite?.tint || undefined,
            })
          } else {
            drawPlaceholder(ctx, info.icon, tone, dim ? 0.5 : 1)
          }
        }}
      />
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
  snapEntityPos = (x, y) => ({ x: Math.floor(x / 32) * 32 + 16, y: Math.floor((y - 16) / 32 + 1) * 32 }),
  onRightClickEntity,
  showEntities = true,
  entityFolders = [],
  spriteAssets = EMPTY_ASSETS,
  view,
  onOpenEvent,
}: KonvaEntitiesProps) {
  const imagesVersion = useSpriteImagesVersion()
  const visuals = useRef<Visuals>({ hoverId: null, dragId: null, dragX: 0, dragY: 0 })

  const mapWidthPx = activeMap.width * 32
  const mapHeightPx = activeMap.height * 32

  const infos = useMemo(() => {
    const hiddenFolders = new Set((entityFolders || []).filter((f) => f.visible === false).map((f) => f.id))
    const visible = entities.filter((entity) => entity.visible !== false && !(entity.folder && hiddenFolders.has(entity.folder)))
    return sortByDepth(visible).map((e) => buildInfo(e, spriteAssets))
  }, [entities, entityFolders, spriteAssets])

  const selected = useMemo(() => infos.find((i) => i.id === selectedEntityId) ?? null, [infos, selectedEntityId])

  if (showEntities === false) return null

  const colliderEntity = selected ? { id: selected.id, x: selected.entity.x, y: selected.entity.y, collider: selected.entity.components.Collider } : null

  return (
    <Group>
      {infos.map((info) => {
        const isSelected = info.id === selectedEntityId
        return (
          <KonvaEntityNode
            key={info.id}
            info={info}
            imagesVersion={imagesVersion}
            showSprites={view.sprites}
            listening
            draggable
            mapWidthPx={mapWidthPx}
            mapHeightPx={mapHeightPx}
            snapToGrid={snapToGrid}
            snapEntityPos={snapEntityPos}
            visuals={visuals}
            setSelectedEntityId={setSelectedEntityId}
            moveEntity={moveEntity}
            onRightClickEntity={onRightClickEntity}
            onOpenEvent={onOpenEvent}
          />
        )
      })}

      {/* Footprints, badges, labels, hover + selection (one shape, zoom-aware, no React state) */}
      <Shape
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

          // 1) the area of every visible entity (hidden entities and folders are not in `infos`)
          for (let i = 0; i < infos.length; i++) {
            const info = infos[i]
            if (info.id === selectedEntityId) continue
            const ax = info.id === v.dragId ? v.dragX : info.entity.x
            const ay = info.id === v.dragId ? v.dragY : info.entity.y
            const f = info.foot
            if (ax + f.x + f.w < left || ax + f.x > right || ay + f.y + f.h < top || ay + f.y > bottom) continue
            drawFootprint(ctx, ax + f.x, ay + f.y, f.w, f.h, info.rgb, s, false)
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
            drawFootprint(ctx, ax + selected.foot.x, ay + selected.foot.y, selected.foot.w, selected.foot.h, selected.rgb, s, true)
            drawAnchorCross(ctx, ax, ay, s)
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
      />

    </Group>
  )
})

