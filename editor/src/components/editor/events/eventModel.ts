// Pure helpers behind the event editor: state operations, command-tree edits (on top of the shared
// helpers), clipboard format, templates, validation/summary contexts. No React in here, so everything
// is unit-testable and every function returns new data (inputs are never mutated).

import type {
  Command,
  CommandIssue,
  Condition,
  EventState,
  IssueSeverity,
  SummaryContext,
  ValidationContext,
  StageDef,
  VariableDef,
} from '../../../../../shared/engine/types'
import {
  cloneCommands,
  createCommand,
  findCommand,
  getBranchDefs,
  getCommandDef,
  insertCommand,
  moveCommand,
  removeCommand,
  validateCommands,
  validateConditions,
} from '../../../../../shared/engine/commands'
import { createDefaultEventState } from '../../../../../shared/engine/components'
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
    ...cloneJson({ ...source, commands: [] as Command[] }),
    id: newId(),
    name: source.name.trim() ? `${source.name.trim()} copy` : '',
    commands: cloneCommands(source.commands, true),
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

// ── command tree ────────────────────────────────────────────────────────────────────────────────

/** The list a command lives in: root (parentId null) or one branch of a parent. */
export function getList(tree: Command[], parentId: string | null, branch: string | null): Command[] | null {
  if (parentId === null) return tree
  const parent = findCommand(tree, parentId)
  if (!parent || branch === null) return null
  return parent.command.branches?.[branch] ?? []
}

function replaceCommand(list: Command[], id: string, fn: (c: Command) => Command): Command[] {
  let changed = false
  const next = list.map((c) => {
    if (c.id === id) {
      const replaced = fn(c)
      if (replaced !== c) changed = true
      return replaced
    }
    if (c.branches) {
      let sub = false
      const branches: Record<string, Command[]> = {}
      for (const [k, v] of Object.entries(c.branches)) {
        const r = replaceCommand(v, id, fn)
        if (r !== v) sub = true
        branches[k] = r
      }
      if (sub) {
        changed = true
        return { ...c, branches }
      }
    }
    return c
  })
  return changed ? next : list
}

/**
 * Patches a command's params. New branch ids get an empty list (shared helper behaviour); ids in
 * `pruneBranches` are deleted together with their commands (used when a choice option is removed).
 */
export function setCommandParams(tree: Command[], id: string, patch: Record<string, unknown>, pruneBranches: string[] = []): Command[] {
  const info = findCommand(tree, id)
  if (!info) return tree
  const params = { ...info.command.params, ...patch }
  const defs = getBranchDefs({ type: info.command.type, params })
  return replaceCommand(tree, id, (c) => {
    const branches: Record<string, Command[]> = { ...(c.branches ?? {}) }
    for (const b of defs) if (!branches[b.id]) branches[b.id] = []
    for (const b of pruneBranches) delete branches[b]
    const next: Command = { ...c, params }
    if (Object.keys(branches).length > 0) next.branches = branches
    else delete next.branches
    return next
  })
}

/** Removes a whole branch (list and commands) of a command - for branches that no longer exist. */
export function removeBranch(tree: Command[], id: string, branch: string): Command[] {
  return replaceCommand(tree, id, (c) => {
    if (!c.branches || !Object.hasOwn(c.branches, branch)) return c
    const branches = { ...c.branches }
    delete branches[branch]
    const next: Command = { ...c }
    if (Object.keys(branches).length > 0) next.branches = branches
    else delete next.branches
    return next
  })
}

/** Where new commands go. */
export type InsertTarget =
  | { kind: 'before'; id: string }
  | { kind: 'after'; id: string }
  | { kind: 'end'; parentId: string | null; branch: string | null }

/** Inserts commands (kept in order) at the target. Unusable target: tree unchanged. */
export function insertCommands(tree: Command[], target: InsertTarget, cmds: Command[]): Command[] {
  let parentId: string | null
  let branch: string | null
  let index: number
  if (target.kind === 'end') {
    parentId = target.parentId
    branch = target.branch
    const list = getList(tree, parentId, branch)
    if (!list) return tree
    index = list.length
  } else {
    const info = findCommand(tree, target.id)
    if (!info) return tree
    parentId = info.parentId
    branch = info.branch
    index = info.index + (target.kind === 'after' ? 1 : 0)
  }
  let next = tree
  cmds.forEach((c, i) => {
    next = insertCommand(next, { parentId, branch, index: index + i }, c)
  })
  return next
}

/** Swaps a command with its neighbour inside the same list (Alt+Up/Down). */
export function moveWithin(tree: Command[], id: string, delta: -1 | 1): Command[] {
  const info = findCommand(tree, id)
  if (!info) return tree
  const list = getList(tree, info.parentId, info.branch)
  const to = info.index + delta
  if (!list || to < 0 || to >= list.length) return tree
  return moveCommand(tree, id, { parentId: info.parentId, branch: info.branch, index: to })
}

export type DropTarget = InsertTarget

/**
 * Drag & drop: moves `dragId` to the drop target. Returns the same tree when nothing would change
 * (dropped on itself, into its own subtree or onto its current position).
 */
export function dropCommand(tree: Command[], dragId: string, target: DropTarget): Command[] {
  const drag = findCommand(tree, dragId)
  if (!drag) return tree
  let parentId: string | null
  let branch: string | null
  let index: number
  if (target.kind === 'end') {
    if (target.parentId === dragId) return tree
    parentId = target.parentId
    branch = target.branch
    const list = getList(tree, parentId, branch)
    if (!list) return tree
    index = list.length
  } else {
    if (target.id === dragId) return tree
    const info = findCommand(tree, target.id)
    if (!info) return tree
    parentId = info.parentId
    branch = info.branch
    index = info.index + (target.kind === 'after' ? 1 : 0)
  }
  const sameList = drag.parentId === parentId && drag.branch === branch
  if (sameList && drag.index < index) index -= 1
  if (sameList && drag.index === index) return tree
  return moveCommand(tree, dragId, { parentId, branch, index })
}

/** Ids of the rows the list shows, top to bottom (children of collapsed commands are hidden). */
export function visibleOrder(tree: Command[], collapsed: ReadonlySet<string>): string[] {
  const out: string[] = []
  const walk = (list: Command[]) => {
    for (const c of list) {
      out.push(c.id)
      if (c.branches && !collapsed.has(c.id)) {
        for (const b of orderedBranches(c)) walk(c.branches[b.id] ?? [])
      }
    }
  }
  walk(tree)
  return out
}

export interface BranchView {
  id: string
  label: string
  /** False for branches the command no longer exposes (their commands never run). */
  active: boolean
}

/** Branches of a command in display order: the defined ones first, then orphans that still hold commands. */
export function orderedBranches(cmd: Command): BranchView[] {
  const defs = getBranchDefs(cmd)
  const out: BranchView[] = defs.map((d) => ({ id: d.id, label: d.label, active: true }))
  for (const [id, list] of Object.entries(cmd.branches ?? {})) {
    if (!defs.some((d) => d.id === id) && Array.isArray(list) && list.length > 0) out.push({ id, label: id, active: false })
  }
  return out
}

/** Header text for a branch row: "Then / Else", "Choice: Yes", "Loop body" ... */
export function branchHeading(cmd: Command, branch: BranchView): string {
  if (!branch.active) return `Removed branch "${branch.label}" (never runs)`
  switch (cmd.type) {
    case 'conditional':
      return branch.id === 'then' ? 'Then' : 'Else'
    case 'showChoices':
      return branch.id === 'cancel' ? 'When cancelled' : `Choice: ${branch.label}`
    case 'loop':
      return 'Loop body'
    default:
      return branch.label
  }
}

/** Which command to select after `id` was removed: the next row, else the previous one, else none. */
export function selectionAfterRemove(tree: Command[], id: string, collapsed: ReadonlySet<string>): string | null {
  const order = visibleOrder(tree, collapsed)
  const at = order.indexOf(id)
  if (at < 0) return null
  const subtree = findCommand(tree, id)
  const skip = new Set<string>()
  if (subtree) {
    const collect = (c: Command) => {
      skip.add(c.id)
      for (const list of Object.values(c.branches ?? {})) list.forEach(collect)
    }
    collect(subtree.command)
  }
  const remaining = order.filter((x) => !skip.has(x))
  const before = order.slice(0, at).filter((x) => !skip.has(x))
  const after = order.slice(at + 1).find((x) => !skip.has(x))
  return after ?? before[before.length - 1] ?? (remaining[0] ?? null)
}

export function removeCommandAndSelect(
  tree: Command[],
  id: string,
  collapsed: ReadonlySet<string>,
): { tree: Command[]; select: string | null } {
  const select = selectionAfterRemove(tree, id, collapsed)
  return { tree: removeCommand(tree, id), select }
}

/** Number of commands inside a branch (0 when it does not exist). */
export function branchCommandCount(cmd: Command, branch: string): number {
  const list = cmd.branches?.[branch]
  if (!Array.isArray(list)) return 0
  let n = 0
  const count = (l: Command[]) => {
    for (const c of l) {
      n++
      for (const sub of Object.values(c.branches ?? {})) count(sub)
    }
  }
  count(list)
  return n
}

// ── clipboard ───────────────────────────────────────────────────────────────────────────────────

const CLIPBOARD_FORMAT = 'elementals/commands'
let memoryClipboard: Command[] | null = null

export function serializeCommands(cmds: Command[]): string {
  return JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, commands: cmds })
}

function isKnownTree(list: unknown): list is Command[] {
  if (!Array.isArray(list)) return false
  return list.every((c) => {
    if (typeof c !== 'object' || c === null) return false
    const cmd = c as Partial<Command>
    if (typeof cmd.type !== 'string' || !getCommandDef(cmd.type)) return false
    if (typeof cmd.params !== 'object' || cmd.params === null || Array.isArray(cmd.params)) return false
    if (cmd.branches === undefined) return true
    if (typeof cmd.branches !== 'object' || cmd.branches === null) return false
    return Object.values(cmd.branches).every(isKnownTree)
  })
}

/** Parses clipboard text; null when it is not a list of known commands. */
export function parseCommands(text: string): Command[] | null {
  try {
    const data = JSON.parse(text) as { format?: unknown; commands?: unknown }
    if (data?.format !== CLIPBOARD_FORMAT || !isKnownTree(data.commands) || data.commands.length === 0) return null
    return data.commands
  } catch {
    return null
  }
}

/** Copies with new ids for every command (the tree you paste never shares ids with the original). */
export function freshCopies(cmds: Command[]): Command[] {
  return cloneCommands(cmds, true)
}

export function setMemoryClipboard(cmds: Command[] | null): void {
  memoryClipboard = cmds ? cloneCommands(cmds) : null
}

export function getMemoryClipboard(): Command[] | null {
  return memoryClipboard ? cloneCommands(memoryClipboard) : null
}

/** Writes commands to the system clipboard (best effort) and always to the in-memory fallback. */
export async function writeCommandClipboard(cmds: Command[]): Promise<void> {
  setMemoryClipboard(cmds)
  try {
    await navigator.clipboard?.writeText(serializeCommands(cmds))
  } catch {
    /* the in-memory copy is enough */
  }
}

/** Reads commands from the system clipboard, falling back to the in-memory copy. */
export async function readCommandClipboard(): Promise<Command[] | null> {
  try {
    const text = await navigator.clipboard?.readText()
    const parsed = text ? parseCommands(text) : null
    if (parsed) return parsed
  } catch {
    /* permission denied or unsupported */
  }
  return getMemoryClipboard()
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

function extraState(name: string, partial: Partial<EventState>): EventState {
  return { ...createDefaultEventState(name), ...partial }
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

/**
 * Applies a template to a state list: the commands go to `target` of the given state, extra states are
 * appended (skipped when the event already has more than this state, so applying twice stays tidy).
 */
export function applyTemplate(
  states: EventState[],
  stateId: string,
  template: EventTemplate,
  target?: InsertTarget,
): { states: EventState[]; selectId: string | null } {
  const state = states.find((p) => p.id === stateId)
  if (!state) return { states, selectId: null }
  const built = template.build()
  const commands = insertCommands(state.commands, target ?? { kind: 'end', parentId: null, branch: null }, built.commands)
  let next = updateState(states, stateId, { commands })
  if (built.extraStates && states.length === 1) next = [...next, ...built.extraStates]
  return { states: next, selectId: built.commands[0]?.id ?? null }
}

// ── contexts ────────────────────────────────────────────────────────────────────────────────────

export function buildSummaryContext(env: Pick<EventEnv, 'switches' | 'variables' | 'maps' | 'sprites' | 'entities'> & { stages?: EventEnv['stages'] }): SummaryContext {
  const stages = env.stages ?? []
  return {
    switchName: (id) => env.switches.find((s) => s.id === id)?.name,
    variableName: (id) => env.variables.find((v) => v.id === id)?.name,
    stageName: (id) => stages.find((s) => s.id === id)?.name,
    stageValueName: (stageId, valueId) => stages.find((s) => s.id === stageId)?.values.find((v) => v.id === valueId)?.name,
    mapName: (id) => env.maps.find((m) => m.id === id)?.name,
    spriteName: (id) => env.sprites.find((s) => s.id === id)?.name,
    entityName: (id) => env.entities.find((e) => e.id === id)?.name,
  }
}

export function buildValidationContext(env: Pick<EventEnv, 'switches' | 'variables' | 'maps' | 'sprites' | 'entities'> & { stages?: EventEnv['stages'] }): ValidationContext {
  const stages = env.stages ?? []
  return {
    switchIds: env.switches.map((s) => s.id),
    variableIds: env.variables.map((v) => v.id),
    stageIds: stages.map((s) => s.id),
    stageValues: Object.fromEntries(stages.map((s) => [s.id, s.values.map((v) => v.id)])),
    mapIds: env.maps.map((m) => m.id),
    spriteIds: env.sprites.map((s) => s.id),
    entityIds: env.entities.map((e) => e.id),
  }
}

// ── problems ────────────────────────────────────────────────────────────────────────────────────

export interface Problem {
  stateId: string
  stateIndex: number
  severity: IssueSeverity
  code: string
  message: string
  scope: 'command' | 'conditions' | 'appearance'
  commandId?: string
}

export function severityRank(s: IssueSeverity): number {
  return s === 'error' ? 0 : 1
}

/** The worst severity of a list of issues, or null. */
export function worstSeverity(issues: readonly { severity: IssueSeverity }[] | undefined): IssueSeverity | null {
  if (!issues || issues.length === 0) return null
  return issues.some((i) => i.severity === 'error') ? 'error' : 'warning'
}

export function groupIssuesByCommand(issues: readonly CommandIssue[]): Map<string, CommandIssue[]> {
  const map = new Map<string, CommandIssue[]>()
  for (const issue of issues) {
    const list = map.get(issue.commandId)
    if (list) list.push(issue)
    else map.set(issue.commandId, [issue])
  }
  return map
}

/** Validation of one state: conditions, appearance and the command tree. Never throws. */
export function validateState(state: EventState, ctx: ValidationContext): { commandIssues: CommandIssue[]; stateProblems: Omit<Problem, 'stateId' | 'stateIndex'>[] } {
  const stateProblems: Omit<Problem, 'stateId' | 'stateIndex'>[] = []
  for (const c of validateConditions(state.conditions, ctx)) {
    stateProblems.push({ severity: c.severity, code: c.code, message: `Condition ${c.index + 1}: ${c.message}`, scope: 'conditions' })
  }
  const asset = state.appearance?.asset
  if (asset && ctx.spriteIds && !ctx.spriteIds.includes(asset)) {
    stateProblems.push({ severity: 'warning', code: 'dangling-sprite', message: `Appearance sprite "${asset}" does not exist`, scope: 'appearance' })
  }
  return { commandIssues: validateCommands(state.commands, ctx), stateProblems }
}

export function collectProblems(states: readonly EventState[], ctx: ValidationContext): Problem[] {
  const out: Problem[] = []
  states.forEach((state, stateIndex) => {
    const { commandIssues, stateProblems } = validateState(state, ctx)
    for (const p of stateProblems) out.push({ ...p, stateId: state.id, stateIndex })
    for (const i of commandIssues) {
      out.push({
        stateId: state.id,
        stateIndex,
        severity: i.severity,
        code: i.code,
        message: i.message,
        scope: 'command',
        commandId: i.commandId || undefined,
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
