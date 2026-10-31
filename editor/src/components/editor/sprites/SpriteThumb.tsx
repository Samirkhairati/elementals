import React, { useEffect, useRef } from 'react'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import { drawResolvedSprite, resolveSprite, useSpriteImagesVersion } from '@/lib/spriteImages'

interface SpriteThumbProps {
  asset: SpriteAssetInfo | undefined
  size?: number
  className?: string
}

/** Idle frame of a sprite asset, scaled by whole numbers to fit a square box (pixelated). */
export const SpriteThumb = React.memo(function SpriteThumb({ asset, size = 32, className }: SpriteThumbProps) {
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
    const resolved = resolveSprite(asset, { facing: 'down', animation: '', frame: 0 }, 0)
    if (!resolved) return
    const { w, h } = resolved.src
    const fit = Math.min((size - 4) / w, (size - 4) / h)
    const scale = fit >= 1 ? Math.floor(fit) : fit
    // Centre the frame in the box (pivot-independent: this is a thumbnail, not an in-game placement).
    const dest = { x: (size - w * scale) / 2, y: (size - h * scale) / 2, w: w * scale, h: h * scale }
    drawResolvedSprite(ctx, { ...resolved, dest }, { anchorX: 0, anchorY: 0 })
  }, [asset, size, version])

  return <canvas ref={ref} className={`ed-pixelated shrink-0 ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden />
})
