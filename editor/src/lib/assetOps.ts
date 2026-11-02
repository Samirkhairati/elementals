// Safe rename / move / delete of graphics and tilesets: plan what a change touches (character sheets, image layers,
// painted tiles), then apply it through injected IO, so the whole flow is testable without Electron. Same shape as
// renameFlow.ts, which does it for characters.

import { rewriteGraphicId, rewriteMapGraphicId, rewriteTilesetId, type Reference, type RefTarget } from '../../../shared/engine/index'
import type { CharacterDef } from '../../../shared/engine/characters'
import { isValidGraphicId, type CharacterInfo } from '../../../shared/engine/graphics'
import type { MapData } from '@/types/editor'
import type { ProjectReferences } from './referenceIndex'
import type { OpResult } from './opResult'

export interface IdChange {
  from: string
  to: string
}

export interface AssetPlan {
  ok: boolean
  /** Why the change cannot go ahead ('' when ok). */
  problem: string
  changes: IdChange[]
  /** Every place that refers to what changes. */
  references: Reference[]
  /** Characters whose sheets change, already rewritten. */
  characters: { id: string; def: CharacterDef }[]
  /** Maps that change, already rewritten. */
  maps: MapData[]
}

export interface AssetIo {
  saveCharacter: (id: string, def: CharacterDef) => Promise<OpResult>
  saveMap: (map: MapData) => Promise<OpResult>
}

const SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

// ── ids and folders ─────────────────────────────────────────────────────────────────────────────

export const folderOfId = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '')
export const leafOfId = (id: string): string => id.slice(id.lastIndexOf('/') + 1)
export const joinId = (folder: string, leaf: string): string => (folder ? `${folder}/${leaf}` : leaf)

/** Ids at or below `folder`. */
export const idsUnder = (ids: readonly string[], folder: string): string[] => ids.filter((id) => id.startsWith(`${folder}/`))

/** Folder paths implied by ids (every ancestor), merged with the empty folders the disk reports; sorted. */
export function allFolders(ids: readonly string[], diskFolders: readonly string[] = []): string[] {
  const out = new Set<string>(diskFolders)
  for (const id of ids) {
    const parts = id.split('/').slice(0, -1)
    parts.forEach((_, i) => out.add(parts.slice(0, i + 1).join('/')))
  }
  return [...out].sort()
}

/** The id changes when the folder `folder` becomes `newFolder` (a rename or a move; '' for the top level). */
export function folderChanges(ids: readonly string[], folder: string, newFolder: string): IdChange[] {
  return idsUnder(ids, folder).map((from) => ({ from, to: joinId(newFolder, from.slice(folder.length + 1)) }))
}

/** Whether `folder` may be moved into `target` (not into itself or below). */
export const canMoveFolder = (folder: string, target: string): boolean => target !== folder && !target.startsWith(`${folder}/`) && folderOfId(folder) !== target

/** "3 references in 2 maps" */
export function summarizeReferences(refs: readonly Reference[]): string {
  const maps = new Set(refs.filter((r) => r.source.table === 'map').map((r) => (r.source as { mapName: string }).mapName))
  const characters = new Set(refs.filter((r) => r.source.table === 'character').map((r) => (r.source as { id: string }).id))
  const parts = [`${refs.length} reference${refs.length === 1 ? '' : 's'}`]
  if (maps.size) parts.push(`${maps.size} map${maps.size === 1 ? '' : 's'}`)
  if (characters.size) parts.push(`${characters.size} sprite${characters.size === 1 ? '' : 's'}`)
  return parts.length === 1 ? parts[0] : `${parts[0]} in ${parts.slice(1).join(' and ')}`
}

const refsOf = (refs: ProjectReferences, table: 'graphic' | 'tileset', ids: readonly string[]): Reference[] => ids.flatMap((id) => refs.of({ table, id } as RefTarget))

// ── graphics ────────────────────────────────────────────────────────────────────────────────────

/** Plan renaming / moving graphics (one, or everything under a folder; no changes = an empty folder, nothing to rewrite): `existing` are all graphic ids that exist now. */
export function planGraphicChanges(refs: ProjectReferences, characters: Record<string, CharacterInfo>, maps: readonly MapData[], existing: ReadonlySet<string>, changes: readonly IdChange[]): AssetPlan {
  const moving = new Set(changes.map((c) => c.from))
  const targets = new Set<string>()
  let problem = ''
  for (const c of changes) {
    if (problem) break
    if (!isValidGraphicId(c.to)) problem = `“${c.to}” is not a valid graphic id: use letters, digits, “-” and “_” in each part, ending in .png.`
    else if (c.to === c.from) problem = 'That is the current id.'
    else if ((existing.has(c.to) && !moving.has(c.to)) || targets.has(c.to)) problem = `A graphic with id “${c.to}” already exists.`
    targets.add(c.to)
  }
  const references = refsOf(refs, 'graphic', changes.map((c) => c.from))
  if (problem) return { ok: false, problem, changes: [...changes], references, characters: [], maps: [] }

  const rewrittenCharacters: AssetPlan['characters'] = []
  for (const c of Object.values(characters)) {
    let def = c.def
    for (const ch of changes) def = rewriteGraphicId(def, ch.from, ch.to).def
    if (def !== c.def) rewrittenCharacters.push({ id: c.id, def })
  }
  const rewrittenMaps: MapData[] = []
  for (const m of maps) {
    let current = m
    for (const ch of changes) current = rewriteMapGraphicId(current as never, ch.from, ch.to).map as unknown as MapData
    if (current !== m) rewrittenMaps.push(current)
  }
  return { ok: true, problem: '', changes: [...changes], references, characters: rewrittenCharacters, maps: rewrittenMaps }
}

/** A graphic (or a folder's worth) can be deleted only when nothing refers to any of them. */
export function graphicDeleteGuard(refs: ProjectReferences, ids: readonly string[]): { allowed: boolean; references: Reference[] } {
  const references = refsOf(refs, 'graphic', ids)
  return { allowed: references.length === 0, references }
}

// ── tilesets ────────────────────────────────────────────────────────────────────────────────────

/** Tilesets are identified by their file name (`grass.png`); renaming it rewrites every tile painted from it. */
export function planTilesetRename(refs: ProjectReferences, maps: readonly MapData[], taken: ReadonlySet<string>, from: string, toStem: string): AssetPlan {
  const to = `${toStem}.png`
  const problem = !SEGMENT.test(toStem) ? 'Use letters, digits, “-” and “_”.' : to === from ? 'That is the current file name.' : taken.has(to) ? `A tileset called “${to}” already exists.` : ''
  const references = refsOf(refs, 'tileset', [from])
  if (problem) return { ok: false, problem, changes: [{ from, to }], references, characters: [], maps: [] }
  const rewritten: MapData[] = []
  for (const m of maps) {
    const r = rewriteTilesetId(m as never, from, to)
    if (r.changed) rewritten.push(r.map as unknown as MapData)
  }
  return { ok: true, problem: '', changes: [{ from, to }], references, characters: [], maps: rewritten }
}

export function tilesetDeleteGuard(refs: ProjectReferences, id: string): { allowed: boolean; references: Reference[] } {
  const references = refsOf(refs, 'tileset', [id])
  return { allowed: references.length === 0, references }
}

// ── apply ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Runs the change on disk first (`diskOp`: the rename / move itself), then rewrites the characters and maps that
 * referred to the old ids. Reports what could not be written instead of stopping half way.
 */
export async function applyAssetPlan(plan: AssetPlan, diskOp: () => Promise<OpResult>, io: AssetIo): Promise<{ ok: boolean; error: string; failed: string[] }> {
  if (!plan.ok) return { ok: false, error: plan.problem, failed: [] }
  const done = await diskOp()
  if (!done.ok) return { ok: false, error: done.error, failed: [] }
  const failed: string[] = []
  for (const c of plan.characters) {
    const r = await io.saveCharacter(c.id, c.def)
    if (!r.ok) failed.push(c.def.name || c.id)
  }
  for (const m of plan.maps) {
    const r = await io.saveMap(m)
    if (!r.ok) failed.push(m.name || m.fileName)
  }
  return { ok: failed.length === 0, error: failed.length ? `The change was made but these could not be updated: ${failed.join(', ')}` : '', failed }
}
