import { describe, expect, it } from 'vitest'
import { PREFABS, buildReferenceIndex, rewriteCharacterId, rewriteClipName, rewriteGraphicId } from '../../../shared/engine/index'
import type { CharacterDef, RefMap } from '../../../shared/engine/index'

const node = (id: string, type: string, params: Record<string, unknown>) => ({ id, type, params, out: {}, x: 0, y: 0 })
const state = (name: string, over: Record<string, unknown> = {}, nodes: unknown[] = []) => ({ id: name, name, conditions: [], trigger: 'action', faceOnInteract: true, solid: null, appearance: {}, graph: { nodes: [node('s', 'start', {}), ...nodes], frames: [] }, ...over })
const entity = (id: string, name: string, sprite: Record<string, unknown> | null, states: unknown[] = []) => ({
  id, name, components: { ...(sprite ? { Sprite: sprite } : {}), ...(states.length ? { Event: { states } } : {}) },
})

// One fixture map with every kind of reference.
const town: RefMap = {
  fileName: 'town.json', name: 'Town',
  layers: [{ name: 'ground', data: { 0: { tilesetId: 'grass.png' }, 1: { tilesetId: 'grass.png' } } }, { name: 'decor', data: { 0: { tilesetId: 'house.png' } } }],
  entities: [
    entity('old', 'Old man', { asset: 'characters/oldman', animation: 'wave' }, [
      state('State 1'),
      state('State 2', { appearance: { asset: 'characters/oldman-sad', animation: 'cry' } }, [
        node('n1', 'changeSprite', { target: 'self', asset: 'characters/cloak', animation: 'swish' }),
        node('n2', 'playAnimation', { target: 'self', animation: 'wave' }),
        node('n3', 'playAnimation', { target: { entity: 'chest' }, animation: 'open' }),
        node('n4', 'playAnimation', { target: 'player', animation: 'wave' }),
        node('n5', 'setSwitch', { id: 'x', value: true }),
      ]),
    ]),
    entity('chest', 'Chest', { asset: 'objects/chest', animation: '' }),
    entity('empty', 'Empty', { asset: '', animation: '' }),
  ],
}
const def = (name: string, image: string, over: Partial<CharacterDef> = {}): CharacterDef => ({
  version: 2, name, tags: [], facing: 'none', pivot: { x: 0.5, y: 1 },
  sheets: { sheet: { image, frameWidth: 32, frameHeight: 32, margin: 0, spacing: 0 } },
  clips: { wave: { sheet: 'sheet', fps: 4, loop: true, directional: false, frames: [0] }, open: { sheet: 'sheet', fps: 4, loop: false, directional: false, frames: [0, 1] } }, bindings: { idle: 'wave' }, ...over,
})
const characters = [
  { id: 'characters/oldman', def: def('Old man', 'sprites/oldman.png') },
  { id: 'objects/chest', def: def('Chest', 'sprites/shared.png') },
  { id: 'objects/other', def: def('Other', 'sprites/shared.png') },
]
const index = buildReferenceIndex({ maps: [town], characters })
const where = (refs: { where: string }[]) => refs.map((r) => r.where).sort()

describe('buildReferenceIndex', () => {
  it('finds sprite, state appearance and node references to a character, with readable labels', () => {
    const refs = index.of({ table: 'character', id: 'characters/oldman' })
    expect(where(refs)).toEqual(['node', 'sprite']) // the Sprite and the self-targeted Play Animation (bindings are clip-level)
    expect(refs.map((r) => r.label)).toEqual(expect.arrayContaining(['Town › Old man › Sprite', 'Town › Old man › State 2 › Play Animation node']))
    expect(index.of({ table: 'character', id: 'characters/oldman-sad' }).map((r) => r.label)).toEqual(['Town › Old man › State 2 › appearance'])
    expect(index.of({ table: 'character', id: 'characters/cloak' }).some((r) => r.label.endsWith('Change Sprite node'))).toBe(true)
  })

  it('resolves play-animation targets: self, another entity by id; the player is unknown', () => {
    expect(index.of({ table: 'character', id: 'objects/chest', clip: 'open' }).map((r) => r.where)).toContain('node')
    const wave = index.of({ table: 'character', id: 'characters/oldman', clip: 'wave' })
    expect(wave.map((r) => r.where).sort()).toEqual(['binding', 'node', 'sprite'])
    expect(wave.find((r) => r.where === 'node')?.source).toMatchObject({ nodeId: 'n2', nodeType: 'playAnimation', stateIndex: 1, entityId: 'old' })
    // 'player' target cannot be resolved to a character, so n4 is nobody's reference
    expect(index.all.filter((r) => r.source.table === 'map' && r.source.nodeId === 'n4')).toEqual([])
  })

  it('character → graphic references show which characters share an image', () => {
    const shared = index.of({ table: 'graphic', id: 'sprites/shared.png' })
    expect(shared.map((r) => r.source)).toEqual([{ table: 'character', id: 'objects/chest', sheet: 'sheet' }, { table: 'character', id: 'objects/other', sheet: 'sheet' }])
    expect(index.of({ table: 'graphic', id: 'nope.png' })).toEqual([])
  })

  it('map layers reference tilesets once per layer', () => {
    expect(index.of({ table: 'tileset', id: 'grass.png' }).map((r) => r.label)).toEqual(['Town › layer ground'])
    expect(index.of({ table: 'tileset', id: 'house.png' })).toHaveLength(1)
  })

  it('counts per table and per clip, ignoring clip-level duplicates in the character totals', () => {
    const counts = index.counts('character')
    expect(counts['characters/oldman']).toBe(2) // Sprite + Play Animation; a binding belongs to the character itself and each source counts once
    expect(counts['objects/chest']).toBe(2) // Sprite + node n3
    expect(index.clipCounts('characters/oldman')).toEqual({ wave: 3 })
    expect(index.counts('graphic')['sprites/shared.png']).toBe(2)
    expect(index.counts('tileset')).toEqual({ 'grass.png': 1, 'house.png': 1 })
  })

  it('prefab defaults count too, and an entity without a Sprite or with an empty asset adds nothing', () => {
    const prefabs = PREFABS.map((p) => ({ id: p.id, entity: { components: p.components } }))
    const withPrefabs = buildReferenceIndex({ maps: [], characters: [], prefabs })
    const refs = withPrefabs.of({ table: 'character', id: 'objects/chest' })
    expect(refs.some((r) => r.source.table === 'prefab' && r.source.id === 'chest')).toBe(true)
    expect(buildReferenceIndex({ maps: [{ fileName: 'a', name: 'A', entities: [entity('e', 'E', null), entity('f', 'F', { asset: '' })] }], characters: [] }).all).toEqual([])
  })

  it('is safe on junk input', () => {
    const junk = { fileName: 'j', name: '', entities: [{ id: 'x', name: 'X', components: { Sprite: 5, Event: { states: [null, 3, { graph: 4 }, { graph: { nodes: [null, { type: 7 }] }, appearance: 'x' }] } } }] } as unknown as RefMap
    expect(() => buildReferenceIndex({ maps: [junk], characters: [] })).not.toThrow()
  })
})

describe('rewrites', () => {
  it('rewriteCharacterId changes Sprite, appearance and Change Sprite nodes, nothing else, and keeps unchanged maps identical', () => {
    const r = rewriteCharacterId(town, 'characters/oldman', 'characters/elder')
    expect(r.changed).toBe(true)
    const e = r.map.entities?.[0] as unknown as { components: { Sprite: { asset: string } } }
    expect(e.components.Sprite.asset).toBe('characters/elder')
    expect(rewriteCharacterId(town, 'nobody', 'x')).toEqual({ map: town, changed: false })
    const renamedCloak = rewriteCharacterId(town, 'characters/cloak', 'characters/cape')
    expect(buildReferenceIndex({ maps: [renamedCloak.map], characters: [] }).of({ table: 'character', id: 'characters/cape' })).toHaveLength(1)
    expect(buildReferenceIndex({ maps: [renamedCloak.map], characters: [] }).of({ table: 'character', id: 'characters/cape', clip: 'swish' })).toHaveLength(1)
    const sad = rewriteCharacterId(town, 'characters/oldman-sad', 'characters/sad')
    expect(JSON.stringify(sad.map)).toContain('"asset":"characters/sad"')
    expect(JSON.stringify(town)).toContain('characters/oldman-sad') // input untouched
    // after rewriting there is nothing left that points at the old id
    expect(buildReferenceIndex({ maps: [r.map], characters: [] }).of({ table: 'character', id: 'characters/oldman' })).toEqual([])
  })

  it('rewriteClipName follows the character: Sprite, appearance and nodes whose target resolves to it', () => {
    const r = rewriteClipName(town, 'characters/oldman', 'wave', 'greet')
    expect(r.changed).toBe(true)
    const after = buildReferenceIndex({ maps: [r.map], characters: [] })
    expect(after.of({ table: 'character', id: 'characters/oldman', clip: 'greet' }).map((x) => x.where).sort()).toEqual(['node', 'sprite'])
    expect(after.of({ table: 'character', id: 'characters/oldman', clip: 'wave' })).toEqual([])
    // another character's "open"/"wave" is not touched
    const chest = rewriteClipName(town, 'objects/chest', 'wave', 'x')
    expect(chest.changed).toBe(false)
    expect(rewriteClipName(town, 'objects/chest', 'open', 'unlock').changed).toBe(true)
    expect(rewriteClipName(town, 'characters/oldman-sad', 'cry', 'sob').changed).toBe(true)
  })

  it('rewriteGraphicId points sheets at the new id', () => {
    const d = def('X', 'a.png')
    expect(rewriteGraphicId(d, 'a.png', 'b.png').def.sheets.sheet.image).toBe('b.png')
    expect(rewriteGraphicId(d, 'zzz.png', 'b.png')).toEqual({ def: d, changed: false })
    expect(d.sheets.sheet.image).toBe('a.png')
  })
})
