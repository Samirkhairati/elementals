import React, { useMemo } from 'react'
import { Shape } from 'react-konva'
import type { SpriteAssetInfo } from '../../../../../../shared/engine/types'
import type { PropBag } from '@/types/editor'
import { PendingEntityPlacement } from '@/hooks/editor/useEntityPlacement'
import { colliderLocalRect, entityBounds, entityIconName, normalizeCollider } from '@/lib/entityVisuals'
import { drawResolvedSprite, resolveSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { drawAnchorCross, drawFootprint, drawLabel, drawPlaceholder } from './entityDraw'

interface KonvaGhostEntityProps {
  pendingPlacement: PendingEntityPlacement | null
  pointerPos: { x: number; y: number } | null
  snapToGrid: boolean
  snapEntityPos: (x: number, y: number) => { x: number; y: number }
  spriteAssets?: Record<string, SpriteAssetInfo>
}

const EMPTY: Record<string, SpriteAssetInfo> = {}

/** Placement preview: the prefab's real sprite and footprint, snapped to the grid, semi-transparent. */
export const KonvaGhostEntity = React.memo(function KonvaGhostEntity({
  pendingPlacement,
  pointerPos,
  snapToGrid,
  snapEntityPos,
  spriteAssets = EMPTY,
}: KonvaGhostEntityProps) {
  const imagesVersion = useSpriteImagesVersion()
  const components = pendingPlacement?.components
  const sprite = components?.Sprite
  const asset = sprite?.asset ? spriteAssets[sprite.asset] : undefined

  const model = useMemo(() => {
    void imagesVersion
    if (!pendingPlacement) return null
    const entity = { name: pendingPlacement.name, x: 0, y: 0, components: (components ?? {}) as Record<string, PropBag> }
    const bounds = entityBounds(entity, asset?.meta)
    const collider = components?.Collider ? normalizeCollider(components.Collider) : null
    return {
      bounds,
      foot: collider ? colliderLocalRect(collider) : null,
      solid: collider ? collider.isSolid : true,
      resolved: sprite && asset ? resolveSprite(asset, sprite, 0) : null,
      icon: entityIconName(entity),
      hasEvent: !!components?.Event,
    }
  }, [pendingPlacement, components, sprite, asset, imagesVersion])

  if (!pendingPlacement || !pointerPos || !model) return null

  const target = snapToGrid ? snapEntityPos(pointerPos.x, pointerPos.y) : { x: Math.round(pointerPos.x), y: Math.round(pointerPos.y) }

  return (
    <Shape
      x={target.x}
      y={target.y}
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(context, shape) => {
        const ctx = context._context as CanvasRenderingContext2D
        const s = shape.getStage()?.scaleX() || 1
        // the tile it will occupy
        ctx.beginPath()
        ctx.rect(-16, -32, 32, 32)
        ctx.fillStyle = 'rgba(96,165,250,0.12)'
        ctx.fill()
        ctx.lineWidth = 1 / s
        ctx.strokeStyle = 'rgba(96,165,250,0.8)'
        ctx.setLineDash([4 / s, 3 / s])
        ctx.stroke()
        ctx.setLineDash([])

        ctx.save()
        ctx.globalAlpha = 0.7
        if (model.resolved) {
          drawResolvedSprite(ctx, model.resolved, { anchorX: 0, anchorY: 0, opacity: sprite?.opacity, tint: sprite?.tint || undefined })
        } else {
          drawPlaceholder(ctx, model.icon, model.hasEvent ? 'event' : 'default')
        }
        ctx.restore()

        if (model.foot) drawFootprint(ctx, model.foot.x, model.foot.y, model.foot.w, model.foot.h, '255,255,255', s, true)
        drawAnchorCross(ctx, 0, 0, s)
        drawLabel(ctx, `${pendingPlacement.name} — click to place`, model.bounds.x + model.bounds.w / 2, model.bounds.y, s, 'hover')
      }}
    />
  )
})
