/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import { describe, it, expect } from 'vitest'
import { createCommand, createDefaultComponent, formatCommandPath, validateEntities, validateEntity } from '../../../shared/engine/index'

const good = (): any => ({
  id: 'e1',
  name: 'NPC',
  x: 48,
  y: 96,
  components: {
    Transform: { x: 48, y: 96, depth: 20 },
    Sprite: createDefaultComponent('Sprite', { asset: 'characters/player' }),
    Collider: createDefaultComponent('Collider'),
    Movement: createDefaultComponent('Movement'),
    Event: {
      states: [
        {
          id: 'p1', name: 'State 1', conditions: [{ kind: 'switch', id: 's1', value: true }], trigger: 'action',
          commands: [createCommand('showText', { text: 'hi' }), createCommand('warp', { map: 'city' })],
          faceOnInteract: true, solid: null, appearance: {},
        },
      ],
    },
    Tag: { tag: 'npc' },
  },
})

const codes = (e: unknown, ctx = {}) => validateEntity(e, ctx).map((i) => `${i.severity}:${i.code}`)

describe('validateEntity', () => {
  it('accepts a healthy entity', () => {
    expect(validateEntity(good())).toEqual([])
    expect(validateEntity(good(), { switchIds: ['s1'], mapIds: ['city'], spriteIds: ['characters/player'] })).toEqual([])
  })

  it('reports structural problems', () => {
    expect(codes(null)).toEqual(['error:bad-entity'])
    expect(codes({ ...good(), id: '' })).toEqual(['error:bad-id'])
    expect(codes({ ...good(), name: 3 })).toEqual(['error:bad-name'])
    expect(codes({ ...good(), x: NaN })).toEqual(['error:bad-position'])
    expect(codes({ ...good(), components: 4 })).toEqual(['error:bad-components'])
  })

  it('requires a Transform and warns when it disagrees with the entity position', () => {
    const e = good()
    delete e.components.Transform
    expect(codes(e)).toEqual(['error:missing-transform'])
    const m = good()
    m.components.Transform.x = 64
    expect(codes(m)).toEqual(['warning:transform-mismatch'])
  })

  it('flags unknown and legacy components', () => {
    const e = good()
    e.components.Bogus = {}
    e.components.SpriteView = { texture: 'x' }
    expect(codes(e)).toEqual(['error:unknown-component', 'warning:legacy-component'])
    expect(validateEntity(e)[0]).toMatchObject({ entityId: 'e1', path: 'components.Bogus' })
  })

  it('checks prop types, ranges and unknown props', () => {
    const e = good()
    e.components.Collider.width = 'wide'
    e.components.Collider.isSolid = 'yes'
    e.components.Sprite.facing = 'north'
    e.components.Sprite.opacity = 2
    e.components.Sprite.tint = 'red'
    e.components.Movement.controller = 'fly'
    e.components.Tag.tag = 5
    e.components.Collider.junk = 1
    const issues = validateEntity(e)
    expect(issues.map((i) => `${i.code}@${i.path}`).sort()).toEqual([
      'bad-prop@components.Collider.isSolid',
      'bad-prop@components.Collider.width',
      'bad-prop@components.Movement.controller',
      'bad-prop@components.Sprite.facing',
      'bad-prop@components.Sprite.tint',
      'bad-prop@components.Tag.tag',
      'out-of-range@components.Sprite.opacity',
      'unknown-prop@components.Collider.junk',
    ])
    expect(codes({ ...good(), components: { ...good().components, Collider: 5 } })).toEqual(['error:bad-component'])
  })

  it('partial props are fine (defaults fill the gaps)', () => {
    expect(validateEntity({ id: 'a', name: 'a', x: 1, y: 2, components: { Transform: { x: 1, y: 2 }, Collider: { width: 32 } } })).toEqual([])
  })

  it('warns about sprite assets that do not exist, only when the list is given', () => {
    expect(codes(good())).toEqual([])
    expect(codes(good(), { spriteIds: ['objects/x'] })).toEqual(['warning:dangling-sprite'])
    const e = good()
    e.components.Event.states[0].appearance = { asset: 'nope' }
    expect(codes(e, { spriteIds: ['characters/player', 'objects/x'] })).toEqual(['warning:dangling-sprite'])
  })
})

describe('validateEntity: Event', () => {
  it('needs at least one state with unique ids', () => {
    const e = good()
    e.components.Event.states = []
    expect(codes(e)).toEqual(['error:no-states'])
    const d = good()
    d.components.Event.states.push({ ...d.components.Event.states[0] })
    expect(codes(d)).toEqual(['error:duplicate-state-id'])
    const m = good()
    m.components.Event = {}
    expect(codes(m)).toEqual(['error:no-states'])
  })

  it('checks state fields', () => {
    const e = good()
    const p = e.components.Event.states[0]
    p.trigger = 'sometimes'
    p.faceOnInteract = 'y'
    p.solid = 'n'
    delete p.id
    expect(codes(e)).toEqual(['error:bad-state', 'error:bad-trigger', 'error:bad-state', 'error:bad-state'])
    const n = good()
    n.components.Event.states[0] = 5
    expect(codes(n)).toEqual(['error:bad-state'])
    const c = good()
    c.components.Event.states[0].commands = 'x'
    expect(codes(c)).toEqual(['error:bad-state'])
  })

  it('reports state condition problems with a path', () => {
    const e = good()
    e.components.Event.states[0].conditions = [{ kind: 'switch', id: 'gone', value: true }, { kind: 'zzz' }]
    const issues = validateEntity(e, { switchIds: ['other'] })
    expect(issues.map((i) => [i.code, i.path])).toEqual([
      ['dangling-switch', 'components.Event.states[0].conditions[0]'],
      ['bad-condition', 'components.Event.states[0].conditions[1]'],
    ])
    expect(issues[0].message).toMatch(/^State 1:/)
  })

  it('validates the graph of a state and reports node ids with their paths', () => {
    const e = good()
    e.components.Event.states[0].graph = {
      nodes: [
        { id: 'st', type: 'start', params: {}, out: { next: 'b', bogus: 'u' }, x: 0, y: 0 },
        { id: 'b', type: 'breakLoop', params: {}, out: {}, x: 0, y: 0 },
        { id: 'u', type: 'teleport', params: {}, out: {}, x: 0, y: 0 },
        { id: 'lost', type: 'wait', params: { ms: 5 }, out: { next: 'gone' }, x: 0, y: 0 },
      ],
      frames: [],
    }
    delete e.components.Event.states[0].commands
    const issues = validateEntity(e)
    const find = (code: string) => issues.find((i) => i.code === code)
    expect(find('legacy-flow-node')).toMatchObject({ nodeId: 'b', path: 'components.Event.states[0].graph.nodes[b]', severity: 'error' })
    expect(find('unknown-command')).toMatchObject({ nodeId: 'u', path: 'components.Event.states[0].graph.nodes[u]' })
    expect(find('unknown-port')).toMatchObject({ nodeId: 'st', path: 'components.Event.states[0].graph.nodes[st].out.bogus' })
    expect(find('dangling-edge')).toMatchObject({ nodeId: 'lost' })
    expect(find('unreachable')).toMatchObject({ nodeId: 'lost', severity: 'warning' })
  })

  it('a state with neither a graph nor commands is an error', () => {
    const e = good()
    delete e.components.Event.states[0].commands
    expect(validateEntity(e).map((i) => i.code)).toContain('bad-state')
  })

  it('still checks a command tree that was not migrated yet', () => {
    const e = good()
    const cond = createCommand('conditional', { conditions: [{ kind: 'selfSwitch', key: 'A', value: true }] })
    const bad = createCommand('breakLoop')
    cond.branches!.then.push(bad)
    e.components.Event.states[0].commands.push(cond, { id: 'u', type: 'teleport', params: {} })
    const issues = validateEntity(e)
    expect(issues.map((i) => [i.code, i.nodeId, i.path])).toEqual([
      ['break-outside-loop', bad.id, 'components.Event.states[0].commands[2].branches.then[0]'],
      ['unknown-command', 'u', 'components.Event.states[0].commands[3]'],
    ])
  })

  it('formatCommandPath', () => {
    expect(formatCommandPath([1, 'then', 0, 'body', 2])).toBe('commands[1].branches.then[0].branches.body[2]')
    expect(formatCommandPath([], 'x')).toBe('x')
  })
})

describe('validateEntities', () => {
  it('reports duplicate ids and non-arrays, and never throws', () => {
    const a = good()
    expect(validateEntities([a, { ...a }]).map((i) => i.code)).toEqual(['duplicate-id'])
    expect(validateEntities('x')[0].code).toBe('bad-entities')
    expect(() => validateEntities([null, 4, {}, { components: [] }])).not.toThrow()
    expect(validateEntities([])).toEqual([])
  })
})
