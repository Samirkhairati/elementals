import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_SIGNALS,
  cleanSignalName,
  connectionsTo,
  hasSignalArea,
  knownSignals,
  signalsEmittedBy,
  stateHearsSignal,
} from '../../../shared/engine/signals'
import { normalizeEventState } from '../../../shared/engine/components'
import { validateEntity } from '../../../shared/engine/validate'
import { commandsToGraph, createCommand } from '../../../shared/engine/index'
import type { EventState } from '../../../shared/engine/types'

const emitting = (name: string): EventState =>
  normalizeEventState({ id: `emit-${name}`, name: 'Pull', trigger: 'interact', graph: commandsToGraph([createCommand('emitSignal', { name })], () => 'start', { layout: false }) })
const hearing = (signal: string, signalFrom?: string, id = `hear-${signal}`): EventState => normalizeEventState({ id, name: `On ${signal}`, trigger: 'signal', signal, signalFrom })
const entity = (id: string, states: EventState[], extra: Record<string, unknown> = {}) => ({ id, components: { Event: { states }, ...extra } })

describe('signals', () => {
  it('a signal name is trimmed and its spaces become underscores', () => {
    expect(cleanSignalName('  door opened ')).toBe('door_opened')
  })

  it('a state hears a signal by name, from anyone, from itself ("self") or from one entity', () => {
    expect(stateHearsSignal(hearing('open'), 'open', 'lever', 'gate')).toBe(true)
    expect(stateHearsSignal(hearing('open'), 'close', 'lever', 'gate')).toBe(false)
    expect(stateHearsSignal(hearing('open', 'lever'), 'open', 'lever', 'gate')).toBe(true)
    expect(stateHearsSignal(hearing('open', 'lever'), 'open', 'other', 'gate')).toBe(false)
    expect(stateHearsSignal(hearing('open', 'self'), 'open', 'gate', 'gate')).toBe(true)
    expect(stateHearsSignal(hearing('open', 'self'), 'open', 'lever', 'gate')).toBe(false)
    expect(stateHearsSignal({ trigger: 'interact', signal: 'open' }, 'open', 'a', 'b')).toBe(false)
  })

  it('lists what Emit Signal nodes send, and every name known on a map (built-in first)', () => {
    expect(signalsEmittedBy([emitting('gate open'), emitting('gate_open'), emitting('bell')])).toEqual(['gate_open', 'bell'])
    const names = knownSignals([entity('lever', [emitting('gate_open')]), entity('gate', [hearing('alarm')])])
    expect(names).toEqual([...BUILT_IN_SIGNALS.map((s) => s.name), 'gate_open', 'alarm'])
  })

  it('finds the states connected to what an entity sends', () => {
    const map = [entity('lever', [emitting('gate_open')]), entity('gate', [hearing('gate_open', 'lever', 'g1')]), entity('crowd', [hearing('gate_open', undefined, 'c1')]), entity('deaf', [hearing('gate_open', 'other', 'd1')])]
    expect(connectionsTo(map, 'lever', ['gate_open']).map((c) => `${c.entityId}/${c.stateId}`)).toEqual(['gate/g1', 'crowd/c1'])
  })

  it('an Area, or a Collider that is not solid (an Area node alone), sends the built-in signals; a solid body does not', () => {
    expect(hasSignalArea({ Area: { width: 32 } })).toBe(true)
    expect(hasSignalArea({ Collider: { isSolid: false } })).toBe(true)
    expect(hasSignalArea({ Collider: { isSolid: true } })).toBe(false)
    expect(hasSignalArea({})).toBe(false)
  })

  it('a state keeps its signal and sender through normalizing, and warns when the signal is not chosen', () => {
    expect(hearing(' alarm ', 'lever')).toMatchObject({ trigger: 'signal', signal: 'alarm', signalFrom: 'lever', blocks: true })
    expect(normalizeEventState({ trigger: 'interact' })).not.toHaveProperty('signal')
    const issues = validateEntity({ id: 'e', name: 'E', x: 16, y: 32, components: { Transform: { x: 16, y: 32 }, Event: { states: [normalizeEventState({ id: 's', trigger: 'signal' })] } } } as never)
    expect(issues.some((i) => i.code === 'missing-signal')).toBe(true)
  })
})
