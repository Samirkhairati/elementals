// Safe rename / delete of characters and animations (spec §11.4): plan what a change touches, then apply it through
// injected IO so the whole flow is testable without Electron.

import { rewriteCharacterId, rewriteClipName, type Reference, type RefTarget } from '../../../shared/engine/index'
import { isValidCharacterId } from '../../../shared/engine/graphics'
import type { MapData } from '@/types/editor'
import type { ProjectReferences } from './referenceIndex'

export interface RenamePlan {
  ok: boolean
  /** Why the rename cannot go ahead ('' when ok). */
  problem: string
  references: Reference[]
  /** Maps that change, already rewritten. */
  maps: MapData[]
  /** References that live in code (prefab defaults) and cannot be rewritten. */
  unrewritable: Reference[]
}

export function planCharacterRename(refs: ProjectReferences, maps: readonly MapData[], takenIds: ReadonlySet<string>, from: string, to: string): RenamePlan {
  const references = refs.of({ table: 'character', id: from } as RefTarget)
  const problem = !isValidCharacterId(to) ? 'Use letters, digits, “-”, “_” and “/”.' : to === from ? 'That is the current id.' : takenIds.has(to) ? `A character with id “${to}” already exists.` : ''
  const rewritten: MapData[] = []
  if (!problem) {
    for (const m of maps) {
      const r = rewriteCharacterId(m as never, from, to)
      if (r.changed) rewritten.push(r.map as unknown as MapData)
    }
  }
  return { ok: !problem, problem, references, maps: rewritten, unrewritable: references.filter((r) => r.source.table === 'prefab') }
}

export interface RenameIo {
  renameCharacter: (from: string, to: string) => Promise<{ ok: true } | { ok: false; error: string }>
  saveMap: (map: MapData) => Promise<{ ok: true } | { ok: false; error: string }>
}

/** Renames the record first, then rewrites the maps; reports which maps could not be written. */
export async function applyCharacterRename(plan: RenamePlan, from: string, to: string, io: RenameIo): Promise<{ ok: boolean; error: string; failedMaps: string[] }> {
  if (!plan.ok) return { ok: false, error: plan.problem, failedMaps: [] }
  const renamed = await io.renameCharacter(from, to)
  if (!renamed.ok) return { ok: false, error: renamed.error, failedMaps: [] }
  const failedMaps: string[] = []
  for (const m of plan.maps) {
    const r = await io.saveMap(m)
    if (!r.ok) failedMaps.push(m.name || m.fileName)
  }
  return { ok: failedMaps.length === 0, error: failedMaps.length ? `The character was renamed but these maps could not be updated: ${failedMaps.join(', ')}` : '', failedMaps }
}

/** Maps rewritten for a set of animation renames of one character (applied after the character is saved). */
export function planClipRenames(maps: readonly MapData[], characterId: string, renames: readonly { from: string; to: string }[]): MapData[] {
  const out: MapData[] = []
  for (const m of maps) {
    let current = m as never as MapData
    let changed = false
    for (const r of renames) {
      const next = rewriteClipName(current as never, characterId, r.from, r.to)
      if (next.changed) {
        current = next.map as unknown as MapData
        changed = true
      }
    }
    if (changed) out.push(current)
  }
  return out
}

/** A character can be deleted only when nothing refers to it (clip-level references are covered by the id-level ones). */
export function deleteGuard(refs: ProjectReferences, id: string): { allowed: boolean; references: Reference[] } {
  const references = refs.of({ table: 'character', id } as RefTarget)
  return { allowed: references.length === 0, references }
}
