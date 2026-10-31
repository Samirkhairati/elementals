/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LEGACY_COMPONENT_TYPES,
  listLegacyComponents,
  migrateEntity,
  migrateMap,
  normalizeProps,
  validateEntity,
} from '../../../shared/engine/index'

// Legacy-format (schemaVersion 1) copies of project/maps/map2.json and market.json taken from git history
// (`git show HEAD:project/maps/<name>`). They are fixed on purpose: the live project maps get migrated
// and saved by the editor, so they no longer exercise the legacy path.
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const readMap = (name: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name.replace(/\.json$/, '.legacy.json')), 'utf8'))

const ent = (components: Record<string, any>, extra: Record<string, any> = {}): any => ({
  id: 'ent-1',
  name: 'E',
  x: 48,
  y: 96,
  components: { Transform: { x: 48, y: 96, depth: 10 }, ...components },
  ...extra,
})

const frozen = <T>(v: T): T => {
  const deepFreeze = (o: any) => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o)
      Object.values(o).forEach(deepFreeze)
    }
    return o
  }
  return deepFreeze(structuredClone(v))
}

describe('legacy project maps (fixtures from git history)', () => {
  it('map2: the plain collider entity is untouched, the player-like entity becomes Sprite+Movement+Event', () => {
    const map = readMap('map2.json')
    const before = structuredClone(map)
    const { value, changed } = migrateMap(map)
    expect(map).toEqual(before) // input never mutated
    expect(changed).toBe(true)
    expect(value.schemaVersion).toBe(2)

    const [plain, full] = value.entities
    expect(plain).toBe(map.entities[0]) // same object: nothing to migrate
    expect(plain.components).toEqual(map.entities[0].components)

    expect(Object.keys(full.components)).toEqual(['Transform', 'Sprite', 'Collider', 'Movement', 'Event'])
    expect(full.components.Transform).toEqual({ x: 48, y: 192, depth: 10 })
    expect(full.components.Collider).toEqual({ width: 16, height: 8, offsetX: 0, offsetY: 0, isSolid: true }) // user data kept
    expect(full.components.Sprite).toEqual({
      asset: 'characters/player', facing: 'down', animation: '', frame: 0, offsetX: 0, offsetY: 0, scale: 1, flipX: false, tint: '', opacity: 1, visible: true,
    })
    expect(full.components.Movement).toEqual({ controller: 'player', speed: 100, canRun: true, wanderRadius: 3, wanderInterval: 4000 })
    // empty Interactable -> an Event with one empty action page
    expect(full.components.Event.pages).toHaveLength(1)
    expect(full.components.Event.pages[0]).toMatchObject({ name: 'Page 1', conditions: [], trigger: 'action', commands: [], faceOnInteract: true, solid: null, appearance: {} })
    expect(full).toMatchObject({ id: map.entities[1].id, name: 'New Entity1', x: 48, y: 192, visible: true, folder: null })
    for (const e of value.entities) expect(validateEntity(e)).toEqual([])
  })

  it('market: the sign becomes an action Event with one showText', () => {
    const map = readMap('market.json')
    const { value } = migrateMap(map)
    const sign = value.entities[0]
    expect(Object.keys(sign.components)).toEqual(['Transform', 'Collider', 'Event', 'Tag'])
    expect(sign.components.Transform).toEqual({ x: 336, y: 128, depth: 0 })
    expect(sign.components.Tag).toEqual({ tag: 'sign' })
    const page = sign.components.Event.pages[0]
    expect(page.trigger).toBe('action')
    expect(page.commands).toHaveLength(1)
    expect(page.commands[0]).toMatchObject({ type: 'showText', params: { speaker: '', text: 'The ancient sign is faded...' } })
    expect(validateEntity(sign)).toEqual([])
  })

  it('every legacy map is stable under a second migration and migrates deterministically', () => {
    for (const name of fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.legacy.json')).map((f) => f.replace('.legacy', ''))) {
      const once = migrateMap(readMap(name))
      const again = migrateMap(readMap(name))
      expect(JSON.stringify(again.value)).toBe(JSON.stringify(once.value)) // same ids on every run
      const twice = migrateMap(once.value)
      expect(twice.changed).toBe(false)
      expect(twice.value).toBe(once.value)
    }
  })
})

describe('Sprite (SpriteView + CharacterAnimation)', () => {
  const sprite = (components: Record<string, any>, extra?: Record<string, any>) => migrateEntity(ent(components, extra)).value.components.Sprite

  it.each([
    ['player-walk', 'characters/player'],
    ['player-run', 'characters/player'],
    ['npc_guard-walk', 'characters/npc_guard'],
    ['old-man-walk', 'characters/old-man'],
  ])('texture %s -> %s', (texture, asset) => {
    expect(sprite({ SpriteView: { texture } })!.asset).toBe(asset)
  })

  it('other textures become objects/<texture>; no texture means no asset', () => {
    expect(sprite({ SpriteView: { texture: 'tree' } })!.asset).toBe('objects/tree')
    expect(sprite({ SpriteView: { texture: '' } })!.asset).toBe('')
  })

  it('characterKey wins over the texture and supplies the facing', () => {
    const s = sprite({ SpriteView: { texture: 'player-walk' }, CharacterAnimation: { characterKey: 'guard', direction: 'left', movementType: 'run' } })!
    expect(s.asset).toBe('characters/guard')
    expect(s.facing).toBe('left')
  })

  it('CharacterAnimation alone is enough', () => {
    const s = sprite({ CharacterAnimation: { characterKey: 'nurse', direction: 'up' } })!
    expect(s).toMatchObject({ asset: 'characters/nurse', facing: 'up', frame: 0, visible: true, opacity: 1 })
  })

  it('facing falls back to the movement direction, then down', () => {
    expect(sprite({ SpriteView: { texture: 'a-walk' }, GridMovement: { direction: 'right', speed: 100 } })!.facing).toBe('right')
    expect(sprite({ SpriteView: { texture: 'a-walk' }, FreeMovement: { direction: 'up' } })!.facing).toBe('up')
    expect(sprite({ SpriteView: { texture: 'a-walk' }, CharacterAnimation: { characterKey: 'a', direction: 'bad' } })!.facing).toBe('down')
  })

  it('maps frame, flipX, alpha, tint and visible; drops origin', () => {
    const s = sprite({ SpriteView: { texture: 'x-walk', frame: 5, flipX: true, alpha: 0.5, tint: 0xff8800, visible: false, originX: 0, originY: 0 } })!
    expect(s).toMatchObject({ frame: 5, flipX: true, opacity: 0.5, tint: '#ff8800', visible: false })
    expect(s).not.toHaveProperty('originX')
    expect(s).not.toHaveProperty('alpha')
    expect(s).not.toHaveProperty('texture')
  })

  it('tint: white and invalid values mean no tint; string frames are parsed; alpha is clamped', () => {
    expect(sprite({ SpriteView: { texture: 'x-walk', tint: 0xffffff } })!.tint).toBe('')
    expect(sprite({ SpriteView: { texture: 'x-walk', tint: 'blue' } })!.tint).toBe('')
    expect(sprite({ SpriteView: { texture: 'x-walk', tint: 0x00ff00 } })!.tint).toBe('#00ff00')
    expect(sprite({ SpriteView: { texture: 'x-walk', tint: 0x0000ff } })!.tint).toBe('#0000ff')
    expect(sprite({ SpriteView: { texture: 'x-walk', frame: '3' } })!.frame).toBe(3)
    expect(sprite({ SpriteView: { texture: 'x-walk', frame: 'idle_0' } })!.frame).toBe(0)
    expect(sprite({ SpriteView: { texture: 'x-walk', alpha: 7 } })!.opacity).toBe(1)
  })

  it('an existing Sprite wins; legacy sprite components are still removed', () => {
    const existing = { asset: 'objects/chest', facing: 'down', animation: '', frame: 1, offsetX: 0, offsetY: 0, scale: 1, flipX: false, tint: '', opacity: 1, visible: true }
    const out = migrateEntity(ent({ Sprite: existing, SpriteView: { texture: 'player-walk' } })).value
    expect(out.components.Sprite).toEqual(existing)
    expect(Object.keys(out.components)).toEqual(['Transform', 'Sprite'])
  })
})

describe('Movement (Grid/Free/PlayerControl/AIWander)', () => {
  const movement = (components: Record<string, any>) => migrateEntity(ent(components)).value.components.Movement

  it('no controller components -> none, speed from Grid or Free', () => {
    expect(movement({ GridMovement: { speed: 80, direction: 'down' } })).toMatchObject({ controller: 'none', speed: 80 })
    expect(movement({ FreeMovement: { speed: 120 } })).toMatchObject({ controller: 'none', speed: 120 })
    expect(movement({ FreeMovement: { speed: 120 }, GridMovement: { speed: 90 } })).toMatchObject({ speed: 90 })
    expect(movement({ GridMovement: {} })).toMatchObject({ controller: 'none', speed: 100 })
  })

  it('PlayerControl -> player (isMovementLocked is dropped)', () => {
    const m = movement({ PlayerControl: { isMovementLocked: true }, GridMovement: { speed: 150 } })!
    expect(m).toEqual({ controller: 'player', speed: 150, canRun: true, wanderRadius: 3, wanderInterval: 4000 })
  })

  it('AIWander -> wander with radius, interval and its own speed', () => {
    const m = movement({ GridMovement: { speed: 80 }, AIWander: { radius: 2, interval: 3000, speed: 60 } })!
    expect(m).toMatchObject({ controller: 'wander', speed: 60, wanderRadius: 2, wanderInterval: 3000 })
  })

  it('wander speed falls back to the movement speed; player beats wander', () => {
    expect(movement({ GridMovement: { speed: 80 }, AIWander: { radius: 4 } })).toMatchObject({ controller: 'wander', speed: 80, wanderRadius: 4, wanderInterval: 4000 })
    expect(movement({ PlayerControl: {}, AIWander: { speed: 30 } })).toMatchObject({ controller: 'player', speed: 100 })
  })

  it('values are normalised (clamped)', () => {
    expect(movement({ GridMovement: { speed: 1 } })).toMatchObject({ speed: 10 })
  })

  it('an existing Movement wins', () => {
    const existing = normalizeProps('Movement', { controller: 'wander', speed: 40 })
    expect(migrateEntity(ent({ Movement: existing, PlayerControl: {} })).value.components.Movement).toEqual(existing)
  })
})

describe('Interactable -> Event', () => {
  const page = (inter: Record<string, any>, id = 'ent-1') => migrateEntity(ent({ Interactable: inter }, { id })).value.components.Event!.pages[0]

  it('message -> showText; on_interact -> action trigger', () => {
    const p = page({ type: 'on_interact', message: 'Hello' })
    expect(p.trigger).toBe('action')
    expect(p.commands.map((c: any) => [c.type, c.params])).toEqual([['showText', { speaker: '', text: 'Hello' }]])
  })

  it('on_step -> playerTouch', () => {
    expect(page({ type: 'on_step', eventKey: 'WARP' }).trigger).toBe('playerTouch')
    expect(page({ type: 'something-else', message: 'x' }).trigger).toBe('action')
    expect(page({ message: 'x' }).trigger).toBe('action')
  })

  it('targetMap -> warp with TILE coordinates (as the old runtime/editor labels treat them)', () => {
    const p = page({ type: 'on_step', targetMap: 'city.json', targetX: 5, targetY: 7 })
    expect(p.commands).toHaveLength(1)
    expect(p.commands[0]).toMatchObject({ type: 'warp', params: { map: 'city', x: 5, y: 7, facing: '', fade: true } })
    expect(page({ targetMap: 'market', targetX: '2' }).commands[0].params).toMatchObject({ map: 'market', x: 0, y: 0 })
  })

  it('eventKey -> emit', () => {
    expect(page({ eventKey: 'OPEN_CHEST_01' }).commands.map((c: any) => [c.type, c.params.event])).toEqual([['emit', 'OPEN_CHEST_01']])
  })

  it('several fields become several commands in the order showText, warp, emit', () => {
    const p = page({ type: 'on_interact', message: 'Bye', targetMap: 'town', targetX: 1, targetY: 2, eventKey: 'LEFT' })
    expect(p.commands.map((c: any) => c.type)).toEqual(['showText', 'warp', 'emit'])
  })

  it('nothing set -> an empty action page (the Event component is kept)', () => {
    const p = page({ type: 'on_interact', message: '', eventKey: '', targetMap: '' })
    expect(p).toMatchObject({ trigger: 'action', commands: [] })
  })

  it('ids are deterministic per entity and unique within it; the result validates', () => {
    const a = migrateEntity(ent({ Interactable: { message: 'a', targetMap: 'm', eventKey: 'k' } })).value
    const b = migrateEntity(ent({ Interactable: { message: 'a', targetMap: 'm', eventKey: 'k' } })).value
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const other = migrateEntity(ent({ Interactable: { message: 'a', targetMap: 'm', eventKey: 'k' } }, { id: 'ent-2' })).value
    const ids = (e: any) => [e.components.Event.pages[0].id, ...e.components.Event.pages[0].commands.map((c: any) => c.id)]
    expect(new Set(ids(a)).size).toBe(4)
    expect(ids(a)).not.toEqual(ids(other))
    expect(validateEntity(a, { mapIds: ['m'] }).filter((i) => i.severity === 'error')).toEqual([])
  })

  it('an existing Event wins over Interactable', () => {
    const event = normalizeProps('Event', { pages: [{ id: 'p', commands: [] }] })
    const out = migrateEntity(ent({ Event: event, Interactable: { message: 'x' } })).value
    expect(out.components.Event).toEqual(event)
    expect(out.components).not.toHaveProperty('Interactable')
  })
})

describe('Transform, extras and bookkeeping', () => {
  it('keeps Transform and entity x/y in sync (Transform wins)', () => {
    const e = migrateEntity({ id: 'a', name: 'a', x: 1, y: 2, components: { Transform: { x: 64, y: 96, depth: 3 } } }).value
    expect(e).toMatchObject({ x: 64, y: 96 })
    expect(e.components.Transform).toEqual({ x: 64, y: 96, depth: 3 })
  })

  it('creates a missing Transform from entity x/y, and fills entity x/y from Transform', () => {
    const a = migrateEntity({ id: 'a', name: 'a', x: 16, y: 32, components: { Tag: { tag: 't' } } }).value
    expect(a.components.Transform).toEqual({ x: 16, y: 32, depth: 10 })
    expect(Object.keys(a.components)).toEqual(['Transform', 'Tag'])
    const b = migrateEntity({ id: 'b', name: 'b', components: { Transform: { x: 8, y: 9, depth: 1 } } } as any).value
    expect(b).toMatchObject({ x: 8, y: 9 })
  })

  it('keeps unknown extra components and entity fields untouched, after the canonical ones', () => {
    const src = ent({ Zebra: { stripes: 3 }, SpriteView: { texture: 'a-walk' }, Tag: { tag: 'z' } }, { folder: 'f1', visible: false, custom: { a: 1 } })
    const out = migrateEntity(src).value as any
    expect(Object.keys(out.components)).toEqual(['Transform', 'Sprite', 'Tag', 'Zebra'])
    expect(out.components.Zebra).toEqual({ stripes: 3 })
    expect(out).toMatchObject({ folder: 'f1', visible: false, custom: { a: 1 } })
  })

  it('removes every legacy component', () => {
    const all = Object.fromEntries(LEGACY_COMPONENT_TYPES.map((t) => [t, {}]))
    const src = ent(all)
    expect(listLegacyComponents(src).sort()).toEqual([...LEGACY_COMPONENT_TYPES].sort())
    const out = migrateEntity(src).value
    expect(listLegacyComponents(out)).toEqual([])
    expect(Object.keys(out.components)).toEqual(['Transform', 'Sprite', 'Movement', 'Event'])
  })

  it('is idempotent and returns the same object when nothing changes', () => {
    const src = ent({ SpriteView: { texture: 'player-walk' }, PlayerControl: {}, Interactable: { message: 'hi' } })
    const once = migrateEntity(src)
    expect(once.changed).toBe(true)
    const twice = migrateEntity(once.value)
    expect(twice.changed).toBe(false)
    expect(twice.value).toBe(once.value)
    const canonical = ent({ Collider: { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true } })
    const r = migrateEntity(canonical)
    expect(r.changed).toBe(false)
    expect(r.value).toBe(canonical)
  })

  it('never mutates (frozen input) and tolerates garbage', () => {
    const src = frozen(ent({ SpriteView: { texture: 'a-walk' }, Interactable: { message: 'm' }, AIWander: {} }))
    expect(() => migrateEntity(src)).not.toThrow()
    for (const bad of [null, undefined, 5, 'x', [], {}, { components: 4 }, { components: null }, { components: [] }]) {
      const r = migrateEntity(bad as any)
      expect(r.changed).toBe(false)
      expect(r.value).toBe(bad)
    }
    expect(() => migrateEntity(ent({ SpriteView: 5, Interactable: 'x', GridMovement: null, AIWander: [], CharacterAnimation: 7 }))).not.toThrow()
  })
})

describe('migrateMap', () => {
  it('stamps schemaVersion 2 even without entities, once', () => {
    const map = { name: 'm', width: 1, height: 1, layers: [] }
    const r = migrateMap(map)
    expect(r.changed).toBe(true)
    expect(r.value).toEqual({ ...map, schemaVersion: 2 })
    expect(map).not.toHaveProperty('schemaVersion')
    const again = migrateMap(r.value)
    expect(again.changed).toBe(false)
    expect(again.value).toBe(r.value)
  })

  it('leaves newer schema versions alone but still migrates entities', () => {
    const r = migrateMap({ schemaVersion: 3, entities: [ent({ Interactable: { message: 'x' } })] })
    expect(r.value.schemaVersion).toBe(3)
    expect(Object.keys(r.value.entities[0].components)).toContain('Event')
  })

  it('keeps unchanged entities by reference, ignores non-object entries and non-object maps', () => {
    const keep = ent({ Tag: { tag: 'k' } })
    const r = migrateMap({ schemaVersion: 2, entities: [keep, 7, null, ent({ GridMovement: {} })] })
    expect(r.value.entities[0]).toBe(keep)
    expect(r.value.entities[1]).toBe(7)
    expect(r.value.entities[2]).toBeNull()
    expect(r.changed).toBe(true)
    expect(migrateMap(null as any)).toEqual({ value: null, changed: false })
    expect(migrateMap([] as any).changed).toBe(false)
  })

  it('works on frozen maps', () => {
    const map = frozen({ name: 'm', width: 1, height: 1, layers: [], entities: [ent({ SpriteView: { texture: 'a-walk' } })] })
    expect(() => migrateMap(map)).not.toThrow()
  })
})
