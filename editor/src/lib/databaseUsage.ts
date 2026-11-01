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
  /** 'write' = the reference changes the value (Set Switch / Variable / Stage); everything else reads it. */
  access: 'read' | 'write'
  /** Set for `where === 'command'`. */
  commandId?: string
  commandType?: string
}

export interface DatabaseUsage {
  switches: Record<string, UsageRef[]>
  variables: Record<string, UsageRef[]>
  stages: Record<string, UsageRef[]>
}

export const EMPTY_USAGE: DatabaseUsage = { switches: {}, variables: {}, stages: {} }

export function countAccess(refs: readonly UsageRef[] | undefined): { reads: number; writes: number } {
  let reads = 0
  let writes = 0
  for (const r of refs ?? []) {
    if (r.access === 'write') writes++
    else reads++
  }
  return { reads, writes }
}

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

type RefKind = 'switch' | 'variable' | 'stage'
interface FoundRef {
  kind: RefKind
  id: string
  access: 'read' | 'write'
}

function conditionRefs(conditions: unknown): FoundRef[] {
  const out: FoundRef[] = []
  if (!Array.isArray(conditions)) return out
  for (const c of conditions as Condition[]) {
    if (!isObject(c)) continue
    if ((c.kind === 'switch' || c.kind === 'variable' || c.kind === 'stage') && typeof c.id === 'string' && c.id !== '') {
      out.push({ kind: c.kind, id: c.id, access: 'read' })
    }
  }
  return out
}

/** Commands whose own `id` parameter is changed (not just read) by running them. */
const WRITING_COMMANDS = new Set(['setSwitch', 'setVariable', 'setStage'])

/** Switch/variable/stage ids a command references, found through the catalog's field kinds (so new commands count automatically). */
function commandRefs(cmd: Command): FoundRef[] {
  const def = getCommandDef(cmd.type)
  if (!def || !isObject(cmd.params)) return []
  const out: FoundRef[] = []
  for (const field of def.params) {
    if (!isFieldVisible(field, cmd.params, def.defaultParams)) continue
    const v = cmd.params[field.key]
    if ((field.kind === 'switch' || field.kind === 'variable' || field.kind === 'stage') && typeof v === 'string' && v !== '') {
      out.push({ kind: field.kind, id: v, access: field.key === 'id' && WRITING_COMMANDS.has(cmd.type) ? 'write' : 'read' })
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
  const usage: DatabaseUsage = { switches: {}, variables: {}, stages: {} }
  const add = (kind: RefKind, id: string, ref: UsageRef) => {
    const bucket = kind === 'switch' ? usage.switches : kind === 'variable' ? usage.variables : usage.stages
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
        for (const r of conditionRefs(state.conditions)) add(r.kind, r.id, { ...base, where: 'condition', access: r.access })
        // Graph states (schemaVersion 4); a command tree left over from older data is read too.
        const nodes: unknown[] = isObject(state.graph) && Array.isArray(state.graph.nodes) ? state.graph.nodes : []
        for (const raw of nodes) {
          if (!isObject(raw) || typeof raw.type !== 'string') continue
          const node = raw as unknown as Command
          for (const r of commandRefs(node)) add(r.kind, r.id, { ...base, where: 'command', access: r.access, commandId: node.id, commandType: node.type })
        }
        const legacy = (state as { commands?: unknown }).commands
        if (Array.isArray(legacy)) {
          visitCommands(legacy, (cmd) => {
            for (const r of commandRefs(cmd)) add(r.kind, r.id, { ...base, where: 'command', access: r.access, commandId: cmd.id, commandType: cmd.type })
          })
        }
      })
    }
  }
  return usage
}

/**
 * Who calls each common event: one line per caller ("Town > Old man (State 2)" or "Common event: Heal"),
 * duplicates folded. Events nobody calls are absent.
 */
export function scanCommonEventUsage(maps: readonly UsageMap[], events: readonly { id: string; name: string; graph: unknown }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const add = (id: string, line: string) => {
    const list = (out[id] ??= [])
    if (!list.includes(line)) list.push(line)
  }
  const callsOf = (graph: unknown): string[] => {
    const nodes: unknown[] = isObject(graph) && Array.isArray(graph.nodes) ? graph.nodes : []
    const ids: string[] = []
    for (const n of nodes) {
      if (isObject(n) && n.type === 'callCommonEvent' && isObject(n.params) && typeof n.params.id === 'string' && n.params.id !== '') ids.push(n.params.id)
    }
    return ids
  }
  for (const map of maps) {
    for (const entity of map.entities ?? []) {
      const event = entity.components?.Event
      if (!isObject(event) || !Array.isArray(event.states)) continue
      ;(event.states as EventState[]).forEach((state, i) => {
        if (!isObject(state)) return
        const stateName = typeof state.name === 'string' && state.name ? state.name : `State ${i + 1}`
        for (const id of callsOf(state.graph)) add(id, `${map.name || map.fileName} > ${entity.name || entity.id} (${stateName})`)
      })
    }
  }
  for (const e of events) for (const id of callsOf(e.graph)) if (id !== e.id) add(id, `Common event: ${e.name}`)
  return out
}
