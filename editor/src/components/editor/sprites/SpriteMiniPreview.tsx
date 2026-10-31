import React, { useEffect, useRef } from 'react'
import type { Facing, SpriteAssetInfo, SpriteAssetMeta } from '../../../../../shared/engine/types'
import { drawResolvedSprite, resolveSprite, useSpriteImagesVersion } from '@/lib/spriteImages'

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
    const canvas = ref.current
    if (!canvas) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    const useAsset = meta ? { ...asset, meta } : asset
    const r = resolveSprite(useAsset, { facing, animation, frame }, tick)
    if (!r) return
    const fit = Math.min((size - 4) / r.src.w, (size - 4) / r.src.h)
    const scale = fit >= 1 ? Math.floor(fit) : fit
    const dest = { x: (size - r.src.w * scale) / 2, y: (size - r.src.h * scale) / 2, w: r.src.w * scale, h: r.src.h * scale }
    drawResolvedSprite(ctx, { ...r, dest }, { anchorX: 0, anchorY: 0 })
  }, [asset, meta, facing, animation, frame, tick, size, version])
  return <canvas ref={ref} className="ed-pixelated ed-checker rounded-sm" style={{ width: size, height: size }} aria-hidden />
}
