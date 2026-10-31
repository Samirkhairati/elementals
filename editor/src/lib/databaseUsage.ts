// Where are the global switches and variables used? Pure scanner over the event states of every map.
// Used by the Database panel (usage counts, "delete anyway?" lists) - no React, no IPC.

import type { Command, Condition, EventState } from '../../../shared/engine/types'
import { getCommandDef, isFieldVisible } from '../../../shared/engine/commands'

/** The slice of a map this scanner needs (a `MapData` fits). */
export interface UsageMap {
  fileName: string
  name: string
  entities?: UsageEntity[]
}

export interface UsageEntity {
  id: string
  name: string
  components: Record<string, unknown>
}

/** One place that references a switch or variable. */
export interface UsageRef {
  mapFile: string
  mapName: string
  entityId: string
  entityName: string
  stateIndex: number
  stateName: string
  /** 'condition' = a state condition, 'command' = a command parameter or a conditional command. */
  where: 'condition' | 'command'
  /** Set for `where === 'command'`. */
  commandId?: string
  commandType?: string
}

export interface DatabaseUsage {
  switches: Record<string, UsageRef[]>
  variables: Record<string, UsageRef[]>
}

export const EMPTY_USAGE: DatabaseUsage = { switches: {}, variables: {} }

/** Number of distinct events (entities with an Event component) among the references. */
export function countEvents(refs: readonly UsageRef[] | undefined): number {
  if (!refs || refs.length === 0) return 0
  return new Set(refs.map((r) => `${r.mapFile}\u0000${r.entityId}`)).size
}

/** One line per event ("Town > Old man (State 2)"), duplicates folded. */
export function describeRefs(refs: readonly UsageRef[] | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of refs ?? []) {
    const line = `${r.mapName} > ${r.entityName || r.entityId} (${r.stateName || `State ${r.stateIndex + 1}`})`
    if (seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function conditionRefs(conditions: unknown): { kind: 'switch' | 'variable'; id: string }[] {
  const out: { kind: 'switch' | 'variable'; id: string }[] = []
  if (!Array.isArray(conditions)) return out
  for (const c of conditions as Condition[]) {
    if (!isObject(c)) continue
    if ((c.kind === 'switch' || c.kind === 'variable') && typeof c.id === 'string' && c.id !== '') {
      out.push({ kind: c.kind, id: c.id })
    }
  }
  return out
}

/** Switch/variable ids a command references, found through the catalog's field kinds (so new commands count automatically). */
function commandRefs(cmd: Command): { kind: 'switch' | 'variable'; id: string }[] {
  const def = getCommandDef(cmd.type)
  if (!def || !isObject(cmd.params)) return []
  const out: { kind: 'switch' | 'variable'; id: string }[] = []
  for (const field of def.params) {
    if (!isFieldVisible(field, cmd.params, def.defaultParams)) continue
    const v = cmd.params[field.key]
    if ((field.kind === 'switch' || field.kind === 'variable') && typeof v === 'string' && v !== '') {
      out.push({ kind: field.kind, id: v })
    } else if (field.kind === 'conditions') {
      out.push(...conditionRefs(v))
    }
  }
  return out
}

/** Depth-first walk that tolerates malformed trees (null entries, non-list branches). */
function visitCommands(list: unknown, visit: (cmd: Command) => void): void {
  if (!Array.isArray(list)) return
  for (const raw of list) {
    if (!isObject(raw)) continue
    const cmd = raw as unknown as Command
    visit(cmd)
    if (isObject(cmd.branches)) for (const sub of Object.values(cmd.branches)) visitCommands(sub, visit)
  }
}

/** Scans every Event state (conditions and the whole command tree, branches included) of every map. */
export function scanDatabaseUsage(maps: readonly UsageMap[]): DatabaseUsage {
  const usage: DatabaseUsage = { switches: {}, variables: {} }
  const add = (kind: 'switch' | 'variable', id: string, ref: UsageRef) => {
    const bucket = kind === 'switch' ? usage.switches : usage.variables
    ;(bucket[id] ??= []).push(ref)
  }

  for (const map of maps) {
    for (const entity of map.entities ?? []) {
      const event = entity.components?.Event
      if (!isObject(event) || !Array.isArray(event.states)) continue
      ;(event.states as EventState[]).forEach((state, stateIndex) => {
        if (!isObject(state)) return
        const base = {
          mapFile: map.fileName,
          mapName: map.name || map.fileName,
          entityId: entity.id,
          entityName: entity.name,
          stateIndex,
          stateName: typeof state.name === 'string' ? state.name : '',
        }
        for (const r of conditionRefs(state.conditions)) add(r.kind, r.id, { ...base, where: 'condition' })
        if (Array.isArray(state.commands)) {
          visitCommands(state.commands, (cmd) => {
            for (const r of commandRefs(cmd)) {
              add(r.kind, r.id, { ...base, where: 'command', commandId: cmd.id, commandType: cmd.type })
            }
          })
        }
      })
    }
  }
  return usage
}
