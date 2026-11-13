// The map's look on the editor canvas: the map content (background, layers, entity sprites) is drawn on its own Konva
// layer; right after it draws, its canvas is graded with the game's shader (the same LUT, masks, vignette and user
// shaders as the camera pass, LookPassPipeline) and put back. Grid, handles and overlays sit on another layer, ungraded.

import type Konva from 'konva'
import { WORLD_SUBJECT } from '../../../../shared/look/shader'
import type { LookSet } from '../../../../shared/look/types'
import { lookGL } from './lookGL'
import { compileCached, worldStack } from './lookSubjects'
import { getLookView } from './lookView'
import { lookTime, previewFor, shaderPasses } from './lookDraw'

/** Grades a Konva layer's canvas in place with the map's look. False = nothing to do (no look, looks off, no WebGL). */
export function gradeMapLayer(layer: Konva.Layer, look: LookSet | undefined, mapSize: { w: number; h: number }): boolean {
  const view = getLookView()
  if (!view.enabled || !look) return false
  const stack = worldStack(look, view.profile)
  if (stack.length === 0) return false
  const compiled = compileCached(stack, { subjectSize: mapSize, mapSize })
  if (compiled.neutral && compiled.shaders.length === 0) return false
  const gl = lookGL()
  const stage = layer.getStage()
  if (!gl || !stage) return false
  const canvas = layer.getCanvas()._canvas as HTMLCanvasElement
  const w = canvas.width
  const h = canvas.height
  if (w < 1 || h < 1) return false
  // canvas uv -> map pixels (the stage is scaled and moved; the canvas covers the stage at the pixel ratio)
  const scale = stage.scaleX() || 1
  const cssW = stage.width()
  const cssH = stage.height()
  const uvToWorld: [number, number, number, number] = [-stage.x() / scale, -stage.y() / scale, cssW / scale, cssH / scale]
  const frame = { x: uvToWorld[0], y: uvToWorld[1], w: uvToWorld[2], h: uvToWorld[3] }
  const time = lookTime(view)
  const ok = gl.render(
    canvas,
    w,
    h,
    // snapped: masks and grain see whole map pixels, like the game at any zoom
    { compiled, uvToWorld, snap: true, placement: { subject: WORLD_SUBJECT, frame, time, preview: previewFor('map', compiled, view) } },
    shaderPasses(compiled.shaders, uvToWorld, time)
  )
  if (!ok) return false
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'copy'
  ctx.drawImage(gl.canvas, 0, 0, w, h)
  ctx.restore()
  return true
}
