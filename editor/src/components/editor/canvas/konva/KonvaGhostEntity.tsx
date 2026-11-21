import React, { useMemo } from 'react'
import { Shape } from 'react-konva'
import type { SpriteAssetInfo } from '../../../../../../shared/engine/types'
import type { PropBag } from '@/types/editor'
import { PendingEntityPlacement, placementComponents } from '@/hooks/editor/useEntityPlacement'
import { colliderLocalRect, entityAreaLocal, entityBounds, normalizeCollider } from '@/lib/entityVisuals'
import { snapEntityAnchor } from '@/lib/entitySnap'
import { drawResolvedSprite, resolveSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { drawAnchorCross, drawFootprint, drawLabel } from './entityDraw'

interface KonvaGhostEntityProps {
  pendingPlacement: PendingEntityPlacement | null
  pointerPos: { x: number; y: number } | null
  /** The magnet: on, the area lands on grid lines; off, on whole pixels (the same rule as the click that places it). */
  snapToGrid?: boolean
  spriteAssets?: Record<string, SpriteAssetInfo>
}

const EMPTY: Record<string, SpriteAssetInfo> = {}

/** Placement preview: the node's real sprite, its collider (if it has one) and its anchor, snapped like the click, semi-transparent. */
export const KonvaGhostEntity = React.memo(function KonvaGhostEntity({
  pendingPlacement,
  pointerPos,
  snapToGrid = true,
  spriteAssets = EMPTY,
}: KonvaGhostEntityProps) {
  const imagesVersion = useSpriteImagesVersion()
  // A prefab's root node gives the components (its child nodes'); a Node without any has only its anchor.
  const prefabNode = pendingPlacement?.prefab?.node
  const components = useMemo(() => (pendingPlacement ? (placementComponents(pendingPlacement) as Record<string, PropBag>) : undefined), [pendingPlacement])
  const sprite = components?.Sprite
  const asset = sprite?.asset ? spriteAssets[sprite.asset] : undefined

  const model = useMemo(() => {
    void imagesVersion
    if (!pendingPlacement) return null
    const entity = { name: pendingPlacement.name, x: 0, y: 0, components: { ...(components ?? {}), Transform: { ...(components?.Transform ?? {}) } } as Record<string, PropBag> }
    const bounds = entityBounds(entity, asset?.meta)
    const collider = components?.Collider ? normalizeCollider(components.Collider) : null
    return {
      bounds,
      area: entityAreaLocal(entity),
      foot: collider ? colliderLocalRect(collider) : null,
      solid: collider ? collider.isSolid : true,
      resolved: sprite && asset ? resolveSprite(asset, sprite, 0) : null,
      rotation: prefabNode && 'rotation' in prefabNode && typeof prefabNode.rotation === 'number' ? prefabNode.rotation : 0,
    }
  }, [pendingPlacement, components, sprite, asset, imagesVersion, prefabNode])

  if (!pendingPlacement || !pointerPos || !model) return null

  // It shows where it would land: the area snapped with the magnet, or the pixel under the pointer.
  const target = snapEntityAnchor(model.area, pointerPos.x, pointerPos.y, snapToGrid)

  return (
    <Shape
      x={target.x}
      y={target.y}
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(context, shape) => {
        const ctx = context._context as CanvasRenderingContext2D
        const s = shape.getStage()?.scaleX() || 1
        if (model.resolved) {
          ctx.save()
          ctx.globalAlpha = 0.7
          if (model.rotation) ctx.rotate((model.rotation * Math.PI) / 180)
          drawResolvedSprite(ctx, model.resolved, { anchorX: 0, anchorY: 0, opacity: sprite?.opacity, tint: sprite?.tint || undefined })
          ctx.restore()
        }

        if (model.foot) drawFootprint(ctx, model.foot.x, model.foot.y, model.foot.w, model.foot.h, '255,255,255', s, true)
        drawAnchorCross(ctx, 0, 0, s)
        drawLabel(ctx, `${pendingPlacement.name} — click to place`, model.bounds.x + model.bounds.w / 2, model.bounds.y, s, 'hover')
      }}
    />
  )
})
