import { describe, expect, it } from 'vitest'
import { countEvents, describeRefs, scanDatabaseUsage, type UsageMap } from './databaseUsage'
import { createCommand } from '../../../shared/engine/commands'
import { createDefaultEventState } from '../../../shared/engine/components'

function entityWith(id: string, name: string, states: ReturnType<typeof createDefaultEventState>[]) {
  return { id, name, components: { Event: { states } } }
}

function mapWith(fileName: string, entities: UsageMap['entities']): UsageMap {
  return { fileName, name: fileName.replace('.json', ''), entities }
}

describe('scanDatabaseUsage', () => {
  it('returns empty buckets for no maps or maps without events', () => {
    expect(scanDatabaseUsage([])).toEqual({ switches: {}, variables: {} })
    expect(scanDatabaseUsage([mapWith('a.json', [{ id: 'e', name: 'Rock', components: { Transform: {} } }])])).toEqual({
      switches: {},
      variables: {},
    })
    expect(scanDatabaseUsage([{ fileName: 'a.json', name: 'A' }])).toEqual({ switches: {}, variables: {} })
  })

  it('finds state conditions', () => {
    const state = createDefaultEventState('Seen')
    state.conditions = [
      { kind: 'switch', id: 'met', value: true },
      { kind: 'variable', id: 'steps', op: '>=', value: 3 },
      { kind: 'selfSwitch', key: 'A', value: true },
    ]
    const usage = scanDatabaseUsage([mapWith('town.json', [entityWith('e1', 'Guard', [state])])])
    expect(usage.switches.met).toHaveLength(1)
    expect(usage.switches.met[0]).toMatchObject({ mapFile: 'town.json', entityId: 'e1', stateIndex: 0, stateName: 'Seen', where: 'condition' })
    expect(usage.variables.steps).toHaveLength(1)
    expect(Object.keys(usage.switches)).toEqual(['met'])
  })

  it('finds command parameters, including nested branches and conditionals', () => {
    const set = createCommand('setSwitch', { id: 'met', value: true })
    const setVar = createCommand('setVariable', { id: 'steps', operand: 'variable', sourceId: 'badges' })
    const cond = createCommand('conditional', { conditions: [{ kind: 'switch', id: 'door', value: false }, { kind: 'variable', id: 'badges', op: '==', value: 1 }] })
    cond.branches = { then: [setVar], else: [] }
    const loop = createCommand('loop')
    loop.branches = { body: [cond] }
    const state = createDefaultEventState()
    state.commands = [set, loop]
    const usage = scanDatabaseUsage([mapWith('m.json', [entityWith('e1', 'NPC', [state])])])
    expect(usage.switches.met).toHaveLength(1)
    expect(usage.switches.met[0]).toMatchObject({ where: 'command', commandType: 'setSwitch', commandId: set.id })
    expect(usage.switches.door).toHaveLength(1)
    expect(usage.variables.steps).toHaveLength(1)
    // `badges` is the source variable of setVariable AND used by the conditional.
    expect(usage.variables.badges).toHaveLength(2)
  })

  it('ignores hidden fields (sourceId while the operand is a constant) and empty ids', () => {
    const cmd = createCommand('setVariable', { id: 'steps', operand: 'const', sourceId: 'badges' })
    const empty = createCommand('setSwitch', { id: '' })
    const state = createDefaultEventState()
    state.commands = [cmd, empty]
    const usage = scanDatabaseUsage([mapWith('m.json', [entityWith('e1', 'NPC', [state])])])
    expect(usage.variables.badges).toBeUndefined()
    expect(usage.switches['']).toBeUndefined()
  })

  it('tolerates malformed data', () => {
    const maps = [
      mapWith('bad.json', [
        { id: 'a', name: 'A', components: { Event: { states: 'nope' } } },
        { id: 'b', name: 'B', components: { Event: { states: [null, { commands: 'x', conditions: 5 }] } } },
        { id: 'c', name: 'C', components: { Event: { states: [{ commands: [null, { id: 'z', type: 'nonsense', params: {} }] }] } } },
      ]),
    ]
    expect(() => scanDatabaseUsage(maps)).not.toThrow()
    expect(scanDatabaseUsage(maps)).toEqual({ switches: {}, variables: {} })
  })

  it('counts events across maps, not references', () => {
    const state = createDefaultEventState('P')
    state.commands = [createCommand('setSwitch', { id: 'met' }), createCommand('setSwitch', { id: 'met', value: false })]
    state.conditions = [{ kind: 'switch', id: 'met', value: true }]
    const second = createDefaultEventState('Q')
    second.conditions = [{ kind: 'switch', id: 'met', value: true }]
    const usage = scanDatabaseUsage([
      mapWith('a.json', [entityWith('e1', 'One', [state])]),
      mapWith('b.json', [entityWith('e1', 'Same id other map', [second])]),
    ])
    expect(usage.switches.met).toHaveLength(4)
    expect(countEvents(usage.switches.met)).toBe(2)
    expect(countEvents(undefined)).toBe(0)
    expect(countEvents([])).toBe(0)
  })

  it('describes references one line per event state', () => {
    const state = createDefaultEventState('Intro')
    state.conditions = [{ kind: 'switch', id: 'met', value: true }]
    state.commands = [createCommand('setSwitch', { id: 'met' })]
    const usage = scanDatabaseUsage([mapWith('town.json', [entityWith('e1', 'Guard', [state])])])
    expect(describeRefs(usage.switches.met)).toEqual(['town > Guard (Intro)'])
    expect(describeRefs(undefined)).toEqual([])
  })
})
