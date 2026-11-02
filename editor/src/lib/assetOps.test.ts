import { describe, expect, it, vi } from 'vitest'
import type { CharacterDef } from '../../../shared/engine/characters'
import type { CharacterInfo } from '../../../shared/engine/graphics'
import type { MapData } from '@/types/editor'
import { buildProjectReferences } from './referenceIndex'
import { allFolders, applyAssetPlan, canMoveFolder, folderChanges, graphicDeleteGuard, planGraphicChanges, planTilesetRename, summarizeReferences, tilesetDeleteGuard } from './assetOps'

const def = (image: string): CharacterDef => ({
  version: 2, name: 'Hero', tags: [], facing: 'none', pivot: { x: 0.5, y: 1 },
  sheets: { sheet: { image, frameWidth: 32, frameHeight: 32, margin: 0, spacing: 0 } }, clips: {}, bindings: {},
})
const characters: Record<string, CharacterInfo> = {
  'objects/chest': { id: 'objects/chest', def: def('props/chest.png'), images: {} },
  'objects/rock': { id: 'objects/rock', def: def('props/rock.png'), images: {} },
}
const map = (over: Partial<MapData> = {}): MapData => ({
  fileName: 'park.json', folderPath: null, name: 'Park', width: 4, height: 4, entities: [],
  layers: [
    { id: 'g', name: 'ground', type: 'tile', visible: true, data: { 0: { tilesetId: 'grass.png', x: 0, y: 0 } } },
    { id: 'i', name: 'sky', type: 'image', visible: true, images: [{ id: 'c', graphicId: 'props/cloud.png', x: 0, y: 0 }] },
  ],
  ...over,
} as unknown as MapData)
const maps = [map(), map({ fileName: 'other.json', name: 'Other', layers: [] })]
const refs = buildProjectReferences(maps as never, Object.values(characters))
const existing = new Set(['props/chest.png', 'props/rock.png', 'props/cloud.png', 'props/free.png'])

describe('folder helpers', () => {
  it('lists every ancestor folder plus the empty ones from disk', () => {
    expect(allFolders(['a/b/c.png', 'd.png'], ['empty'])).toEqual(['a', 'a/b', 'empty'])
  })
  it('maps ids when a folder is renamed or moved', () => {
    expect(folderChanges(['a/x.png', 'a/b/y.png', 'z.png'], 'a', 'q/a')).toEqual([{ from: 'a/x.png', to: 'q/a/x.png' }, { from: 'a/b/y.png', to: 'q/a/b/y.png' }])
    expect(folderChanges(['a/x.png'], 'a', '')).toEqual([{ from: 'a/x.png', to: 'x.png' }])
  })
  it('refuses to move a folder into itself or where it already is', () => {
    expect(canMoveFolder('a', 'a/b')).toBe(false)
    expect(canMoveFolder('a', 'a')).toBe(false)
    expect(canMoveFolder('a/b', 'a')).toBe(false)
    expect(canMoveFolder('a', '')).toBe(false)
    expect(canMoveFolder('a/b', '')).toBe(true)
  })
  it('summarises references', () => {
    expect(summarizeReferences([])).toBe('0 references')
    expect(summarizeReferences(refs.of({ table: 'graphic', id: 'props/chest.png' }))).toBe('1 reference in 1 sprite')
    expect(summarizeReferences(refs.of({ table: 'graphic', id: 'props/cloud.png' }))).toBe('1 reference in 1 map')
  })
})

describe('planGraphicChanges', () => {
  it('rewrites the sheets and the image layers that use the graphic', () => {
    const plan = planGraphicChanges(refs, characters, maps, existing, [{ from: 'props/chest.png', to: 'boxes/chest.png' }, { from: 'props/cloud.png', to: 'sky/cloud.png' }])
    expect(plan.ok).toBe(true)
    expect(plan.characters.map((c) => [c.id, c.def.sheets.sheet.image])).toEqual([['objects/chest', 'boxes/chest.png']])
    expect(plan.maps.map((m) => m.fileName)).toEqual(['park.json'])
    expect(plan.maps[0].layers[1].images![0].graphicId).toBe('sky/cloud.png')
    expect(plan.references).toHaveLength(2)
    expect(characters['objects/chest'].def.sheets.sheet.image).toBe('props/chest.png')
  })
  it('refuses invalid, unchanged and taken ids', () => {
    const plan = (to: string) => planGraphicChanges(refs, characters, maps, existing, [{ from: 'props/chest.png', to }])
    expect(plan('x/y').problem).toMatch(/not a valid graphic id/)
    expect(plan('props/chest.png').problem).toMatch(/current id/)
    expect(plan('props/rock.png').problem).toMatch(/already exists/)
    expect(plan('props/free.png').ok).toBe(false)
    expect(plan('props/new.png').ok).toBe(true)
  })
  it('lets a batch swap into ids it frees, but not collide with itself', () => {
    const swap = planGraphicChanges(refs, characters, maps, existing, [{ from: 'props/chest.png', to: 'props/rock.png' }, { from: 'props/rock.png', to: 'props/chest.png' }])
    expect(swap.ok).toBe(true)
    const clash = planGraphicChanges(refs, characters, maps, existing, [{ from: 'props/chest.png', to: 'a.png' }, { from: 'props/rock.png', to: 'a.png' }])
    expect(clash.ok).toBe(false)
  })
})

describe('planTilesetRename', () => {
  it('rewrites tiles painted from the tileset', () => {
    const plan = planTilesetRename(refs, maps, new Set(['grass.png', 'house.png']), 'grass.png', 'meadow')
    expect(plan.ok).toBe(true)
    expect(plan.maps).toHaveLength(1)
    expect(plan.maps[0].layers[0].data![0].tilesetId).toBe('meadow.png')
    expect(plan.references).toHaveLength(1)
  })
  it('refuses a bad stem, the same name and a taken name', () => {
    const taken = new Set(['grass.png', 'house.png'])
    expect(planTilesetRename(refs, maps, taken, 'grass.png', 'a b').problem).toMatch(/letters, digits/)
    expect(planTilesetRename(refs, maps, taken, 'grass.png', 'grass').problem).toMatch(/current/)
    expect(planTilesetRename(refs, maps, taken, 'grass.png', 'house').problem).toMatch(/already exists/)
  })
})

describe('delete guards', () => {
  it('block while something refers to the graphic or tileset', () => {
    expect(graphicDeleteGuard(refs, ['props/chest.png']).allowed).toBe(false)
    expect(graphicDeleteGuard(refs, ['props/free.png']).allowed).toBe(true)
    expect(tilesetDeleteGuard(refs, 'grass.png').allowed).toBe(false)
    expect(tilesetDeleteGuard(refs, 'house.png').allowed).toBe(true)
  })
})

describe('applyAssetPlan', () => {
  const plan = planGraphicChanges(refs, characters, maps, existing, [{ from: 'props/chest.png', to: 'boxes/chest.png' }, { from: 'props/cloud.png', to: 'sky/cloud.png' }])
  it('does the disk change first, then saves characters and maps', async () => {
    const order: string[] = []
    const r = await applyAssetPlan(plan, async () => { order.push('disk'); return { ok: true } }, {
      saveCharacter: async (id) => { order.push(`char ${id}`); return { ok: true } },
      saveMap: async (m) => { order.push(`map ${m.fileName}`); return { ok: true } },
    })
    expect(r).toEqual({ ok: true, error: '', failed: [] })
    expect(order).toEqual(['disk', 'char objects/chest', 'map park.json'])
  })
  it('stops before rewriting when the disk change fails', async () => {
    const save = vi.fn(async () => ({ ok: true as const }))
    const r = await applyAssetPlan(plan, async () => ({ ok: false, error: 'locked' }), { saveCharacter: save, saveMap: save })
    expect(r).toEqual({ ok: false, error: 'locked', failed: [] })
    expect(save).not.toHaveBeenCalled()
  })
  it('names what could not be rewritten', async () => {
    const r = await applyAssetPlan(plan, async () => ({ ok: true }), { saveCharacter: async () => ({ ok: true }), saveMap: async () => ({ ok: false, error: 'no' }) })
    expect(r.ok).toBe(false)
    expect(r.failed).toEqual(['Park'])
  })
  it('does nothing for a plan that is not ok', async () => {
    const diskOp = vi.fn(async () => ({ ok: true as const }))
    const bad = planGraphicChanges(refs, characters, maps, existing, [{ from: 'props/chest.png', to: 'nope' }])
    expect((await applyAssetPlan(bad, diskOp, { saveCharacter: diskOp, saveMap: diskOp })).ok).toBe(false)
    expect(diskOp).not.toHaveBeenCalled()
  })
})
