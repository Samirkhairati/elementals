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
    // Graded only when the layer draws onto its own canvas (not into an export / cache canvas).
    const own = Object.getPrototypeOf(layer).drawScene as Konva.Layer['drawScene']
    layer.drawScene = function (this: Konva.Layer, ...args: Parameters<Konva.Layer['drawScene']>) {
      const r = own.apply(this, args)
      const can = args[0]
      if (!can || can === this.getCanvas()) gradeMapLayer(this, look, { w: mapW, h: mapH })
      return r
    }
    layer.batchDraw()
    return () => {
      layer.drawScene = own
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
