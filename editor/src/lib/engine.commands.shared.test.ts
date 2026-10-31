/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import { describe, it, expect } from 'vitest'
import {
  COMMAND_CATALOG,
  COMMAND_CATEGORIES,
  cloneCommands,
  commandsInCategory,
  countCommands,
  createCommand,
  createSequentialIdGenerator,
  describeCondition,
  duplicateCommand,
  findCommand,
  getBranchDefs,
  getCommandDef,
  insertCommand,
  moveCommand,
  removeCommand,
  summarizeCommand,
  updateCommandParams,
  validateCommands,
  validateConditions,
  walkCommands,
} from '../../../shared/engine/index'
import type { Command } from '../../../shared/engine/index'

// The catalog of docs/engine-design.md section 3: type -> status.
const DOC_CATALOG: Record<string, 'implemented' | 'planned'> = {
  showText: 'implemented', showChoices: 'implemented',
  conditional: 'implemented', branchStage: 'implemented', loop: 'implemented', breakLoop: 'implemented', exitEvent: 'implemented', wait: 'implemented', comment: 'implemented', callCommonEvent: 'planned',
  setSwitch: 'implemented', setVariable: 'implemented', setStage: 'implemented', setSelfSwitch: 'implemented',
  setFacing: 'implemented', moveRoute: 'implemented', setVisible: 'implemented', changeSprite: 'implemented', playAnimation: 'implemented', faceTowards: 'implemented',
  warp: 'implemented', fadeScreen: 'implemented', shakeScreen: 'implemented', tintScreen: 'planned', setWeather: 'planned',
  playSound: 'planned', playMusic: 'planned', stopMusic: 'planned',
  giveItem: 'implemented', removeItem: 'implemented', givePokemon: 'planned', healParty: 'planned', startBattle: 'planned', openShop: 'planned', startQuest: 'planned', completeQuest: 'planned',
  emit: 'implemented', runScript: 'planned',
}
const DOC_CATEGORY: Record<string, string> = {
  showText: 'dialogue', showChoices: 'dialogue', conditional: 'flow', branchStage: 'flow', loop: 'flow', breakLoop: 'flow', exitEvent: 'flow', wait: 'flow', comment: 'flow', callCommonEvent: 'flow',
  setSwitch: 'state', setVariable: 'state', setStage: 'state', setSelfSwitch: 'state',
  setFacing: 'character', moveRoute: 'character', setVisible: 'character', changeSprite: 'character', playAnimation: 'character', faceTowards: 'character',
  warp: 'map', fadeScreen: 'map', shakeScreen: 'map', tintScreen: 'map', setWeather: 'map',
  playSound: 'audio', playMusic: 'audio', stopMusic: 'audio',
  giveItem: 'rpg', removeItem: 'rpg', givePokemon: 'rpg', healParty: 'rpg', startBattle: 'rpg', openShop: 'rpg', startQuest: 'rpg', completeQuest: 'rpg',
  emit: 'advanced', runScript: 'advanced',
}

let counter = 0
const ids = () => `c${++counter}`
const mk = (type: string, params?: Record<string, unknown>) => createCommand(type, params, ids)

describe('COMMAND_CATALOG', () => {
  it('contains exactly the documented commands with the documented status and category', () => {
    expect(Object.keys(COMMAND_CATALOG).sort()).toEqual(Object.keys(DOC_CATALOG).sort())
    for (const [type, status] of Object.entries(DOC_CATALOG)) {
      expect(COMMAND_CATALOG[type].status, type).toBe(status)
      expect(COMMAND_CATALOG[type].category, type).toBe(DOC_CATEGORY[type])
      expect(COMMAND_CATALOG[type].type).toBe(type)
    }
  })

  it('every definition is complete and self-consistent', () => {
    const categories = COMMAND_CATEGORIES.map((c) => c.id)
    for (const d of Object.values(COMMAND_CATALOG)) {
      expect(categories).toContain(d.category)
      expect(d.label).toBeTruthy()
      expect(d.description.length).toBeGreaterThan(8)
      expect(d.icon).toMatch(/^[a-z][a-z0-9-]*$/)
      // every non-compound param key has a default, visibleWhen refers to a default key
      for (const f of d.params) {
        const keys = f.kind === 'position' ? f.keys! : [f.key]
        for (const k of keys) expect(Object.keys(d.defaultParams), `${d.type}.${k}`).toContain(k)
        if (f.visibleWhen) expect(Object.keys(d.defaultParams)).toContain(f.visibleWhen.key)
        if (f.kind === 'select') expect(f.options?.length).toBeGreaterThan(0)
      }
      // defaults summarise without throwing and pass validation without errors
      expect(typeof d.summarize(d.defaultParams)).toBe('string')
      const cmd = createCommand(d.type, undefined, ids)
      const inLoop = d.type === 'breakLoop' ? [createCommand('loop', undefined, ids)] : null
      if (inLoop) inLoop[0].branches!.body.push(cmd)
      const errors = validateCommands(inLoop ?? [cmd]).filter((i) => i.severity === 'error')
      expect(errors, d.type).toEqual([])
    }
    expect(commandsInCategory('dialogue').map((d) => d.type)).toEqual(['showText', 'showChoices'])
  })

  it('static and param-derived branches', () => {
    expect(getBranchDefs(mk('conditional')).map((b) => b.id)).toEqual(['then', 'else'])
    expect(getBranchDefs(mk('loop')).map((b) => b.id)).toEqual(['body'])
    expect(getBranchDefs(mk('wait'))).toEqual([])
    expect(getBranchDefs({ type: 'nope', params: {} })).toEqual([])
    const choices = mk('showChoices', { options: [{ id: 'a', label: 'A' }, { id: 'b', label: '' }], cancel: 'branch' })
    expect(getBranchDefs(choices)).toEqual([{ id: 'a', label: 'A' }, { id: 'b', label: 'b' }, { id: 'cancel', label: 'Cancel' }])
    expect(getBranchDefs(mk('showChoices', { cancel: 'last' })).map((b) => b.id)).toEqual(['opt1', 'opt2'])
    expect(getBranchDefs({ type: 'showChoices', params: { options: 5 } as any })).toEqual([])
  })

  it('summarize is human readable and can use names', () => {
    const c = (type: string, params: any) => summarizeCommand(mk(type, params), {
      switchName: (id) => (id === 's1' ? 'Door open' : undefined),
      variableName: (id) => (id === 'v1' ? 'Steps' : undefined),
      mapName: (id) => (id === 'city' ? 'City' : undefined),
    })
    expect(c('showText', { speaker: 'Mom', text: 'Take care!' })).toBe('Mom: "Take care!"')
    expect(c('showText', { text: '' })).toBe('(empty text)')
    expect(c('showText', { text: 'x'.repeat(100) }).length).toBeLessThan(60)
    expect(c('setSwitch', { id: 's1', value: false })).toBe('Switch "Door open" = OFF')
    expect(c('setSwitch', { id: 'zz' })).toBe('Switch "zz" = ON')
    expect(c('setVariable', { id: 'v1', op: 'add', operand: 'const', value: 2 })).toBe('Variable "Steps" += 2')
    expect(c('setVariable', { id: 'v1', operand: 'random', min: 1, max: 6 })).toBe('Variable "Steps" = random 1..6')
    expect(c('warp', { map: 'city', x: 3, y: 4 })).toBe('Warp to "City" (3, 4)')
    expect(c('wait', { ms: 250 })).toBe('Wait 250 ms')
    expect(c('conditional', { conditions: [{ kind: 'switch', id: 's1', value: true }, { kind: 'selfSwitch', key: 'A', value: false }] })).toBe(
      'If Switch "Door open" is ON and Self switch A is OFF',
    )
    expect(c('showChoices', {})).toBe('Choices: Yes / No')
    expect(c('moveRoute', { target: 'player', steps: [{ type: 'up' }, { type: 'wait', value: 200 }] })).toBe('Move the player: up, wait 200')
    expect(c('setFacing', { target: { entity: 'e1' }, facing: 'left' })).toBe('Face "e1" left')
    expect(summarizeCommand({ id: 'x', type: 'bogus', params: {} })).toBe('Unknown command "bogus"')
    expect(describeCondition({ kind: 'variable', id: 'v1', op: '>=', value: 3 })).toBe('Variable "v1" >= 3')
    expect(describeCondition({ kind: 'hasItem', item: 'potion', qty: 2 })).toBe('Has 2× potion')
    expect(describeCondition(null)).toBe('(invalid condition)')
  })

  it('getCommandDef ignores prototype names', () => {
    expect(getCommandDef('constructor')).toBeUndefined()
    expect(getCommandDef('toString')).toBeUndefined()
    expect(getCommandDef('wait')).toBe(COMMAND_CATALOG.wait)
  })
})

describe('createCommand', () => {
  it('uses the injected id function and deep-copies default params', () => {
    const idFn = createSequentialIdGenerator('x')
    const a = createCommand('showChoices', undefined, idFn)
    const b = createCommand('showChoices', undefined, idFn)
    expect([a.id, b.id]).toEqual(['x-1', 'x-2'])
    ;(a.params.options as any[])[0].label = 'changed'
    expect((b.params.options as any[])[0].label).toBe('Yes')
    expect((COMMAND_CATALOG.showChoices.defaultParams.options as any[])[0].label).toBe('Yes')
  })

  it('merges params, creates empty branches, and has a uuid-like default id', () => {
    const w = createCommand('wait', { ms: 42 })
    expect(w.params).toEqual({ ms: 42 })
    expect(w.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(w.branches).toBeUndefined()
    expect(createCommand('conditional').branches).toEqual({ then: [], else: [] })
    expect(createCommand('showChoices', { cancel: 'branch' }).branches).toEqual({ opt1: [], opt2: [], cancel: [] })
    const unknown = createCommand('mystery', { a: 1 })
    expect(unknown.params).toEqual({ a: 1 })
    expect(unknown.branches).toBeUndefined()
  })
})

// A tree used by the helper tests:
//  0 text
//  1 cond(then: [2 wait, 3 loop(body:[4 break])], else: [5 comment])
//  6 exit
function tree(): Command[] {
  const c = (id: string, type: string, extra: Partial<Command> = {}): Command => ({ id, type, params: {}, ...extra })
  return [
    c('text', 'showText'),
    c('cond', 'conditional', { branches: { then: [c('wait', 'wait'), c('loop', 'loop', { branches: { body: [c('break', 'breakLoop')] } })], else: [c('note', 'comment')] } }),
    c('exit', 'exitEvent'),
  ]
}

describe('tree helpers', () => {
  it('walkCommands visits depth first in order, with positions, and can stop', () => {
    const seen: string[] = []
    walkCommands(tree(), (cmd, info) => {
      seen.push(`${cmd.id}@${info.path.join('/')}:${info.depth}:${info.parent?.id ?? '-'}:${info.branch ?? '-'}`)
    })
    expect(seen).toEqual([
      'text@0:0:-:-',
      'cond@1:0:-:-',
      'wait@1/then/0:1:cond:then',
      'loop@1/then/1:1:cond:then',
      'break@1/then/1/body/0:2:loop:body',
      'note@1/else/0:1:cond:else',
      'exit@2:0:-:-',
    ])
    const visited: string[] = []
    walkCommands(tree(), (cmd) => {
      visited.push(cmd.id)
      return cmd.id !== 'wait'
    })
    expect(visited).toEqual(['text', 'cond', 'wait'])
    expect(countCommands(tree())).toBe(7)
  })

  it('findCommand returns path info or null', () => {
    const info = findCommand(tree(), 'break')!
    expect(info).toMatchObject({ path: [1, 'then', 1, 'body', 0], parentId: 'loop', branch: 'body', index: 0, depth: 2 })
    expect(info.command.type).toBe('breakLoop')
    expect(findCommand(tree(), 'text')).toMatchObject({ path: [0], parentId: null, branch: null, index: 0, depth: 0 })
    expect(findCommand(tree(), 'nope')).toBeNull()
    expect(findCommand([], 'x')).toBeNull()
  })

  it('insertCommand inserts at root and in branches, immutably, clamping the index', () => {
    const t = tree()
    const snapshot = structuredClone(t)
    const n = mk('wait')
    const root = insertCommand(t, { parentId: null, index: 1 }, n)
    expect(root.map((c) => c.id)).toEqual(['text', n.id, 'cond', 'exit'])
    expect(insertCommand(t, { parentId: null, index: 99 }, n).at(-1)).toBe(n)
    expect(insertCommand(t, { parentId: null, index: -5 }, n)[0]).toBe(n)
    const deep = insertCommand(t, { parentId: 'loop', branch: 'body', index: 0 }, n)
    expect(findCommand(deep, n.id)!.path).toEqual([1, 'then', 1, 'body', 0])
    expect(findCommand(deep, 'break')!.path).toEqual([1, 'then', 1, 'body', 1])
    expect(t).toEqual(snapshot) // input untouched
    expect(deep[0]).toBe(t[0]) // structural sharing for untouched parts
    expect(deep[2]).toBe(t[2])
  })

  it('insertCommand refuses unusable locations by returning the same tree', () => {
    const t = tree()
    const n = mk('wait')
    expect(insertCommand(t, { parentId: 'nope', branch: 'then', index: 0 }, n)).toBe(t)
    expect(insertCommand(t, { parentId: 'cond', index: 0 }, n)).toBe(t)
    expect(insertCommand(t, { parentId: 'cond', branch: 'bogus', index: 0 }, n)).toBe(t)
    expect(insertCommand(t, { parentId: 'text', branch: 'then', index: 0 }, n)).toBe(t) // text has no branches
  })

  it('insertCommand creates a missing but declared branch (choices)', () => {
    const choices = mk('showChoices')
    delete choices.branches
    const out = insertCommand([choices], { parentId: choices.id, branch: 'opt2', index: 0 }, mk('wait'))
    expect(out[0].branches!.opt2).toHaveLength(1)
  })

  it('removeCommand removes subtrees, ignores unknown ids', () => {
    const t = tree()
    expect(countCommands(removeCommand(t, 'loop'))).toBe(5)
    expect(findCommand(removeCommand(t, 'loop'), 'break')).toBeNull()
    expect(removeCommand(t, 'text').map((c) => c.id)).toEqual(['cond', 'exit'])
    expect(removeCommand(t, 'zzz')).toBe(t)
  })

  it('moveCommand moves across lists (index = position after removal) and keeps the subtree', () => {
    const t = tree()
    const down = moveCommand(t, 'text', { parentId: null, index: 2 })
    expect(down.map((c) => c.id)).toEqual(['cond', 'exit', 'text'])
    const into = moveCommand(t, 'exit', { parentId: 'cond', branch: 'else', index: 0 })
    expect(findCommand(into, 'exit')!.path).toEqual([1, 'else', 0])
    const loopOut = moveCommand(t, 'loop', { parentId: null, index: 0 })
    expect(loopOut[0].id).toBe('loop')
    expect(findCommand(loopOut, 'break')!.path).toEqual([0, 'body', 0])
    expect(countCommands(loopOut)).toBe(7)
    const withinSame = moveCommand(t, 'wait', { parentId: 'cond', branch: 'then', index: 1 })
    expect(findCommand(withinSame, 'cond')!.command.branches!.then.map((c) => c.id)).toEqual(['loop', 'wait'])
  })

  it('moveCommand refuses moving into itself or unknown ids', () => {
    const t = tree()
    expect(moveCommand(t, 'cond', { parentId: 'cond', branch: 'then', index: 0 })).toBe(t)
    expect(moveCommand(t, 'cond', { parentId: 'loop', branch: 'body', index: 0 })).toBe(t)
    expect(moveCommand(t, 'nope', { parentId: null, index: 0 })).toBe(t)
    expect(moveCommand(t, 'text', { parentId: 'ghost', branch: 'then', index: 0 })).toBe(t)
  })

  it('duplicateCommand copies the whole subtree with new ids right after the original', () => {
    const t = tree()
    const { tree: out, newId } = duplicateCommand(t, 'cond', createSequentialIdGenerator('d'))
    expect(newId).toBe('d-1')
    expect(out.map((c) => c.id)).toEqual(['text', 'cond', 'd-1', 'exit'])
    const copy = out[2]
    expect(copy.branches!.then.map((c) => c.id)).toEqual(['d-2', 'd-3'])
    expect(copy.branches!.then[1].branches!.body[0].id).toBe('d-4')
    expect(copy.branches!.then[1].branches!.body[0].type).toBe('breakLoop')
    const allIds: string[] = []
    walkCommands(out, (c) => void allIds.push(c.id))
    expect(new Set(allIds).size).toBe(allIds.length)
    const nested = duplicateCommand(t, 'wait')
    expect(findCommand(nested.tree, nested.newId!)!.path).toEqual([1, 'then', 1])
    expect(duplicateCommand(t, 'zzz')).toEqual({ tree: t, newId: null })
  })

  it('cloneCommands deep copies, optionally with fresh ids, keeping choice option ids', () => {
    const choices = mk('showChoices')
    choices.branches!.opt1.push(mk('wait'))
    const same = cloneCommands([choices])
    expect(same).toEqual([choices])
    expect(same[0]).not.toBe(choices)
    expect(same[0].branches!.opt1[0]).not.toBe(choices.branches!.opt1[0])
    same[0].params.cancel = 'last'
    expect(choices.params.cancel).toBe('none')
    const fresh = cloneCommands([choices], true)
    expect(fresh[0].id).not.toBe(choices.id)
    expect(fresh[0].branches!.opt1[0].id).not.toBe(choices.branches!.opt1[0].id)
    expect(Object.keys(fresh[0].branches!)).toEqual(['opt1', 'opt2'])
    expect(fresh[0].params).toEqual(choices.params)
  })

  it('updateCommandParams re-syncs branches for choices', () => {
    const choices = mk('showChoices')
    choices.branches!.opt1.push(mk('wait'))
    const out = updateCommandParams([choices], choices.id, { options: [{ id: 'opt1', label: 'Yes' }, { id: 'opt3', label: 'Maybe' }] })
    expect(Object.keys(out[0].branches!).sort()).toEqual(['opt1', 'opt2', 'opt3']) // opt2 kept (orphan until user cleans up)
    expect(out[0].branches!.opt3).toEqual([])
    expect(out[0].branches!.opt1).toHaveLength(1)
    const issues = validateCommands(out)
    expect(issues.find((i) => i.code === 'orphan-branch')?.message).toMatch(/opt2/)
    expect(updateCommandParams([choices], 'nope', {})).toEqual([choices])
  })
})

describe('validateCommands', () => {
  const codes = (cmds: Command[], ctx = {}) => validateCommands(cmds, ctx).map((i) => `${i.severity}:${i.code}`)

  it('accepts a healthy tree', () => {
    const cond = mk('conditional', { conditions: [{ kind: 'switch', id: 's1', value: true }] })
    cond.branches!.then.push(mk('showText', { text: 'hi' }))
    const loop = mk('loop')
    loop.branches!.body.push(mk('wait'), mk('breakLoop'))
    cond.branches!.else.push(loop)
    expect(validateCommands([cond], { switchIds: ['s1'] })).toEqual([])
  })

  it('reports unknown command types with path and id', () => {
    const issues = validateCommands([mk('wait'), { id: 'q', type: 'teleport', params: {} }])
    expect(issues).toEqual([{ commandId: 'q', path: [1], severity: 'error', code: 'unknown-command', message: 'Unknown command type "teleport"' }])
  })

  it('reports unset required params as warnings and bad types as errors', () => {
    expect(codes([mk('showText')])).toEqual(['warning:missing-param'])
    expect(codes([mk('setSwitch')])).toEqual(['warning:missing-param'])
    expect(codes([mk('wait', { ms: 'soon' })])).toEqual(['error:bad-param'])
    expect(codes([mk('wait', { ms: -5 })])).toEqual(['warning:out-of-range'])
    expect(codes([mk('setFacing', { facing: 'sideways' })])).toEqual(['error:bad-param'])
    expect(codes([mk('setSelfSwitch', { key: 'Z' })])).toEqual(['error:bad-param'])
    expect(codes([mk('warp', { x: 'a' })])).toEqual(['warning:missing-param', 'error:bad-param'])
    expect(codes([mk('setVisible', { visible: 'yes' })])).toEqual(['error:bad-param'])
    expect(codes([mk('tintScreen', { color: 'red' })])).toEqual(['error:bad-param'])
  })

  it('only validates fields that are visible', () => {
    // operand=const hides sourceId (required) => no warning
    expect(codes([mk('setVariable', { id: 'v' })])).toEqual([])
    expect(codes([mk('setVariable', { id: 'v', operand: 'variable' })])).toEqual(['warning:missing-param'])
  })

  it('reports dangling references only when the lists are given', () => {
    const cmds = [
      mk('setSwitch', { id: 'gone' }),
      mk('setVariable', { id: 'vgone' }),
      mk('warp', { map: 'nowhere' }),
      mk('changeSprite', { asset: 'objects/ghost' }),
      mk('faceTowards', { other: { entity: 'ghost' } }),
    ]
    expect(codes(cmds)).toEqual([])
    const all = validateCommands(cmds, { switchIds: ['a'], variableIds: ['b'], mapIds: ['c'], spriteIds: ['d'], entityIds: ['e'] })
    expect(all.map((i) => i.code)).toEqual(['dangling-switch', 'dangling-variable', 'dangling-map', 'dangling-sprite', 'dangling-entity'])
    expect(all.every((i) => i.severity === 'error')).toBe(true)
    expect(all[0].message).toMatch(/gone/)
    expect(validateCommands([mk('setSwitch', { id: 'a' })], { switchIds: ['a'] })).toEqual([])
  })

  it('checks references inside conditions', () => {
    const c = mk('conditional', { conditions: [{ kind: 'switch', id: 'x', value: true }, { kind: 'variable', id: 'y', op: '>', value: 1 }] })
    expect(codes([c], { switchIds: [], variableIds: [] })).toEqual(['error:dangling-switch', 'error:dangling-variable'])
    expect(codes([mk('conditional')])).toEqual(['warning:missing-param', 'warning:missing-param'])
  })

  it('breakLoop is only allowed inside a loop (also through other branches)', () => {
    expect(codes([mk('breakLoop')])).toEqual(['error:break-outside-loop'])
    const cond = mk('conditional', { conditions: [{ kind: 'selfSwitch', key: 'A', value: true }] })
    cond.branches!.then.push(mk('breakLoop'))
    expect(codes([cond])).toEqual(['error:break-outside-loop'])
    const loop = mk('loop')
    loop.branches!.body.push(cond)
    expect(codes([loop])).toEqual([])
    const issue = validateCommands([cond])[0]
    expect(issue.path).toEqual([0, 'then', 0])
  })

  it('validates choices: empty, duplicate ids, labels, orphan branches', () => {
    expect(codes([mk('showChoices', { options: [] })])).toEqual(['warning:missing-param', 'error:empty-choices'])
    const dup = mk('showChoices', { options: [{ id: 'a', label: 'A' }, { id: 'a', label: '' }, { label: 'no id' }] })
    expect(codes([dup])).toEqual(['error:bad-choice', 'warning:missing-param', 'error:bad-choice'])
    const orphan = mk('showChoices', { cancel: 'none' })
    orphan.branches!.cancel = [mk('wait')]
    const issues = validateCommands([orphan])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'orphan-branch', severity: 'warning', path: [0] })
    expect(issues[0].message).toMatch(/cancel/)
    // a cancel branch is legitimate when cancel = 'branch'
    const ok = mk('showChoices', { cancel: 'branch' })
    ok.branches!.cancel.push(mk('wait'))
    expect(validateCommands([ok])).toEqual([])
  })

  it('validates move routes and targets', () => {
    expect(codes([mk('moveRoute', { steps: [{ type: 'up' }, { type: 'turn', value: 'left' }, { type: 'wait', value: 100 }, { type: 'speed', value: 80 }] })])).toEqual([])
    expect(codes([mk('moveRoute', { steps: [{ type: 'fly' }, { type: 'wait' }, { type: 'turn', value: 'x' }] })])).toEqual(['error:bad-param', 'error:bad-param', 'error:bad-param'])
    expect(codes([mk('moveRoute', { steps: 'x' })])).toEqual(['error:bad-param'])
    expect(codes([mk('setVisible', { target: 'nobody' })])).toEqual(['error:bad-param'])
    expect(codes([mk('setVisible', { target: { entity: 'e1' } })], { entityIds: ['e1'] })).toEqual([])
  })

  it('reports duplicate ids, malformed commands and malformed branches without throwing', () => {
    const a = mk('wait')
    expect(codes([a, { ...a }])).toEqual(['error:duplicate-command-id'])
    expect(() => validateCommands([null, 3, 'x', { type: 5 }, { id: 'q', type: 'loop', branches: 5 }, { id: 'r', type: 'loop', branches: { body: 'x' } }] as any)).not.toThrow()
    const issues = validateCommands([null, { id: 'q', type: 'loop', params: {}, branches: { body: 'x' } }] as any)
    expect(issues.map((i) => i.code)).toEqual(['bad-command', 'bad-branches'])
    expect(validateCommands('nope' as any)).toEqual([])
  })

  it('validateConditions covers every kind', () => {
    expect(validateConditions([{ kind: 'switch', id: 'a', value: true }, { kind: 'variable', id: 'v', op: '<=', value: 2 }, { kind: 'selfSwitch', key: 'B', value: false }, { kind: 'selfSwitch', key: 'opened', value: true }, { kind: 'stage', id: 'cat', op: '>=', value: 'found' }, { kind: 'hasItem', item: 'x', qty: 1 }])).toEqual([])
    const bad = validateConditions([{ kind: 'switch', id: 'a' }, { kind: 'variable', id: 'v', op: '~', value: 'x' }, { kind: 'selfSwitch', key: '' }, { kind: 'hasItem', item: '', qty: 0 }, { kind: 'zzz' }, 4])
    expect(bad.map((i) => `${i.index}:${i.code}`)).toEqual(['0:bad-condition', '1:bad-condition', '1:bad-condition', '2:bad-condition', '2:bad-condition', '3:missing-param', '3:bad-condition', '4:bad-condition', '5:bad-condition'])
    expect(validateConditions('x')[0].code).toBe('bad-conditions')
  })
})
