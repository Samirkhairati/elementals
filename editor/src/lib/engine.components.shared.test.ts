import { describe, it, expect, afterEach } from 'vitest'
import {
  COMPONENT_SCHEMAS,
  COMPONENT_TYPES,
  cloneEntity,
  coerceFieldValue,
  createDefaultComponent,
  createDefaultEventProps,
  createSequentialIdGenerator,
  deterministicId,
  isComponentType,
  newId,
  normalizeProps,
  setIdGenerator,
  tileToAnchor,
  anchorToTile,
  snapToAnchor,
  isFieldVisible,
  commandNodes,
  commandsToGraph,
  validateGraph,
} from '../../../shared/engine/index'
import type { ComponentType, EngineEntity } from '../../../shared/engine/index'

afterEach(() => setIdGenerator(null))

describe('COMPONENT_TYPES / schemas', () => {
  it('lists the six components and a schema for each', () => {
    expect([...COMPONENT_TYPES]).toEqual(['Transform', 'Sprite', 'Collider', 'Movement', 'Event', 'Tag'])
    for (const type of COMPONENT_TYPES) {
      const s = COMPONENT_SCHEMAS[type]
      expect(s.type).toBe(type)
      expect(s.label).toBeTruthy()
      expect(s.description.length).toBeGreaterThan(10)
      expect(s.icon).toMatch(/^[a-z][a-z-]*$/)
      expect(s.accent).toBeTruthy()
      expect(['core', 'visual', 'physics', 'behavior', 'logic']).toContain(s.category)
      expect(s.singleton).toBe(true)
    }
    expect(COMPONENT_SCHEMAS.Transform.required).toBe(true)
    expect(COMPONENT_SCHEMAS.Sprite.required).toBeUndefined()
  })

  it('isComponentType accepts only canonical names', () => {
    for (const t of COMPONENT_TYPES) expect(isComponentType(t)).toBe(true)
    for (const t of ['SpriteView', 'Interactable', '', 'transform', 3, null, undefined]) expect(isComponentType(t)).toBe(false)
  })

  it('every field key exists in defaultProps and visibleWhen points at a real key', () => {
    for (const type of COMPONENT_TYPES) {
      const s = COMPONENT_SCHEMAS[type]
      for (const f of s.fields) {
        expect(Object.keys(s.defaultProps), `${type}.${f.key}`).toContain(f.key)
        if (f.visibleWhen) expect(Object.keys(s.defaultProps)).toContain(f.visibleWhen.key)
        if (f.kind === 'number') {
          if (f.min !== undefined && f.max !== undefined) expect(f.min).toBeLessThan(f.max)
          const d = s.defaultProps[f.key] as number
          if (f.min !== undefined) expect(d).toBeGreaterThanOrEqual(f.min)
          if (f.max !== undefined) expect(d).toBeLessThanOrEqual(f.max)
        }
        if (f.kind === 'select') expect(f.options?.some((o) => o.value === s.defaultProps[f.key])).toBe(true)
      }
      // defaults are fixed points of normalisation
      if (type !== 'Event') expect(normalizeProps(type, s.defaultProps)).toEqual(s.defaultProps)
    }
  })

  it('Movement fields are conditional on the controller', () => {
    const byKey = Object.fromEntries(COMPONENT_SCHEMAS.Movement.fields.map((f) => [f.key, f]))
    expect(byKey.canRun.visibleWhen).toEqual({ key: 'controller', in: ['player'] })
    expect(byKey.wanderRadius.visibleWhen).toEqual({ key: 'controller', in: ['wander'] })
    expect(byKey.wanderInterval.visibleWhen).toEqual({ key: 'controller', in: ['wander'] })
    expect(byKey.speed.visibleWhen).toBeUndefined()
    expect(byKey.speed.unit).toBe('px/s')
    expect(byKey.wanderInterval.unit).toBe('ms')
  })
})

describe('defaults', () => {
  it('match the design doc', () => {
    expect(createDefaultComponent('Transform')).toEqual({ x: 0, y: 0, depth: 10 })
    expect(createDefaultComponent('Collider')).toEqual({ width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true })
    expect(createDefaultComponent('Sprite')).toEqual({
      asset: '', facing: 'down', animation: '', animSpeed: 1, frame: 0, offsetX: 0, offsetY: 0, scale: 1, flipX: false, tint: '', opacity: 1, visible: true,
    })
    expect(createDefaultComponent('Movement')).toMatchObject({ controller: 'none', speed: 100 })
    expect(createDefaultComponent('Tag')).toEqual({ tag: 'entity', icon: '', color: '' })
  })

  it('Event defaults to one action state with an empty graph and gets fresh ids', () => {
    setIdGenerator(createSequentialIdGenerator('p'))
    const a = createDefaultComponent('Event')
    const b = createDefaultEventProps()
    expect(a.states).toHaveLength(1)
    expect(a.states[0]).toEqual({
      id: 'p-1',
      name: 'State 1',
      conditions: [],
      trigger: 'action',
      graph: { nodes: [{ id: 'p-2', type: 'start', params: {}, out: {}, x: 0, y: 0 }], frames: [] },
      faceOnInteract: true,
      solid: null,
      appearance: {},
    })
    expect(b.states[0].id).toBe('p-3')
  })

  it('returns independent objects and applies overrides', () => {
    const a = createDefaultComponent('Collider', { width: 64 })
    const b = createDefaultComponent('Collider')
    expect(a.width).toBe(64)
    expect(b.width).toBe(32)
    a.height = 1
    expect(createDefaultComponent('Collider').height).toBe(32)
    expect(createDefaultComponent('Movement', { controller: 'wander', speed: 60 })).toMatchObject({ controller: 'wander', speed: 60, wanderRadius: 3 })
  })
})

describe('normalizeProps: event conditions', () => {
  const normalizedConditions = (conditions: unknown[]) =>
    (normalizeProps('Event', { states: [{ id: 's', conditions }] }) as { states: { conditions: unknown[] }[] }).states[0].conditions

  it('keeps the comparison of variable and stage conditions', () => {
    expect(
      normalizedConditions([
        { kind: 'variable', id: 'badges', op: '>=', value: 3 },
        { kind: 'stage', id: 'cat', op: '<', value: 'found' },
      ]),
    ).toEqual([
      { kind: 'variable', id: 'badges', op: '>=', value: 3 },
      { kind: 'stage', id: 'cat', op: '<', value: 'found' },
    ])
  })

  it('falls back to == for an unknown comparison and fills stage defaults', () => {
    expect(normalizedConditions([{ kind: 'variable', id: 'v', op: 'bogus', value: 1 }, { kind: 'stage' }])).toEqual([
      { kind: 'variable', id: 'v', op: '==', value: 1 },
      { kind: 'stage', id: '', op: '==', value: '' },
    ])
  })

  it('local flag conditions keep any name and default an empty one to A', () => {
    expect(normalizedConditions([{ kind: 'selfSwitch', key: 'opened', value: false }, { kind: 'selfSwitch', key: '  ' }])).toEqual([
      { kind: 'selfSwitch', key: 'opened', value: false },
      { kind: 'selfSwitch', key: 'A', value: true },
    ])
  })
})

describe('normalizeProps', () => {
  it('fills missing keys and drops unknown ones', () => {
    expect(normalizeProps('Collider', { width: 48, bogus: 1 })).toEqual({ width: 48, height: 32, offsetX: 0, offsetY: 0, isSolid: true })
    expect(normalizeProps('Tag', undefined)).toEqual({ tag: 'entity', icon: '', color: '' })
    expect(normalizeProps('Transform', null)).toEqual({ x: 0, y: 0, depth: 10 })
    expect(normalizeProps('Transform', [1, 2])).toEqual({ x: 0, y: 0, depth: 10 })
  })

  it('coerces numbers, booleans and strings', () => {
    expect(normalizeProps('Collider', { width: '64', height: ' 8 ', isSolid: 'false', offsetX: 'x' })).toEqual({
      width: 64, height: 8, offsetX: 0, offsetY: 0, isSolid: false,
    })
    expect(normalizeProps('Sprite', { asset: 5, flipX: 'true', frame: NaN }).asset).toBe('')
    expect(normalizeProps('Sprite', { flipX: 'true' }).flipX).toBe(true)
    expect(normalizeProps('Sprite', { frame: Infinity }).frame).toBe(0)
    expect(normalizeProps('Tag', { tag: 7 }).tag).toBe('entity')
  })

  it('clamps to min/max and rounds integer steps', () => {
    expect(normalizeProps('Collider', { width: 0 }).width).toBe(1)
    expect(normalizeProps('Collider', { width: 99999 }).width).toBe(4096)
    expect(normalizeProps('Sprite', { opacity: 3 }).opacity).toBe(1)
    expect(normalizeProps('Sprite', { opacity: -1 }).opacity).toBe(0)
    expect(normalizeProps('Sprite', { scale: 0 }).scale).toBe(0.1)
    expect(normalizeProps('Sprite', { frame: 2.6 }).frame).toBe(3)
    expect(normalizeProps('Sprite', { frame: -4 }).frame).toBe(0)
    expect(normalizeProps('Movement', { speed: 5 }).speed).toBe(10)
    expect(normalizeProps('Movement', { wanderRadius: 2.4 }).wanderRadius).toBe(2)
    expect(normalizeProps('Transform', { x: 17.5 }).x).toBe(17.5) // step 16 does not round
  })

  it('repairs invalid enum values', () => {
    expect(normalizeProps('Movement', { controller: 'fly' }).controller).toBe('none')
    expect(normalizeProps('Movement', { controller: 'wander' }).controller).toBe('wander')
    expect(normalizeProps('Sprite', { facing: 'north' }).facing).toBe('down')
    expect(normalizeProps('Sprite', { facing: 'left' }).facing).toBe('left')
  })

  it('normalises colours', () => {
    expect(normalizeProps('Sprite', { tint: '#FFAA00' }).tint).toBe('#ffaa00')
    expect(normalizeProps('Sprite', { tint: '#fa0' }).tint).toBe('#ffaa00')
    expect(normalizeProps('Sprite', { tint: 'red' }).tint).toBe('')
    expect(normalizeProps('Sprite', { tint: 0xff0000 }).tint).toBe('')
    expect(normalizeProps('Sprite', { tint: '' }).tint).toBe('')
  })

  it('is idempotent and does not mutate the input', () => {
    const input = { width: '7', extra: true }
    const copy = structuredClone(input)
    const once = normalizeProps('Collider', input)
    expect(input).toEqual(copy)
    expect(normalizeProps('Collider', once)).toEqual(once)
  })

  it('normalises Event states: ids, triggers, conditions, commands, appearance', () => {
    setIdGenerator(createSequentialIdGenerator('n'))
    const ev = normalizeProps('Event', {
      states: [
        {
          name: 3,
          trigger: 'nope',
          conditions: [{ kind: 'switch', id: 's', value: 'x' }, { kind: 'weird' }, { kind: 'hasItem', item: 'potion', qty: 0 }, 5],
          commands: [{ type: 'showText', params: { text: 'a' } }, { nope: true }, 'x', { id: 'keep', type: 'loop', branches: { body: [{ type: 'wait' }], bad: 3 } }],
          appearance: { frame: 2.4, facing: 'zzz', visible: false, junk: 1 },
          solid: 'yes',
        },
      ],
    })
    const state = ev.states[0]
    expect(state.id).toBe('n-1')
    expect(state.name).toBe('State 1')
    expect(state.trigger).toBe('action')
    expect(state.conditions).toEqual([{ kind: 'switch', id: 's', value: true }, { kind: 'hasItem', item: 'potion', qty: 1 }])
    // the legacy command tree becomes a graph: the loop is a reroute head, the old ids are kept
    expect(commandNodes(state.graph).map((n) => n.type)).toEqual(['showText', 'wait'])
    expect(state.graph.nodes.find((n) => n.id === 'keep')?.type).toBe('junction')
    expect(state.graph.nodes.filter((n) => n.type === 'start')).toHaveLength(1)
    expect(validateGraph(state.graph).filter((i) => i.severity === 'error')).toEqual([])
    expect(state.appearance).toEqual({ frame: 2, visible: false })
    expect(state.solid).toBeNull()
    expect(state.faceOnInteract).toBe(true)
    expect(normalizeProps('Event', { states: [] }).states).toHaveLength(1)
    expect(normalizeProps('Event', 'x').states).toHaveLength(1)
  })

  it('coerceFieldValue handles text kinds and fallbacks', () => {
    expect(coerceFieldValue({ key: 'a', label: 'a', kind: 'text' }, 5, 'd')).toBe('d')
    expect(coerceFieldValue({ key: 'a', label: 'a', kind: 'select', options: [{ label: 'x', value: 'x' }] }, 'y', 'x')).toBe('x')
  })
})

describe('isFieldVisible', () => {
  it('follows visibleWhen', () => {
    const f = COMPONENT_SCHEMAS.Movement.fields.find((x) => x.key === 'canRun')!
    expect(isFieldVisible(f, { controller: 'player' })).toBe(true)
    expect(isFieldVisible(f, { controller: 'wander' })).toBe(false)
    expect(isFieldVisible(f, {}, COMPONENT_SCHEMAS.Movement.defaultProps)).toBe(false)
    expect(isFieldVisible({ key: 'a', label: 'a', kind: 'text' }, {})).toBe(true)
  })
})

describe('geometry helpers', () => {
  it('converts between tiles and anchors', () => {
    expect(tileToAnchor(3, 2)).toEqual({ x: 112, y: 96 })
    expect(anchorToTile(112, 96)).toEqual({ col: 3, row: 2 })
    expect(anchorToTile(112, 64)).toEqual({ col: 3, row: 1 })
    expect(snapToAnchor(100, 70)).toEqual({ x: 112, y: 96 })
    expect(snapToAnchor(112, 96)).toEqual({ x: 112, y: 96 })
  })
})

describe('ids', () => {
  it('newId is uuid-shaped and unique; the generator is injectable', () => {
    const a = newId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newId()).not.toBe(a)
    const prev = setIdGenerator(() => 'fixed')
    expect(newId()).toBe('fixed')
    setIdGenerator(prev)
    expect(newId()).not.toBe('fixed')
  })

  it('deterministicId is stable, uuid-shaped and seed dependent', () => {
    expect(deterministicId('a')).toBe(deterministicId('a'))
    expect(deterministicId('a')).not.toBe(deterministicId('b'))
    expect(deterministicId('a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('cloneEntity', () => {
  const entity = (): EngineEntity => ({
    id: 'e1', name: 'E', x: 16, y: 32, components: {
      Transform: createDefaultComponent('Transform', { x: 16, y: 32 }),
      Event: { states: [{ ...createDefaultEventProps().states[0], id: 'pg', graph: commandsToGraph([{ id: 'c1', type: 'wait', params: { ms: 5 } }], () => 'start1') }] },
    },
  })

  it('deep copies', () => {
    const e = entity()
    const c = cloneEntity(e)
    expect(c).toEqual(e)
    expect(c).not.toBe(e)
    expect(c.components.Event).not.toBe(e.components.Event)
    c.components.Event!.states[0].graph.nodes[1].params.ms = 9
    expect(e.components.Event!.states[0].graph.nodes[1].params.ms).toBe(5)
  })

  it('freshIds regenerates entity, state and command ids only', () => {
    const e = entity()
    const c = cloneEntity(e, true)
    expect(c.id).not.toBe('e1')
    expect(c.components.Event!.states[0].id).not.toBe('pg')
    const [start, wait] = c.components.Event!.states[0].graph.nodes
    expect(wait.id).not.toBe('c1')
    expect(start.id).not.toBe('start1')
    expect(start.out).toEqual({ next: wait.id }) // wires follow the new ids
    expect(wait.params).toEqual({ ms: 5 })
    expect(c.components.Transform).toEqual(e.components.Transform)
  })
})

// compile-time: the schema record is keyed by every component type
const _all: Record<ComponentType, true> = { Transform: true, Sprite: true, Collider: true, Movement: true, Event: true, Tag: true }
void _all
