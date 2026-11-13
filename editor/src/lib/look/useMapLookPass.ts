// Hooks the map's look onto the canvas's content layer (see lookMapPass): grade after every draw, redraw when the look,
// the profile in view or the shader library changes, and keep redrawing while animated looks are shown.

import { useEffect, type RefObject } from 'react'
import type Konva from 'konva'
import type { LookSet } from '../../../../shared/look/types'
import { gradeMapLayer } from './lookMapPass'
import { useLookLibrary } from './lookLibrary'
import { useLookView } from './lookView'

export function useMapLookPass(layerRef: RefObject<Konva.Layer | null>, look: LookSet | undefined, mapW: number, mapH: number): void {
  const view = useLookView()
  const lib = useLookLibrary()

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const grade = () => {
      gradeMapLayer(layer, look, { w: mapW, h: mapH })
    }
    layer.on('draw.lookPass', grade)
    layer.batchDraw()
    return () => {
      layer.off('draw.lookPass', grade)
    }
  }, [layerRef, look, mapW, mapH, view, lib.shaders])

  // Animated shaders and grain: redraw every frame while the view animates (pictures and layers animate too).
  useEffect(() => {
    if (!view.animate || !view.enabled) return
    let frame = 0
    const tick = () => {
      layerRef.current?.batchDraw()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [layerRef, view.animate, view.enabled])
}
