// Pure helpers behind the event editor: state operations, templates, validation/summary contexts and
// problems. The graph itself is edited by `graphModel.ts`. No React in here, so everything is
// unit-testable and every function returns new data (inputs are never mutated).

import type {
  Command,
  Condition,
  EventState,
  GraphIssue,
  IssueSeverity,
  StageDef,
  SummaryContext,
  ValidationContext,
  VariableDef,
} from '../../../../../shared/engine/types'
import { createCommand, validateConditions } from '../../../../../shared/engine/commands'
import { createDefaultEventState } from '../../../../../shared/engine/components'
import { cloneGraph, commandNodes, commandsToGraph, validateGraph } from '../../../../../shared/engine/graph'
import { newId } from '../../../../../shared/engine/ids'
import { cloneJson } from '../../../../../shared/engine/util'
import type { EventEnv } from './eventEnv'

// ── states ───────────────────────────────────────────────────────────────────────────────────────

export function stateLabel(state: Pick<EventState, 'name'>, index: number): string {
  return state.name.trim() || `State ${index + 1}`
}

/** Appends an empty state. */
export function addState(states: EventState[]): { states: EventState[]; id: string } {
  const state = createDefaultEventState(`State ${states.length + 1}`)
  return { states: [...states, state], id: state.id }
}

/** Inserts a copy (fresh ids, "name copy") right after the state. */
export function duplicateState(states: EventState[], id: string): { states: EventState[]; id: string | null } {
  const index = states.findIndex((p) => p.id === id)
  if (index < 0) return { states, id: null }
  const source = states[index]
  const copy: EventState = {
    ...cloneJson({ ...source, graph: undefined }),
    id: newId(),
    name: source.name.trim() ? `${source.name.trim()} copy` : '',
    graph: cloneGraph(source.graph, true),
  }
  return { states: [...states.slice(0, index + 1), copy, ...states.slice(index + 1)], id: copy.id }
}

/** Removes a state; an event always keeps at least one state. */
export function deleteState(states: EventState[], id: string): EventState[] {
  if (states.length <= 1 || !states.some((p) => p.id === id)) return states
  return states.filter((p) => p.id !== id)
}

/** Moves a state one step (delta -1 = earlier, +1 = later). Later states win over earlier ones. */
export function moveState(states: EventState[], id: string, delta: -1 | 1): EventState[] {
  const from = states.findIndex((p) => p.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= states.length) return states
  const next = states.slice()
  const [state] = next.splice(from, 1)
  next.splice(to, 0, state)
  return next
}

export function updateState(states: EventState[], id: string, patch: Partial<EventState>): EventState[] {
  if (!states.some((p) => p.id === id)) return states
  return states.map((p) => (p.id === id ? { ...p, ...patch } : p))
}

function compare(op: string, a: number, b: number): boolean {
  switch (op) {
    case '==':
      return a === b
    case '!=':
      return a !== b
    case '>':
      return a > b
    case '>=':
      return a >= b
    case '<':
      return a < b
    case '<=':
      return a <= b
    default:
      return false
  }
}

/**
 * Would this condition hold in a brand-new game (all switches off, variables and stages at their
 * initial value, empty bag)?
 */
export function conditionHoldsAtStart(c: Condition, variables: readonly VariableDef[], stages: readonly StageDef[] = []): boolean {
  switch (c.kind) {
    case 'switch':
    case 'selfSwitch':
      return c.value === false
    case 'variable':
      return compare(c.op, variables.find((v) => v.id === c.id)?.initial ?? 0, c.value)
    case 'stage': {
      const stage = stages.find((s) => s.id === c.id)
      if (!stage) return false
      const current = stage.values.findIndex((v) => v.id === stage.initial)
      const wanted = stage.values.findIndex((v) => v.id === c.value)
      return wanted >= 0 && compare(c.op, current >= 0 ? current : 0, wanted)
    }
    case 'hasItem':
      return false
  }
}

/** Index of the state that would run with nothing set (the last state whose conditions all hold), or -1. */
export function defaultActiveStateIndex(states: readonly EventState[], variables: readonly VariableDef[], stages: readonly StageDef[] = []): number {
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i].conditions.every((c) => conditionHoldsAtStart(c, variables, stages))) return i
  }
  return -1
}

// ── templates ───────────────────────────────────────────────────────────────────────────────────

export interface EventTemplate {
  id: string
  label: string
  description: string
  icon: string
  /** Builds fresh commands (and optionally extra states) every call. */
  build: () => { commands: Command[]; extraStates?: EventState[] }
}

/** A second state for a template; `commands` are turned into its graph. */
function extraState(name: string, partial: Partial<Omit<EventState, 'graph'>> & { commands?: Command[] }): EventState {
  const { commands, ...rest } = partial
  const state = { ...createDefaultEventState(name), ...rest }
  return commands ? { ...state, graph: commandsToGraph(commands) } : state
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'dialogue',
    label: 'Dialogue',
    description: 'A single line of text.',
    icon: 'message-square',
    build: () => ({ commands: [createCommand('showText', { text: 'Hello traveler!' })] }),
  },
  {
    id: 'yes-no',
    label: 'Yes / No question',
    description: 'Ask, then react to the answer.',
    icon: 'list',
    build: () => {
      const yes = createCommand('showText', { text: 'Wonderful!' })
      const no = createCommand('showText', { text: 'Maybe another time.' })
      const choices = createCommand('showChoices')
      choices.branches = { opt1: [yes], opt2: [no] }
      return { commands: [createCommand('showText', { text: 'Do you want to continue?' }), choices] }
    },
  },
  {
    id: 'give-item',
    label: 'Give item & hide',
    description: 'Hands out an item once, then a second state hides the entity.',
    icon: 'package-plus',
    build: () => ({
      commands: [
        createCommand('giveItem', { item: 'potion', qty: 1 }),
        createCommand('showText', { text: 'You found a Potion!' }),
        createCommand('setSelfSwitch', { key: 'A', value: true }),
      ],
      extraStates: [
        extraState('Taken', {
          conditions: [{ kind: 'selfSwitch', key: 'A', value: true }],
          solid: false,
          appearance: { visible: false },
        }),
      ],
    }),
  },
  {
    id: 'warp',
    label: 'Warp',
    description: 'Fade out and move the player to another map.',
    icon: 'door-open',
    build: () => ({ commands: [createCommand('warp')] }),
  },
  {
    id: 'chest',
    label: 'Open chest',
    description: 'Gives an item once, then shows the opened chest.',
    icon: 'package-plus',
    build: () => ({
      commands: [
        createCommand('giveItem', { item: 'potion', qty: 1 }),
        createCommand('showText', { text: 'You found a Potion!' }),
        createCommand('setSelfSwitch', { key: 'A', value: true }),
      ],
      extraStates: [
        extraState('Opened', {
          conditions: [{ kind: 'selfSwitch', key: 'A', value: true }],
          appearance: { frame: 1 },
          commands: [createCommand('showText', { text: 'The chest is empty.' })],
        }),
      ],
    }),
  },
]

/** True when a state's graph has nothing but its start node. */
export function isEmptyGraph(state: Pick<EventState, 'graph'>): boolean {
  return commandNodes(state.graph).length === 0
}

/**
 * Starts a state from a template: the template's commands become the state's graph (laid out) and its extra
 * states are appended (skipped when the event already has more than this state, so applying twice stays
 * tidy). Only an empty state takes a template; otherwise nothing changes.
 */
export function applyTemplate(states: EventState[], stateId: string, template: EventTemplate): { states: EventState[]; selectId: string | null } {
  const state = states.find((p) => p.id === stateId)
  if (!state || !isEmptyGraph(state)) return { states, selectId: null }
  const built = template.build()
  const graph = commandsToGraph(built.commands)
  let next = updateState(states, stateId, { graph })
  if (built.extraStates && states.length === 1) next = [...next, ...built.extraStates]
  return { states: next, selectId: built.commands[0]?.id ?? null }
}

// ── contexts ────────────────────────────────────────────────────────────────────────────────────

export function buildSummaryContext(env: Pick<EventEnv, 'switches' | 'variables' | 'maps' | 'sprites' | 'entities'> & { stages?: EventEnv['stages']; commonEvents?: EventEnv['commonEvents'] }): SummaryContext {
  const stages = env.stages ?? []
  return {
    switchName: (id) => env.switches.find((s) => s.id === id)?.name,
    variableName: (id) => env.variables.find((v) => v.id === id)?.name,
    stageName: (id) => stages.find((s) => s.id === id)?.name,
    stageValueName: (stageId, valueId) => stages.find((s) => s.id === stageId)?.values.find((v) => v.id === valueId)?.name,
    mapName: (id) => env.maps.find((m) => m.id === id)?.name,
    spriteName: (id) => env.sprites.find((s) => s.id === id)?.name,
    entityName: (id) => env.entities.find((e) => e.id === id)?.name,
    commonEventName: (id) => env.commonEvents?.find((e) => e.id === id)?.name,
  }
}

export function buildValidationContext(env: Pick<EventEnv, 'switches' | 'variables' | 'maps' | 'sprites' | 'entities'> & { stages?: EventEnv['stages']; commonEvents?: EventEnv['commonEvents'] }): ValidationContext {
  const stages = env.stages ?? []
  return {
    switchIds: env.switches.map((s) => s.id),
    variableIds: env.variables.map((v) => v.id),
    stageIds: stages.map((s) => s.id),
    stageValues: Object.fromEntries(stages.map((s) => [s.id, s.values.map((v) => v.id)])),
    mapIds: env.maps.map((m) => m.id),
    spriteIds: env.sprites.map((s) => s.id),
    entityIds: env.entities.map((e) => e.id),
    // Without a list (tests, hosts that have none) common event ids are not checked.
    ...(env.commonEvents ? { commonIds: env.commonEvents.map((e) => e.id) } : {}),
  }
}

// ── problems ────────────────────────────────────────────────────────────────────────────────────

export interface Problem {
  stateId: string
  stateIndex: number
  severity: IssueSeverity
  code: string
  message: string
  scope: 'node' | 'conditions' | 'appearance'
  nodeId?: string
}

export function severityRank(s: IssueSeverity): number {
  return s === 'error' ? 0 : 1
}

/** The worst severity of a list of issues, or null. */
export function worstSeverity(issues: readonly { severity: IssueSeverity }[] | undefined): IssueSeverity | null {
  if (!issues || issues.length === 0) return null
  return issues.some((i) => i.severity === 'error') ? 'error' : 'warning'
}

export function groupIssuesByNode(issues: readonly GraphIssue[]): Map<string, GraphIssue[]> {
  const map = new Map<string, GraphIssue[]>()
  for (const issue of issues) {
    if (!issue.nodeId) continue
    const list = map.get(issue.nodeId)
    if (list) list.push(issue)
    else map.set(issue.nodeId, [issue])
  }
  return map
}

/** Validation of one state: conditions, appearance and the graph. Never throws. */
export function validateState(state: EventState, ctx: ValidationContext): { nodeIssues: GraphIssue[]; stateProblems: Omit<Problem, 'stateId' | 'stateIndex'>[] } {
  const stateProblems: Omit<Problem, 'stateId' | 'stateIndex'>[] = []
  for (const c of validateConditions(state.conditions, ctx)) {
    stateProblems.push({ severity: c.severity, code: c.code, message: `Condition ${c.index + 1}: ${c.message}`, scope: 'conditions' })
  }
  const asset = state.appearance?.asset
  if (asset && ctx.spriteIds && !ctx.spriteIds.includes(asset)) {
    stateProblems.push({ severity: 'warning', code: 'dangling-sprite', message: `Appearance sprite "${asset}" does not exist`, scope: 'appearance' })
  }
  return { nodeIssues: validateGraph(state.graph, ctx), stateProblems }
}

export function collectProblems(states: readonly EventState[], ctx: ValidationContext): Problem[] {
  const out: Problem[] = []
  states.forEach((state, stateIndex) => {
    const { nodeIssues, stateProblems } = validateState(state, ctx)
    for (const p of stateProblems) out.push({ ...p, stateId: state.id, stateIndex })
    for (const i of nodeIssues) {
      out.push({
        stateId: state.id,
        stateIndex,
        severity: i.severity,
        code: i.code,
        message: i.message,
        scope: 'node',
        nodeId: i.nodeId || undefined,
      })
    }
  })
  return out.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.stateIndex - b.stateIndex)
}

export function countBySeverity(problems: readonly { severity: IssueSeverity }[]): { errors: number; warnings: number } {
  let errors = 0
  let warnings = 0
  for (const p of problems) {
    if (p.severity === 'error') errors++
    else warnings++
  }
  return { errors, warnings }
}
