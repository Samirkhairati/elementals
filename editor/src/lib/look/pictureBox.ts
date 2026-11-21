// Where a placed picture is drawn and how its own pixels map to map pixels (its look's mask space). One place for the
// canvas drawing (KonvaTilemapLayer) and the mask handles (KonvaMaskEditor), matching drawResolvedSprite's mirroring.

import { pictureSubject, type LookPlacement } from '../../../../shared/look/shader'
import type { ResolvedSprite } from '@/lib/spriteImages'
import type { ImageItem } from '@/types/editor'

export interface PictureBox {
  /** The box the picture covers on the map (before mirroring). */
  box: { x: number; y: number; w: number; h: number }
  mirrorX: boolean
  mirrorY: boolean
  /** Picture pixels <-> map pixels. */
  subject: LookPlacement['subject']
}

export function pictureBox(item: Pick<ImageItem, 'flipX' | 'flipY'>, resolved: Pick<ResolvedSprite, 'dest' | 'src' | 'flipX'>, at: { x: number; y: number }): PictureBox {
  const { dest, src } = resolved
  const mirrorX = !!item.flipX !== resolved.flipX
  const mirrorY = !!item.flipY
  // A flip mirrors the picture in place (inside this box), as drawResolvedSprite and the game do.
  const box = { x: at.x + dest.x, y: at.y + dest.y, w: dest.w, h: dest.h }
  return { box, mirrorX, mirrorY, subject: pictureSubject(box, { w: src.w, h: src.h }, mirrorX, mirrorY) }
}
