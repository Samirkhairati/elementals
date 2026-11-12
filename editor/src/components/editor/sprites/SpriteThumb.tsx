import React, { useEffect, useRef } from 'react'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import { drawResolvedSprite, resolveSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { centredRect, fitZoom, prepareCanvas } from '@/lib/canvas2d'

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
    const ctx = ref.current && prepareCanvas(ref.current, size, size)
    if (!ctx) return
    const resolved = resolveSprite(asset, { facing: 'down', animation: '', frame: 0 }, 0)
    if (!resolved) return
    const { w, h } = resolved.src
    // Centre the frame in the box (pivot-independent: this is a thumbnail, not an in-game placement).
    const dest = centredRect(w, h, fitZoom(w, h, size), size)
    drawResolvedSprite(ctx, { ...resolved, dest }, { anchorX: 0, anchorY: 0 })
  }, [asset, size, version])

  return <canvas ref={ref} className={`ed-pixelated shrink-0 ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden />
})
