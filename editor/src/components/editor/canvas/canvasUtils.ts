import type Konva from 'konva'
import { Pos } from '@/types/editor'

export interface BoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

/**
 * Calculates normalized bounding box coordinates and dimensions between two grid positions.
 */
export function getBoundingBox(start: Pos | null, current: Pos | null): BoundingBox | null {
  if (!start || !current) return null
  const minX = Math.min(start.x, current.x)
  const minY = Math.min(start.y, current.y)
  const maxX = Math.max(start.x, current.x)
  const maxY = Math.max(start.y, current.y)
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

/** Sets the pointer cursor of the stage's container ('' = back to the CSS cursor of the canvas wrapper). */
export function setStageCursor(stage: Konva.Stage | null | undefined, cursor: string) {
  const el = stage?.container()
  if (el) el.style.cursor = cursor
}
