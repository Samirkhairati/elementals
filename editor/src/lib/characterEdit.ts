// Pure editing operations for Characters (docs/database-and-characters-spec.md §8). Every function returns a NEW
// definition and never mutates its input, so the editor can keep undo history and tests stay trivial.

import { FACINGS } from '../../../shared/engine/constants'
import type { Facing } from '../../../shared/engine/types'
import type { CharacterDef, ClipDef, FacingMode, PivotDef, SheetDef } from '../../../shared/engine/characters'
import { sheetGrid } from '../../../shared/engine/sprites'
import { cloneJson } from '../../../shared/engine/util'
import { isGifGraphicId, type GraphicInfo } from '../../../shared/engine/graphics'
import { suggestedGifFps } from '../../../shared/gifSheet'

export type Preset = 'actor' | 'prop' | 'animated' | 'gif'

/** What a character is for lists and pickers: a person-like actor (four facings), a still object, or a prop that animates. */
export type CharacterKind = 'actor' | 'object' | 'animated'

export const KIND_ORDER: readonly CharacterKind[] = ['actor', 'object', 'animated']
export const KIND_LABELS: Record<CharacterKind, string> = { actor: 'Characters', object: 'Objects', animated: 'Animated props' }

export function characterKind(def: Pick<CharacterDef, 'facing' | 'clips'>): CharacterKind {
  if (def.facing === 'four') return 'actor'
  return Object.keys(def.clips).length > 0 ? 'animated' : 'object'
}

/** Folder a new character of this preset goes into by default (ids stay editable). */
export const PRESET_FOLDERS: Record<Preset, string> = { actor: 'characters', prop: 'objects', animated: 'animated', gif: 'animated' }

export const PRESET_LABELS: Record<Preset, string> = { actor: 'Actor (4 directions)', prop: 'Object (one picture)', animated: 'Animated prop', gif: 'GIF animation' }

export interface GridSuggestion {
  columns: number
  rows: number
  frameWidth: number
  frameHeight: number
}

/**
 * A starting cut for an image. Actors are 4 directions × 4 frames (a 128×192 image gives 32×48 frames); an object is the
 * whole picture; an animated prop is a row of square frames when the image is a strip, else the whole picture.
 */
export function suggestGrid(preset: Preset, width: number, height: number): GridSuggestion {
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.floor(height))
  let columns = 1
  let rows = 1
  if (preset === 'actor') {
    columns = Math.min(4, w)
    rows = Math.min(4, h)
  } else if (preset === 'animated' && w > h && w % h === 0) {
    columns = w / h
  }
  return { columns, rows, frameWidth: Math.max(1, Math.floor(w / columns)), frameHeight: Math.max(1, Math.floor(h / rows)) }
}

export function slugify(name: string, fallback = 'character'): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback
}

/** A new character from one image, per preset (spec §8.3). The id stays with the caller. */
export function newCharacter(preset: Preset, name: string, image: string, size: { width: number; height: number }): CharacterDef {
  const grid = suggestGrid(preset, size.width, size.height)
  const sheet: SheetDef = { image, frameWidth: grid.frameWidth, frameHeight: grid.frameHeight, margin: 0, spacing: 0 }
  const base = { version: 2 as const, name: name.trim() || 'New sprite', tags: [] as string[], pivot: { x: 0.5, y: 1 } }
  if (preset === 'actor') {
    const rows = (frames: (row: number) => number[]) => Object.fromEntries(FACINGS.map((f, r) => [f, frames(r)])) as Partial<Record<Facing, number[]>>
    const cycle = (r: number) => Array.from({ length: grid.columns }, (_, i) => r * grid.columns + i)
    return {
      ...base,
      profile: 'actor4',
      facing: 'four',
      sheets: { walk: sheet },
      clips: {
        idle: { sheet: 'walk', fps: 1, loop: false, directional: true, byFacing: rows((r) => [r * grid.columns]) },
        walk: { sheet: 'walk', fps: 8, loop: true, directional: true, byFacing: rows(cycle), followSpeed: { reference: 100 } },
      },
      bindings: { idle: 'idle', walk: 'walk' },
    }
  }
  if (preset === 'gif') throw new Error('A GIF character is made with newGifCharacter')
  if (preset === 'animated') {
    const frames = Array.from({ length: grid.columns * grid.rows }, (_, i) => i)
    return {
      ...base,
      profile: 'prop',
      facing: 'none',
      sheets: { sheet },
      clips: { idle: { sheet: 'sheet', fps: 6, loop: true, directional: false, frames } },
      bindings: {},
    }
  }
  return { ...base, profile: 'prop', facing: 'none', sheets: { sheet }, clips: {}, bindings: {}, still: { sheet: 'sheet', frame: 0 } }
}

/**
 * A new character that plays a GIF: one looping animation, bound to idle (and so to walking too), so a map entity that
 * uses it plays the GIF without anything else to set. The id stays with the caller.
 */
export function newGifCharacter(name: string, graphic: GraphicInfo): CharacterDef {
  return {
    version: 2,
    name: name.trim() || 'New sprite',
    tags: [],
    profile: 'prop',
    facing: 'none',
    pivot: { x: 0.5, y: 1 },
    sheets: { gif: gifSheet(graphic) },
    clips: { idle: gifClip(undefined, 'gif', graphic) },
    bindings: { idle: 'idle' },
    still: { sheet: 'gif', frame: 0 },
  }
}

// ── GIFs ────────────────────────────────────────────────────────────────────────────────────────
// A GIF is a sheet whose picture is a .gif graphic (shared/engine/graphics.ts): its frames are laid out as a grid, so a
// clip on it is an ordinary clip over frames 0..n-1; only the fps comes from the GIF (its delays), and the author can change it.

export type SheetSource = 'sheet' | 'gif'

/** Whether a sheet is cut from a GIF or from a picture of frames. */
export const sheetSource = (sheet: Pick<SheetDef, 'image'>): SheetSource => (isGifGraphicId(sheet.image) ? 'gif' : 'sheet')

/** The GIF graphics of a library (an animation can only be a sheet's picture, never a still one). */
export const gifGraphics = (graphics: readonly GraphicInfo[]): GraphicInfo[] => graphics.filter((g) => !!g.gif)
/** The still pictures of a library (a GIF is left out). */
export const stillGraphics = (graphics: readonly GraphicInfo[]): GraphicInfo[] => graphics.filter((g) => !g.gif)

/** Frame numbers 0..n-1 of a GIF graphic, the frames of its clip. */
export const gifFrames = (graphic: GraphicInfo): number[] => Array.from({ length: graphic.gif?.frames ?? 1 }, (_, i) => i)

/** The fps that plays a GIF at the speed it was made for. */
export const gifFps = (graphic: GraphicInfo): number => suggestedGifFps(graphic.gif?.delaysMs ?? [])

/** A sheet cut from a GIF: the frame size is the GIF's, nothing else to cut. */
export function gifSheet(graphic: GraphicInfo): SheetDef {
  return { image: graphic.id, frameWidth: graphic.gif?.frameWidth ?? graphic.width, frameHeight: graphic.gif?.frameHeight ?? graphic.height, margin: 0, spacing: 0 }
}

/**
 * Switches a sheet to a GIF: the picture becomes the GIF and the cut its frame size. The animations that use the sheet
 * play all its frames from now on (a GIF has nothing else to choose), at the GIF's own fps; they stop being directional.
 */
export function setSheetGif(def: CharacterDef, key: string, graphic: GraphicInfo): CharacterDef {
  const next = cloneJson(def)
  next.sheets[key] = { ...gifSheet(graphic), ...(next.sheets[key].pivot ? { pivot: next.sheets[key].pivot } : {}) }
  for (const [name, clip] of Object.entries(next.clips)) if (clip.sheet === key) next.clips[name] = gifClip(clip, key, graphic)
  return next
}

/** Switches a sheet back to a picture of frames: a cut suggested from its size (the animations keep their frame numbers). */
export function setSheetPicture(def: CharacterDef, key: string, graphic: GraphicInfo): CharacterDef {
  const grid = suggestGrid(def.facing === 'four' ? 'actor' : 'prop', graphic.width, graphic.height)
  const next = cloneJson(def)
  next.sheets[key] = { image: graphic.id, frameWidth: grid.frameWidth, frameHeight: grid.frameHeight, margin: 0, spacing: 0, ...(next.sheets[key].pivot ? { pivot: next.sheets[key].pivot } : {}) }
  return next
}

/** A clip over a GIF sheet: every frame in order, the GIF's speed, looping unless it was set otherwise. */
export function gifClip(from: Partial<ClipDef> | undefined, sheetKey: string, graphic: GraphicInfo): ClipDef {
  const clip: ClipDef = { sheet: sheetKey, fps: gifFps(graphic), loop: from?.loop ?? true, directional: false, frames: gifFrames(graphic) }
  if (from?.mode) clip.mode = from.mode
  if (from?.followSpeed) clip.followSpeed = from.followSpeed
  return clip
}

/** Adds a sheet for a GIF and an animation that plays it (a character can have several GIF animations). */
export function addGifAnimation(def: CharacterDef, graphic: GraphicInfo, name = 'animation'): { def: CharacterDef; sheet: string; clip: string } {
  const sheet = uniqueKey(def.sheets, 'gif')
  const clip = uniqueKey(def.clips, name)
  const next = cloneJson(def)
  next.sheets[sheet] = gifSheet(graphic)
  next.clips[clip] = gifClip(undefined, sheet, graphic)
  return { def: next, sheet, clip }
}

/** Makes an animation play all the frames of its GIF again, at the GIF's speed (after the author changed them). */
export function resetGifClip(def: CharacterDef, name: string, graphic: GraphicInfo): CharacterDef {
  const next = cloneJson(def)
  next.clips[name] = gifClip(next.clips[name], next.clips[name].sheet, graphic)
  return next
}

// ── sheets ──────────────────────────────────────────────────────────────────────────────────────

export function uniqueKey(existing: Record<string, unknown>, base: string): string {
  const slug = slugify(base, 'item').replace(/[^a-z0-9_-]/g, '-')
  if (!(slug in existing)) return slug
  for (let n = 2; ; n++) if (!(`${slug}-${n}` in existing)) return `${slug}-${n}`
}

export function addSheet(def: CharacterDef, image: string, size: { width: number; height: number }, preferredKey = 'sheet'): { def: CharacterDef; key: string } {
  const key = uniqueKey(def.sheets, preferredKey)
  const grid = suggestGrid(def.facing === 'four' ? 'actor' : 'prop', size.width, size.height)
  const next = cloneJson(def)
  next.sheets[key] = { image, frameWidth: grid.frameWidth, frameHeight: grid.frameHeight, margin: 0, spacing: 0 }
  return { def: next, key }
}

/** Sheets can only go when no animation (or still frame) uses them. */
export function sheetUsers(def: CharacterDef, key: string): string[] {
  const users = Object.entries(def.clips).filter(([, c]) => c.sheet === key).map(([n]) => n)
  if (def.still?.sheet === key) users.push('(still frame)')
  return users
}

export function removeSheet(def: CharacterDef, key: string): CharacterDef {
  const users = sheetUsers(def, key)
  if (users.length > 0) throw new Error(`Sheet "${key}" is used by ${users.join(', ')}`)
  const next = cloneJson(def)
  delete next.sheets[key]
  return next
}

export function updateSheet(def: CharacterDef, key: string, patch: Partial<SheetDef>): CharacterDef {
  const next = cloneJson(def)
  const sheet = { ...next.sheets[key], ...patch }
  if (patch.pivot === undefined && 'pivot' in patch) delete sheet.pivot
  next.sheets[key] = sheet
  return next
}

/** Columns × rows of a sheet in an image, and the frame size from a column/row count ("the frame size is worked out"). */
export function cutFromGrid(size: { width: number; height: number }, columns: number, rows: number, margin = 0, spacing = 0): { frameWidth: number; frameHeight: number } {
  const c = Math.max(1, Math.floor(columns))
  const r = Math.max(1, Math.floor(rows))
  return {
    frameWidth: Math.max(1, Math.floor((size.width - 2 * margin - (c - 1) * spacing) / c)),
    frameHeight: Math.max(1, Math.floor((size.height - 2 * margin - (r - 1) * spacing) / r)),
  }
}

export function gridOf(sheet: SheetDef, size: { width: number; height: number }): { columns: number; rows: number; count: number } {
  return sheetGrid(sheet, size.width, size.height)
}

/** "32×48 px · margin 0 · 4×4 = 16 frames" for a collapsed section. */
export function sheetSummary(sheet: SheetDef, size?: { width: number; height: number }): string {
  const grid = size ? gridOf(sheet, size) : null
  return `${sheet.frameWidth}×${sheet.frameHeight} px · margin ${sheet.margin}${grid ? ` · ${grid.columns}×${grid.rows} = ${grid.count} frames` : ''}`
}

// ── clips ───────────────────────────────────────────────────────────────────────────────────────

export function addClip(def: CharacterDef, name: string, sheet: string): { def: CharacterDef; name: string } {
  const key = uniqueKey(def.clips, name || 'animation')
  const next = cloneJson(def)
  const directional = next.facing === 'four'
  const clip: ClipDef = directional
    ? { sheet, fps: 8, loop: true, directional: true, byFacing: Object.fromEntries(FACINGS.map((f) => [f, [0]])) as Partial<Record<Facing, number[]>> }
    : { sheet, fps: 8, loop: true, directional: false, frames: [0] }
  next.clips[key] = clip
  return { def: next, name: key }
}

/** Renaming keeps every binding that pointed at the clip (events that name it are handled by the rename flow). */
export function renameClip(def: CharacterDef, from: string, to: string): CharacterDef {
  if (from === to) return def
  if (!(from in def.clips)) throw new Error(`Animation "${from}" does not exist`)
  if (to in def.clips) throw new Error(`An animation named "${to}" already exists`)
  if (!/^[A-Za-z0-9_-]+$/.test(to)) throw new Error('Animation names use letters, digits, dashes and underscores')
  const next = cloneJson(def)
  next.clips = Object.fromEntries(Object.entries(next.clips).map(([k, v]) => [k === from ? to : k, v]))
  for (const [b, c] of Object.entries(next.bindings)) if (c === from) next.bindings[b] = to
  return next
}

/** Deleting also removes its bindings; returns what was unbound so the UI can say so. */
export function deleteClip(def: CharacterDef, name: string): { def: CharacterDef; unbound: string[] } {
  const next = cloneJson(def)
  delete next.clips[name]
  const unbound = Object.entries(next.bindings).filter(([, c]) => c === name).map(([b]) => b)
  for (const b of unbound) delete next.bindings[b]
  return { def: next, unbound }
}

export function updateClip(def: CharacterDef, name: string, patch: Partial<ClipDef>): CharacterDef {
  const next = cloneJson(def)
  const clip: ClipDef = { ...next.clips[name], ...patch }
  for (const k of Object.keys(clip) as (keyof ClipDef)[]) if (clip[k] === undefined) delete clip[k]
  next.clips[name] = clip
  return next
}

/** Turning "directional" on spreads the current frames over every facing; off keeps the facing-down frames. */
export function setDirectional(def: CharacterDef, name: string, directional: boolean): CharacterDef {
  const clip = def.clips[name]
  if (clip.directional === directional) return def
  const next = cloneJson(def)
  const c = next.clips[name]
  c.directional = directional
  if (directional) {
    const frames = c.frames && c.frames.length > 0 ? c.frames : [0]
    c.byFacing = Object.fromEntries(FACINGS.map((f) => [f, [...frames]])) as Partial<Record<Facing, number[]>>
    delete c.frames
  } else {
    c.frames = [...(c.byFacing?.down ?? Object.values(c.byFacing ?? {})[0] ?? [0])]
    delete c.byFacing
    delete c.mirror
  }
  return next
}

/** Frames of a clip for one facing (own frames only; a mirrored facing has none of its own). */
export function framesFor(clip: ClipDef, facing: Facing | null): number[] {
  return facing === null || !clip.directional ? clip.frames ?? [] : clip.byFacing?.[facing] ?? []
}

export function setFrames(def: CharacterDef, name: string, facing: Facing | null, frames: number[]): CharacterDef {
  const next = cloneJson(def)
  const c = next.clips[name]
  if (!c.directional || facing === null) c.frames = frames
  else {
    c.byFacing = { ...c.byFacing, [facing]: frames }
    if (c.mirror?.[facing]) {
      delete c.mirror[facing]
      if (Object.keys(c.mirror).length === 0) delete c.mirror
    }
  }
  return next
}

/** `source` = facing whose frames are reused flipped; null removes the mirror (a mirrored facing then needs its own frames). */
export function setMirror(def: CharacterDef, name: string, facing: Facing, source: Facing | null): CharacterDef {
  const next = cloneJson(def)
  const c = next.clips[name]
  const mirror = { ...c.mirror }
  if (source === null) delete mirror[facing]
  else {
    if (source === facing) throw new Error('A direction cannot mirror itself')
    mirror[facing] = source
    delete c.byFacing?.[facing]
  }
  if (Object.keys(mirror).length > 0) c.mirror = mirror
  else delete c.mirror
  return next
}

/** "Auto-assign rows": the first four rows of a sheet go to down, left, right, up; every row's frames are expanded to explicit lists. */
export function autoAssignRows(def: CharacterDef, name: string, columns: number, rows: number[] = [0, 1, 2, 3]): CharacterDef {
  const next = cloneJson(def)
  const c = next.clips[name]
  if (!c.directional) return def
  const byFacing: Partial<Record<Facing, number[]>> = {}
  FACINGS.forEach((f, i) => {
    byFacing[f] = rowFrames(columns, rows[i] ?? i)
  })
  c.byFacing = byFacing
  delete c.mirror
  return next
}

// ── frame picking (click, shift range, marquee, row header) ─────────────────────────────────────

export function rowFrames(columns: number, row: number): number[] {
  return Array.from({ length: columns }, (_, i) => row * columns + i)
}

/** Plain click replaces the selection's last frame list by appending; ctrl/cmd toggles; shift extends a range from `anchor`. */
export function pickFrame(current: number[], index: number, opts: { shift?: boolean; toggle?: boolean; anchor?: number } = {}): number[] {
  if (opts.shift && opts.anchor !== undefined) {
    const [a, b] = opts.anchor <= index ? [opts.anchor, index] : [index, opts.anchor]
    return [...current, ...Array.from({ length: b - a + 1 }, (_, i) => a + i)]
  }
  if (opts.toggle) {
    const at = current.lastIndexOf(index)
    return at >= 0 ? current.filter((_, i) => i !== at) : [...current, index]
  }
  return [...current, index]
}

/** Frames inside a marquee rectangle given in cell coordinates (inclusive), left→right, top→bottom. */
export function marqueeFrames(columns: number, from: { col: number; row: number }, to: { col: number; row: number }): number[] {
  const [c0, c1] = from.col <= to.col ? [from.col, to.col] : [to.col, from.col]
  const [r0, r1] = from.row <= to.row ? [from.row, to.row] : [to.row, from.row]
  const out: number[] = []
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * columns + c)
  return out
}

// ── setup ───────────────────────────────────────────────────────────────────────────────────────

export function setBinding(def: CharacterDef, key: string, clip: string | null): CharacterDef {
  const next = cloneJson(def)
  if (clip === null || clip === '') delete next.bindings[key]
  else next.bindings[key] = clip
  return next
}

/** What switching facing does: how many directional animations would become invalid. */
export function facingChangeImpact(def: CharacterDef, facing: FacingMode): { invalid: string[] } {
  if (facing === 'four') return { invalid: [] }
  return { invalid: Object.entries(def.clips).filter(([, c]) => c.directional).map(([n]) => n) }
}

/** Switching to "none" turns directional clips into plain ones (facing-down frames); switching to "four" leaves clips as they are. */
export function setFacingMode(def: CharacterDef, facing: FacingMode): CharacterDef {
  if (def.facing === facing) return def
  let next: CharacterDef = { ...cloneJson(def), facing }
  if (facing === 'none') for (const [name, c] of Object.entries(def.clips)) if (c.directional) next = setDirectional(next, name, false)
  return next
}

export function setPivot(def: CharacterDef, pivot: PivotDef): CharacterDef {
  return { ...cloneJson(def), pivot: { x: clamp01(pivot.x), y: clamp01(pivot.y) } }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))

export function setTags(def: CharacterDef, tags: string[]): CharacterDef {
  return { ...cloneJson(def), tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))] }
}
