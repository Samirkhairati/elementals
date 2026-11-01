// The editor's reference index: the shared character / graphic / tileset index plus the flag (switch / variable / stage)
// usage scanner of the event work as one more provider, behind one `of(target)` (spec §11.1).

import { PREFABS, buildReferenceIndex, type RefMap, type Reference, type ReferenceIndex, type RefTarget } from '../../../shared/engine/index'
import type { CharacterDef } from '../../../shared/engine/characters'
import { scanDatabaseUsage, type DatabaseUsage, type UsageRef } from './databaseUsage'

export type FlagTarget = { table: 'switch' | 'variable' | 'stage'; id: string }
export type ProjectTarget = RefTarget | FlagTarget

export interface ProjectReferences extends Omit<ReferenceIndex, 'of'> {
  of(target: ProjectTarget): Reference[]
  /** The raw flag usage (reads / writes), for the Flags table. */
  flags: DatabaseUsage
}

const toReference = (target: FlagTarget, u: UsageRef): Reference => ({
  target: target as unknown as RefTarget,
  source: { table: 'map', mapFile: u.mapFile, mapName: u.mapName, entityId: u.entityId, entityName: u.entityName, stateIndex: u.stateIndex, stateName: u.stateName, nodeId: u.commandId, nodeType: u.commandType },
  where: u.where === 'condition' ? 'condition' : 'node',
  label: `${u.mapName} › ${u.entityName} › ${u.stateName || `State ${u.stateIndex + 1}`} › ${u.where === 'condition' ? 'condition' : u.commandType ?? 'node'}`,
})

export function buildProjectReferences(maps: readonly RefMap[], characters: readonly { id: string; def: CharacterDef }[]): ProjectReferences {
  const index = buildReferenceIndex({ maps, characters, prefabs: PREFABS.map((p) => ({ id: p.id, entity: { components: p.components } })) })
  const flags = scanDatabaseUsage(maps as never)
  const bucket = (t: FlagTarget) => (t.table === 'switch' ? flags.switches : t.table === 'variable' ? flags.variables : flags.stages)[t.id] ?? []
  return {
    ...index,
    flags,
    of: (target) => ('table' in target && (target.table === 'switch' || target.table === 'variable' || target.table === 'stage') ? bucket(target as FlagTarget).map((u) => toReference(target as FlagTarget, u)) : index.of(target as RefTarget)),
  }
}

/** References grouped by map, then entity, for the Used-by list. */
export interface UsageGroup {
  map: string
  entities: { entity: string; refs: Reference[] }[]
  /** Non-map sources (prefabs, characters). */
  others: Reference[]
}

export function groupReferences(refs: readonly Reference[]): UsageGroup[] {
  const maps = new Map<string, Map<string, Reference[]>>()
  const others: Reference[] = []
  for (const r of refs) {
    if (r.source.table !== 'map') {
      others.push(r)
      continue
    }
    const byEntity = maps.get(r.source.mapName) ?? new Map<string, Reference[]>()
    const key = r.source.entityName || r.source.layer || r.source.entityId
    byEntity.set(key, [...(byEntity.get(key) ?? []), r])
    maps.set(r.source.mapName, byEntity)
  }
  const groups: UsageGroup[] = [...maps.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([map, e]) => ({ map, entities: [...e.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([entity, rs]) => ({ entity, refs: rs })), others: [] }))
  if (others.length > 0) groups.push({ map: '', entities: [], others })
  return groups
}
