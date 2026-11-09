/** A picture being dragged and where the mouse has it right now; the image layer draws it there instead of at its saved position. */
export interface ImageDrag {
  id: string
  x: number
  y: number
  /** The rest of the picked set (a group), which moves by the same amount while the drag lasts. */
  along?: { ids: readonly string[]; dx: number; dy: number }
  /** A corner handle is resizing it: drawn at this scale (and at `x`/`y`) until the handle is let go. */
  scale?: number
}
