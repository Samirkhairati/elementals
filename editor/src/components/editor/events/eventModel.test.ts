import { describe, expect, it } from 'vitest'
import { commandNodes, validateGraph } from '../../../../../shared/engine/graph'
import {
  EVENT_TEMPLATES,
  addState,
  applyTemplate,
  buildSummaryContext,
  buildValidationContext,
  collectProblems,
  conditionHoldsAtStart,
  countBySeverity,
  defaultActiveStateIndex,
  deleteState,
  duplicateState,
  groupIssuesByNode,
  isEmptyGraph,
  moveState,
  stateLabel,
  updateState,
  validateState,
  worstSeverity,
} from './eventModel'
import { cmd, makeEnv, state } from './eventTestUtils'

describe('states', () => {
  it('adds, names and appends states', () => {
    const base = [state('p1')]
    const r = addState(base)
    expect(r.states).toHaveLength(2)
    expect(r.states[1].name).toBe('State 2')
    expect(r.states[1].id).toBe(r.id)
    expect(base).toHaveLength(1)
  })

  it('duplicates with fresh ids right after the original, graph included', () => {
    const p1 = state('p1', [cmd('a', 'showText', { text: 'hi' }), cmd('b', 'showChoices', {}, { opt1: [cmd('b1', 'wait')], opt2: [] })], { name: 'Intro' })
    const r = duplicateState([p1, state('p2')], 'p1')
    expect(r.states.map((p) => p.id)).toEqual(['p1', r.id, 'p2'])
    const copy = r.states[1]
    expect(copy.name).toBe('Intro copy')
    expect(copy.graph.nodes.map((n) => n.type)).toEqual(p1.graph.nodes.map((n) => n.type))
    const originalIds = new Set(p1.graph.nodes.map((n) => n.id))
    expect(copy.graph.nodes.some((n) => originalIds.has(n.id))).toBe(false)
    // wires follow the new ids: every wire in the copy leads to a node of the copy
    const copyIds = new Set(copy.graph.nodes.map((n) => n.id))
    for (const n of copy.graph.nodes) for (const to of Object.values(n.out)) expect(copyIds.has(to)).toBe(true)
    expect(duplicateState([p1], 'nope').id).toBeNull()
  })

  it('never deletes the last state', () => {
    const states = [state('p1'), state('p2')]
    expect(deleteState(states, 'p1').map((p) => p.id)).toEqual(['p2'])
    const single = [state('p1')]
    expect(deleteState(single, 'p1')).toBe(single)
    expect(deleteState(states, 'zzz')).toBe(states)
  })

  it('moves states and refuses to leave the list', () => {
    const states = [state('p1'), state('p2'), state('p3')]
    expect(moveState(states, 'p2', -1).map((p) => p.id)).toEqual(['p2', 'p1', 'p3'])
    expect(moveState(states, 'p2', 1).map((p) => p.id)).toEqual(['p1', 'p3', 'p2'])
    expect(moveState(states, 'p1', -1)).toBe(states)
    expect(moveState(states, 'p3', 1)).toBe(states)
  })

  it('updates one state immutably', () => {
    const states = [state('p1'), state('p2')]
    const next = updateState(states, 'p2', { name: 'Second' })
    expect(next[1].name).toBe('Second')
    expect(next[0]).toBe(states[0])
    expect(updateState(states, 'zzz', { name: 'x' })).toBe(states)
  })

  it('labels states by name or number', () => {
    expect(stateLabel({ name: '  ' }, 2)).toBe('State 3')
    expect(stateLabel({ name: 'Intro' }, 0)).toBe('Intro')
  })

  it('finds the state that is active with nothing set', () => {
    const vars = [{ id: 'badges', name: 'Badges', initial: 2 }]
    const states = [
      state('p1'),
      state('p2', [], { conditions: [{ kind: 'switch', id: 'met', value: true }] }),
      state('p3', [], { conditions: [{ kind: 'variable', id: 'badges', op: '>=', value: 2 }] }),
      state('p4', [], { conditions: [{ kind: 'selfSwitch', key: 'A', value: true }] }),
    ]
    expect(defaultActiveStateIndex(states, vars)).toBe(2)
    expect(defaultActiveStateIndex(states, [])).toBe(0)
    expect(defaultActiveStateIndex([state('x', [], { conditions: [{ kind: 'hasItem', item: 'potion', qty: 1 }] })], vars)).toBe(-1)
    expect(conditionHoldsAtStart({ kind: 'switch', id: 'met', value: false }, vars)).toBe(true)
    expect(conditionHoldsAtStart({ kind: 'variable', id: 'unknown', op: '==', value: 0 }, vars)).toBe(true)
    // stages start at their initial value and compare by the order of their values
    const stages = [{ id: 'cat', name: 'Lost cat', values: [{ id: 'none', name: 'None' }, { id: 'found', name: 'Found' }, { id: 'done', name: 'Done' }], initial: 'none' }]
    expect(conditionHoldsAtStart({ kind: 'stage', id: 'cat', op: '==', value: 'none' }, vars, stages)).toBe(true)
    expect(conditionHoldsAtStart({ kind: 'stage', id: 'cat', op: '>=', value: 'found' }, vars, stages)).toBe(false)
    expect(conditionHoldsAtStart({ kind: 'stage', id: 'cat', op: '<', value: 'done' }, vars, stages)).toBe(true)
    expect(conditionHoldsAtStart({ kind: 'stage', id: 'ghost', op: '==', value: 'none' }, vars, stages)).toBe(false)
    expect(conditionHoldsAtStart({ kind: 'stage', id: 'cat', op: '==', value: 'nope' }, vars, stages)).toBe(false)
    const quest = [
      state('a', [], {}),
      state('b', [], { conditions: [{ kind: 'stage', id: 'cat', op: '>=', value: 'found' }] }),
    ]
    expect(defaultActiveStateIndex(quest, vars, stages)).toBe(0)
  })
})

describe('templates', () => {
  it('offers the documented snippets', () => {
    expect(EVENT_TEMPLATES.map((t) => t.label)).toEqual(['Dialogue', 'Yes / No question', 'Give item & hide', 'Warp', 'Open chest'])
  })

  it('builds fresh, valid commands every time', () => {
    for (const t of EVENT_TEMPLATES) {
      const a = t.build()
      const b = t.build()
      expect(a.commands.length).toBeGreaterThan(0)
      expect(a.commands[0].id).not.toBe(b.commands[0].id)
      const p = state('p', a.commands)
      expect(validateState(p, {}).nodeIssues.filter((i) => i.severity === 'error')).toEqual([])
    }
  })

  it('yes/no fills both choice branches', () => {
    const t = EVENT_TEMPLATES.find((x) => x.id === 'yes-no')!.build()
    const choices = t.commands[1]
    expect(choices.type).toBe('showChoices')
    expect(choices.branches?.opt1).toHaveLength(1)
    expect(choices.branches?.opt2).toHaveLength(1)
  })

  it('turns an empty state into the template graph and adds extra states only to single-state events', () => {
    const tpl = EVENT_TEMPLATES.find((x) => x.id === 'chest')!
    const r = applyTemplate([state('p1')], 'p1', tpl)
    expect(r.states).toHaveLength(2)
    expect(commandNodes(r.states[0].graph).map((n) => n.type)).toEqual(['giveItem', 'showText', 'setSelfSwitch'])
    expect(r.states[1].conditions).toEqual([{ kind: 'selfSwitch', key: 'A', value: true }])
    expect(r.states[1].appearance).toEqual({ frame: 1 })
    expect(commandNodes(r.states[1].graph).map((n) => n.type)).toEqual(['showText'])
    expect(r.selectId).toBe(commandNodes(r.states[0].graph)[0].id)
    expect(validateGraph(r.states[0].graph).filter((i) => i.severity === 'error')).toEqual([])
    expect(applyTemplate(r.states, 'zzz', tpl).states).toBe(r.states)
  })

  it('does not touch a state that already has nodes, or add extra states to a longer event', () => {
    const tpl = EVENT_TEMPLATES.find((x) => x.id === 'chest')!
    const full = [state('p1', [cmd('a', 'wait')])]
    const r = applyTemplate(full, 'p1', tpl)
    expect(r.states).toBe(full)
    expect(r.selectId).toBeNull()
    const two = [state('p1'), state('p2')]
    expect(applyTemplate(two, 'p1', tpl).states).toHaveLength(2)
  })

  it('give item & hide adds a state that hides the entity', () => {
    const r = applyTemplate([state('p1')], 'p1', EVENT_TEMPLATES.find((x) => x.id === 'give-item')!)
    expect(r.states[1]).toMatchObject({ solid: false, appearance: { visible: false } })
  })

  it('isEmptyGraph is true until a command node exists', () => {
    expect(isEmptyGraph(state('p'))).toBe(true)
    expect(isEmptyGraph(state('p', [cmd('a', 'wait')]))).toBe(false)
    expect(isEmptyGraph(state('p', [cmd('x', 'exitEvent')]))).toBe(true) // an End node is structural
  })
})

describe('contexts and problems', () => {
  const env = makeEnv()

  it('builds name lookups', () => {
    const ctx = buildSummaryContext(env)
    expect(ctx.switchName?.('met')).toBe('Met the guard')
    expect(ctx.variableName?.('badges')).toBe('Badges earned')
    expect(ctx.stageName?.('cat')).toBe('Lost cat')
    expect(ctx.stageValueName?.('cat', 'found')).toBe('Found')
    expect(ctx.mapName?.('town')).toBe('Town')
    expect(ctx.spriteName?.('objects/chest')).toBe('Chest')
    expect(ctx.entityName?.('e2')).toBe('Guard')
    expect(ctx.switchName?.('nope')).toBeUndefined()
  })

  it('builds validation id lists', () => {
    expect(buildValidationContext(env)).toEqual({
      switchIds: ['met', 'door'],
      variableIds: ['badges'],
      stageIds: ['cat'],
      stageValues: { cat: ['none', 'found', 'done'] },
      mapIds: ['town', 'cave'],
      mapSizes: {},
      spriteIds: ['characters/hero', 'objects/chest'],
      entityIds: ['self-1', 'e2'],
    })
  })

  it('reports a warp to a tile outside the destination map', () => {
    const sized = { ...env, maps: [{ id: 'town', name: 'Town', width: 30, height: 20 }, ...env.maps.filter((m) => m.id !== 'town')] }
    const ctx = buildValidationContext(sized)
    expect(ctx.mapSizes).toEqual({ town: { width: 30, height: 20 } })
    const bad = collectProblems([state('p1', [cmd('w', 'warp', { map: 'town', x: 25, y: 25 })])], ctx)
    expect(bad.find((p) => p.code === 'warp-out-of-bounds')).toMatchObject({ nodeId: 'w', severity: 'error' })
    expect(bad.find((p) => p.code === 'warp-out-of-bounds')?.message).toContain('(25, 25)')
    const ok = collectProblems([state('p1', [cmd('w', 'warp', { map: 'town', x: 29, y: 19 })])], ctx)
    expect(ok.find((p) => p.code === 'warp-out-of-bounds')).toBeUndefined()
  })

  it('collects problems from conditions, appearance and nodes, errors first', () => {
    const states = [
      state('p1', [cmd('w', 'warp', { map: '' }), cmd('s', 'setSwitch', { id: 'ghost' })], {
        conditions: [{ kind: 'switch', id: 'ghost2', value: true }],
        appearance: { asset: 'objects/missing' },
      }),
      state('p2'),
    ]
    const problems = collectProblems(states, buildValidationContext(env))
    expect(problems[0].severity).toBe('error')
    expect(problems.map((p) => p.code)).toEqual(expect.arrayContaining(['dangling-switch', 'missing-param', 'dangling-sprite']))
    expect(problems.every((p) => p.stateId === 'p1')).toBe(true)
    expect(problems.find((p) => p.scope === 'conditions')).toBeDefined()
    expect(problems.find((p) => p.scope === 'appearance')).toBeDefined()
    expect(problems.find((p) => p.nodeId === 's')).toBeDefined()
    const counts = countBySeverity(problems)
    expect(counts.errors).toBeGreaterThan(0)
    expect(counts.warnings).toBeGreaterThan(0)
    expect(worstSeverity([])).toBeNull()
    expect(worstSeverity([{ severity: 'warning' }])).toBe('warning')
    expect(worstSeverity([{ severity: 'warning' }, { severity: 'error' }])).toBe('error')
  })

  it('reports loops that never wait on the node, and does not mind floating nodes', () => {
    const s = state('p1')
    s.graph = {
      nodes: [
        { id: 'st', type: 'start', params: {}, out: { next: 'j' }, x: 0, y: 0 },
        { id: 'j', type: 'junction', params: {}, out: { next: 'j' }, x: 0, y: 0 },
        { id: 'lost', type: 'wait', params: { ms: 1 }, out: {}, x: 0, y: 0 },
      ],
      frames: [],
    }
    const problems = collectProblems([s], buildValidationContext(env))
    expect(problems.find((p) => p.code === 'cycle-without-wait')).toMatchObject({ nodeId: 'j', severity: 'error', scope: 'node' })
    expect(problems.find((p) => p.nodeId === 'lost')).toBeUndefined()
  })

  it('groups node issues by node id and skips issues without one', () => {
    const grouped = groupIssuesByNode([
      { nodeId: 'a', severity: 'error', code: 'x', message: 'one' },
      { nodeId: 'a', severity: 'warning', code: 'y', message: 'two' },
      { nodeId: '', severity: 'error', code: 'z', message: 'graph-wide' },
    ])
    expect([...grouped.keys()]).toEqual(['a'])
    expect(grouped.get('a')).toHaveLength(2)
  })
})
