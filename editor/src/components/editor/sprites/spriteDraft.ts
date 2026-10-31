// Pure helpers for editing a sprite's metadata draft in the Sprites panel.

import type { SpriteAnimationDef, SpriteAssetMeta, SpriteKind } from '../../../../../shared/engine/types'
import { checkSheetDimensions, spriteSheetRoles, validateSpriteMeta } from '../../../../../shared/engine/sprites'

export function cloneMeta(meta: SpriteAssetMeta): SpriteAssetMeta {
  return JSON.parse(JSON.stringify(meta)) as SpriteAssetMeta
}

export function isDraftDirty(draft: SpriteAssetMeta, saved: SpriteAssetMeta): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved)
}

/** Kinds an asset may be switched to: characters are tied to their 4-direction sheets, so only object <-> animated. */
export function switchableKinds(kind: SpriteKind): SpriteKind[] {
  return kind === 'character' ? ['character'] : ['object', 'animated']
}

export function withKind(meta: SpriteAssetMeta, kind: SpriteKind): SpriteAssetMeta {
  if (meta.kind === 'character' || kind === 'character' || meta.kind === kind) return meta
  return { ...meta, kind }
}

/** `anim`, `anim2`, `anim3` ... not yet used. */
export function nextAnimationName(existing: string[], base = 'anim'): string {
  if (!existing.includes(base)) return base
  let i = 2
  while (existing.includes(`${base}${i}`)) i++
  return `${base}${i}`
}

/** Append a frame to an animation (clicking a frame while picking). */
export function appendFrame(anim: SpriteAnimationDef, frame: number): SpriteAnimationDef {
  return { ...anim, frames: [...anim.frames, frame] }
}

/** Remove the frame at a list position. */
export function removeFrameAt(anim: SpriteAnimationDef, position: number): SpriteAnimationDef {
  return { ...anim, frames: anim.frames.filter((_, i) => i !== position) }
}

/** `0, 1, 2, 3` or `0-3, 5` -> [0,1,2,3] / [0,1,2,3,5]. Invalid parts are ignored. */
export function parseFrameList(text: string): number[] {
  const out: number[] = []
  for (const part of text.split(/[,\s]+/)) {
    if (!part) continue
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) continue
    const a = Number(m[1])
    const b = m[2] !== undefined ? Number(m[2]) : a
    if (Math.abs(b - a) > 2000) continue
    if (a <= b) for (let i = a; i <= b; i++) out.push(i)
    else for (let i = a; i >= b; i--) out.push(i)
  }
  return out
}

export interface DraftValidation {
  errors: string[]
  warnings: string[]
}

/**
 * Metadata problems plus sheet problems. `sizes` are the decoded sheet sizes by file name; dimension checks
 * wait until every referenced sheet is decoded. `availableFiles` (the sheets that exist in the asset folder)
 * turns a reference to a missing file into a warning.
 */
export function validateDraft(
  meta: SpriteAssetMeta,
  sizes: Record<string, { width: number; height: number }>,
  availableFiles?: string[],
): DraftValidation {
  const check = validateSpriteMeta(meta)
  const warnings = [...check.warnings]
  if (check.ok) {
    const files = spriteSheetRoles(meta).map((r) => r.file)
    if (availableFiles) {
      for (const f of files) if (!availableFiles.includes(f)) warnings.push(`sheet "${f}" was not found in the sprite folder`)
    }
    const present = files.filter((f) => !availableFiles || availableFiles.includes(f))
    if (present.every((f) => sizes[f])) {
      for (const w of checkSheetDimensions(meta, sizes)) if (!/is missing/.test(w)) warnings.push(w)
    }
  }
  return { errors: check.errors, warnings }
}
