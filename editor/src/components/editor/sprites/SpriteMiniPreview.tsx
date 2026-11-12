import React, { useEffect, useRef } from 'react'
import type { Facing, SpriteAssetInfo, SpriteAssetMeta } from '../../../../../shared/engine/types'
import { drawResolvedSprite, resolveSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { centredRect, fitZoom, prepareCanvas } from '@/lib/canvas2d'

interface SpriteMiniPreviewProps {
  asset: SpriteAssetInfo
  /** Unsaved metadata to preview instead of the asset's saved one. */
  meta?: SpriteAssetMeta
  facing?: Facing
  /** Character: 'walk' | 'run' | '' (idle); other kinds: an animation name or '' for a static frame. */
  animation?: string
  frame?: number
  tick: number
  size?: number
}

/** A small pixel-perfect preview of one frame/animation, centred in a square box (pivot-independent). */
export function SpriteMiniPreview({ asset, meta, facing = 'down', animation = '', frame = 0, tick, size = 56 }: SpriteMiniPreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const version = useSpriteImagesVersion()
  useEffect(() => {
    const ctx = ref.current && prepareCanvas(ref.current, size, size)
    if (!ctx) return
    const useAsset = meta ? { ...asset, meta } : asset
    const r = resolveSprite(useAsset, { facing, animation, frame }, tick)
    if (!r) return
    const dest = centredRect(r.src.w, r.src.h, fitZoom(r.src.w, r.src.h, size), size)
    drawResolvedSprite(ctx, { ...r, dest }, { anchorX: 0, anchorY: 0 })
  }, [asset, meta, facing, animation, frame, tick, size, version])
  return <canvas ref={ref} className="ed-pixelated ed-checker rounded-sm" style={{ width: size, height: size }} aria-hidden />
}
