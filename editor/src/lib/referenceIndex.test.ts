import { describe, expect, it, vi } from 'vitest'
import type { CharacterDef } from '../../../shared/engine/characters'
import type { MapData } from '@/types/editor'
import { buildProjectReferences, groupReferences } from './referenceIndex'
import { applyCharacterRename, deleteGuard, planCharacterRename, planClipRenames } from './renameFlow'

const node = (id: string, type: string, params: Record<string, unknown>) => ({ id, type, params, out: {}, x: 0, y: 0 })
const def = (name: string): CharacterDef => ({
  version: 2, name, tags: [], facing: 'none', pivot: { x: 0.5, y: 1 }, sheets: { sheet: { image: 'a.png', frameWidth: 8, frameHeight: 8, margin: 0, spacing: 0 } },
  clips: { open: { sheet: 'sheet', fps: 4, loop: false, directional: false, frames: [0] } }, bindings: {},
})
const map = (over: Partial<MapData> = {}): MapData => ({
  name: 'Town', fileName: 'town.json', folderPath: null, width: 4, height: 4, layers: [],
  entities: [{
    id: 'c', name: 'Chest', x: 0, y: 0,
    components: {
      Sprite: { asset: 'objects/chest', animation: '' },
      Event: { states: [{
        id: 's', name: 'Open', conditions: [{ kind: 'switch', id: 'opened', value: false }], trigger: 'action', faceOnInteract: true, solid: null, appearance: {},
        graph: { nodes: [node('start', 'start', {}), node('p', 'playAnimation', { target: 'self', animation: 'open' }), node('w', 'setSwitch', { id: 'opened', value: true })], frames: [] },
      }] },
    },
  }] as never,
  ...over,
})
const chars = [{ id: 'objects/chest', def: def('Chest') }, { id: 'objects/box', def: def('Box') }]

describe('project references: characters, graphics, tilesets and flags behind one index', () => {
  const refs = buildProjectReferences([map()], chars)
  it('answers character and flag targets through the same of()', () => {
    expect(refs.of({ table: 'character', id: 'objects/chest' }).map((r) => r.where).sort()).toEqual(['node', 'sprite', 'sprite']) // the map's Sprite and Play Animation, and the chest prefab
    const sw = refs.of({ table: 'switch', id: 'opened' })
    expect(sw.map((r) => r.where).sort()).toEqual(['condition', 'node'])
    expect(sw.find((r) => r.where === 'node')?.label).toBe('Town › Chest › Open › setSwitch')
    expect(refs.flags.switches.opened).toHaveLength(2)
    expect(refs.of({ table: 'switch', id: 'nope' })).toEqual([])
    expect(refs.of({ table: 'graphic', id: 'a.png' })).toHaveLength(2)
  })

  it('groups references by map, then entity, and keeps prefabs apart', () => {
    const groups = groupReferences(buildProjectReferences([map()], chars).of({ table: 'character', id: 'objects/chest' }))
    expect(groups.map((g) => g.map)).toEqual(['Town', '']) // the map first, prefabs last
    expect(groups[0]).toMatchObject({ map: 'Town', entities: [{ entity: 'Chest' }] })
    expect(groups[1].others.every((r) => r.source.table === 'prefab')).toBe(true)
    expect(groups[0].entities[0].refs).toHaveLength(2)
    const prefab = groupReferences(buildProjectReferences([], chars).of({ table: 'character', id: 'objects/chest' }))
    expect(prefab[0]).toMatchObject({ map: '', entities: [] })
    expect(prefab[0].others.length).toBeGreaterThan(0)
  })
})

describe('safe rename and delete', () => {
  const refs = buildProjectReferences([map()], chars)
  const taken = new Set(chars.map((c) => c.id))

  it('plans a rename: lists the references, rewrites the maps, flags the prefabs it cannot rewrite', () => {
    const plan = planCharacterRename(refs, [map()], taken, 'objects/chest', 'objects/crate')
    expect(plan.ok).toBe(true)
    expect(plan.references.length).toBeGreaterThan(2) // the map's sprite + node, and the chest prefab
    expect(plan.unrewritable.every((r) => r.source.table === 'prefab')).toBe(true)
    expect(plan.unrewritable.length).toBeGreaterThan(0)
    expect(plan.maps).toHaveLength(1)
    expect((plan.maps[0].entities?.[0].components.Sprite as { asset: string }).asset).toBe('objects/crate')
  })

  it('refuses invalid, unchanged and taken ids without touching any map', () => {
    for (const [to, pattern] of [['../x', /letters/], ['objects/chest', /current id/], ['objects/box', /already exists/]] as const) {
      const plan = planCharacterRename(refs, [map()], taken, 'objects/chest', to)
      expect(plan.ok).toBe(false)
      expect(plan.problem).toMatch(pattern)
      expect(plan.maps).toEqual([])
    }
  })

  it('applies: the record is renamed first, then every changed map is saved; a failed map is reported', async () => {
    const calls: string[] = []
    const io = {
      renameCharacter: vi.fn(async (a: string, b: string) => { calls.push(`rename ${a}→${b}`); return { ok: true as const } }),
      saveMap: vi.fn(async (m: MapData) => { calls.push(`save ${m.fileName}`); return m.fileName === 'bad.json' ? { ok: false as const, error: 'disk' } : { ok: true as const } }),
    }
    const plan = planCharacterRename(refs, [map(), map({ fileName: 'bad.json', name: 'Bad' })], taken, 'objects/chest', 'objects/crate')
    const result = await applyCharacterRename(plan, 'objects/chest', 'objects/crate', io)
    expect(calls).toEqual(['rename objects/chest→objects/crate', 'save town.json', 'save bad.json'])
    expect(result).toMatchObject({ ok: false, failedMaps: ['Bad'] })
    expect(result.error).toMatch(/could not be updated: Bad/)
    const failing = await applyCharacterRename(plan, 'objects/chest', 'objects/crate', { ...io, renameCharacter: async () => ({ ok: false, error: 'exists' }) })
    expect(failing).toEqual({ ok: false, error: 'exists', failedMaps: [] })
    expect((await applyCharacterRename({ ...plan, ok: false, problem: 'nope' }, 'a', 'b', io)).error).toBe('nope')
  })

  it('animation renames rewrite the maps that name them', () => {
    const maps = planClipRenames([map()], 'objects/chest', [{ from: 'open', to: 'unlock' }])
    expect(maps).toHaveLength(1)
    const rewritten = buildProjectReferences(maps, chars).of({ table: 'character', id: 'objects/chest', clip: 'unlock' })
    expect(rewritten).toHaveLength(1)
    expect(planClipRenames([map()], 'objects/chest', [{ from: 'close', to: 'x' }])).toEqual([])
    expect(planClipRenames([map()], 'objects/box', [{ from: 'open', to: 'x' }])).toEqual([])
  })

  it('delete is blocked while anything refers to the character', () => {
    expect(deleteGuard(refs, 'objects/chest')).toMatchObject({ allowed: false })
    expect(deleteGuard(refs, 'objects/chest').references.length).toBeGreaterThan(0)
    expect(deleteGuard(refs, 'objects/box')).toMatchObject({ allowed: true, references: [] })
  })
})
