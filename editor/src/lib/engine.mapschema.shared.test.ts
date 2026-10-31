/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENT_TYPES, LEGACY_COMPONENT_TYPES, validateEditorMap } from '../../../shared/mapSchema'
import { convertEditorMapToTiled, serializeTiledMap } from '../../../shared/mapExport'
import { createCommand, createDefaultComponent } from '../../../shared/engine/index'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const map = (entities: any[]): any => ({ name: 'm', width: 4, height: 4, layers: [], entities })
const entity = (components: Record<string, any>, extra: Record<string, any> = {}): any => ({
  id: 'e1', name: 'E', x: 48, y: 64, components: { Transform: { x: 48, y: 64, depth: 10 }, ...components }, ...extra,
})

describe('validateEditorMap + engine validation', () => {
  it('shared lists', () => {
    expect([...COMPONENT_TYPES]).toEqual(['Transform', 'Sprite', 'Collider', 'Movement', 'Event', 'Tag'])
    expect([...LEGACY_COMPONENT_TYPES]).toContain('Interactable')
  })

  it('accepts canonical entities without warnings', () => {
    const e = entity({ Sprite: createDefaultComponent('Sprite'), Collider: createDefaultComponent('Collider'), Event: createDefaultComponent('Event'), Movement: createDefaultComponent('Movement'), Tag: { tag: 't' } })
    expect(validateEditorMap(map([e]))).toEqual({ ok: true, errors: [], warnings: [] })
  })

  it('accepts legacy entities (migrated first) and warns about them once', () => {
    const legacy = entity({ SpriteView: { texture: 'player-walk' }, GridMovement: { speed: 100 }, PlayerControl: {}, Interactable: { message: 'hi' }, CharacterAnimation: { characterKey: 'player' } })
    const res = validateEditorMap(map([legacy]))
    expect(res.ok).toBe(true)
    expect(res.errors).toEqual([])
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toMatch(/legacy components \(.*SpriteView.*\)/)
  })

  it('does not report raw problems twice', () => {
    const res = validateEditorMap(map([entity({ Bogus: {} }), entity({ Collider: { width: NaN } }, { id: 'e2' })]))
    expect(res.errors.filter((e) => /unknown component/.test(e))).toHaveLength(1)
    expect(res.errors.filter((e) => /Collider\.width/.test(e))).toHaveLength(1)
    expect(res.errors.filter((e) => /Width/.test(e))).toHaveLength(0)
  })

  it('reports bad props and broken events as errors', () => {
    const ev = createDefaultComponent('Event')
    ev.states[0].commands.push(createCommand('breakLoop'))
    ev.states[0].trigger = 'whenever' as any
    const res = validateEditorMap(map([entity({ Collider: { isSolid: 'maybe' }, Event: ev })]))
    expect(res.ok).toBe(false)
    expect(res.errors.join('\n')).toMatch(/Solid: must be true or false/)
    expect(res.errors.join('\n')).toMatch(/unknown trigger "whenever"/)
    expect(res.errors.join('\n')).toMatch(/Break Loop can only be used inside a Loop/)
    expect(res.errors[0]).toContain('entities[0] ("E")')
  })

  it('missing references only fail when a context is supplied', () => {
    const ev = createDefaultComponent('Event')
    ev.states[0].commands.push(createCommand('setSwitch', { id: 'ghost' }))
    const m = map([entity({ Event: ev })])
    expect(validateEditorMap(m).ok).toBe(true)
    const res = validateEditorMap(m, { context: { switchIds: ['s1'] } })
    expect(res.ok).toBe(false)
    expect(res.errors.join()).toMatch(/switch "ghost" does not exist/)
  })

  it('unset command parameters are only warnings', () => {
    const ev = createDefaultComponent('Event')
    ev.states[0].commands.push(createCommand('warp'))
    const res = validateEditorMap(map([entity({ Event: ev })]))
    expect(res.ok).toBe(true)
    expect(res.warnings.join()).toMatch(/"Map" is not set/)
  })

  it('a legacy entity with garbage inside does not crash validation', () => {
    const res = validateEditorMap(map([entity({ Interactable: { message: 5, targetMap: [], type: {} }, SpriteView: { texture: 7, frame: {} }, AIWander: { radius: 'x' } })]))
    expect(res.ok).toBe(true)
    // non-object component props are still rejected by the structural check
    expect(validateEditorMap(map([entity({ SpriteView: 3 })])).ok).toBe(false)
  })
})

describe('export always carries canonical entities', () => {
  it('migrates legacy maps and the result validates and re-exports identically', () => {
    const legacy = map([entity({ SpriteView: { texture: 'player-walk' }, Interactable: { type: 'on_step', targetMap: 'city.json', targetX: 3, targetY: 4 } })])
    const first = convertEditorMapToTiled(legacy, [])
    expect(first.schemaVersion).toBe(3)
    expect(Object.keys(first.entities[0].components)).toEqual(['Transform', 'Sprite', 'Event'])
    expect(validateEditorMap({ ...legacy, entities: first.entities }).warnings).toEqual([])
    expect(serializeTiledMap(convertEditorMapToTiled({ ...legacy, entities: first.entities } as any, []))).toBe(serializeTiledMap(first))
  })
})

describe('plain Node (no bundler)', () => {
  it('shared/engine/index.ts loads natively and migration works', () => {
    const script = `
      import { migrateMap, validateEntity, PREFABS } from './shared/engine/index.ts';
      import { convertEditorMapToTiled } from './shared/mapExport.ts';
      import { validateEditorMap } from './shared/mapSchema.ts';
      const m = { name: 'x', width: 2, height: 2, layers: [], entities: [{ id: 'a', name: 'a', x: 16, y: 32, components: { Transform: { x: 16, y: 32 }, Interactable: { message: 'hi' } } }] };
      const t = convertEditorMapToTiled(m, []);
      console.log(JSON.stringify({ v: t.schemaVersion, c: Object.keys(t.entities[0].components), ok: validateEditorMap(m).ok, p: PREFABS.length, issues: validateEntity(t.entities[0]).length, changed: migrateMap(m).changed }));
    `
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: REPO, encoding: 'utf8' })
    expect(JSON.parse(out.trim())).toEqual({ v: 3, c: ['Transform', 'Event'], ok: true, p: 7, issues: 0, changed: true })
  })
})
