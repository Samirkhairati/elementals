// Which frame stands for a character in lists and tiles: the frame it shows when idle and facing down, else its still
// frame, else the first frame of its first animation. Pure; the picture itself is drawn by `CharacterThumb`.

import type { CharacterDef } from '../../../shared/engine/characters'
import { clipFrames, resolveClip, staticSheetKey } from '../../../shared/engine/characters'

export function thumbFrame(def: CharacterDef): { sheet: string; frame: number } | null {
  const idle = resolveClip(def, 'normal', 'idle')
  const idleClip = idle ? def.clips[idle] : undefined
  const idleFrame = idleClip ? clipFrames(idleClip, 'down')?.frames[0] : undefined
  if (idleClip && idleFrame !== undefined && def.sheets[idleClip.sheet]) return { sheet: idleClip.sheet, frame: idleFrame }
  if (def.still && def.sheets[def.still.sheet]) return { sheet: def.still.sheet, frame: def.still.frame }
  for (const clip of Object.values(def.clips)) {
    const frame = clipFrames(clip, 'down')?.frames[0]
    if (frame !== undefined && def.sheets[clip.sheet]) return { sheet: clip.sheet, frame }
  }
  const sheet = staticSheetKey(def)
  return sheet ? { sheet, frame: 0 } : null
}
