import { describe, expect, it } from 'vitest'
import { MAX_COMPONENTS, MAX_MASKS } from '../../../../shared/look/schema'
import type { Look, LookMask, LookSet } from '../../../../shared/look/types'
import type { SceneNode } from '../../../../shared/sceneTree'
import { canAddComponent, canAddMask, editLookSet, hasShadow, withShadowEverywhere, lookInView, moveBy, newComponent, newMask, patchAdjust, selectedSubject, updateComponent, updateMask } from './lookEdit'

const layers = [
  { id: 't', type: 'tile', name: 'T' },
  { id: 'i', type: 'group', name: 'I', children: [{ id: 'p1', type: 'picture', name: 'P', x: 0, y: 0, children: [] }] },
  { id: 'c', type: 'collision', name: 'C', children: [] },
  { id: 'f', type: 'group', name: 'F', children: [] },
] as SceneNode[]

describe('selectedSubject', () => {
  it('maps the active layer / picture, and falls back to the map', () => {
    expect(selectedSubject(layers, 't', null)).toEqual({ kind: 'layer', layerId: 't' })
    expect(selectedSubject(layers, 'i', 'p1')).toEqual({ kind: 'picture', layerId: 'i', imageId: 'p1' })
    expect(selectedSubject(layers, 'i', 'nope')).toEqual({ kind: 'layer', layerId: 'i' })
    expect(selectedSubject(layers, 't', 'p1')).toEqual({ kind: 'layer', layerId: 't' })
    expect(selectedSubject(layers, 'c', null)).toEqual({ kind: 'map' })
    expect(selectedSubject(layers, 'f', null)).toEqual({ kind: 'layer', layerId: 'f' }) // a Node2D's Look grades what is inside
    expect(selectedSubject(layers, 'p1', null)).toEqual({ kind: 'picture', layerId: 'i', imageId: 'p1' }) // a sprite as the active node
    expect(selectedSubject(layers, 'missing', null)).toEqual({ kind: 'map' })
    expect(selectedSubject(layers, null, null)).toEqual({ kind: 'map' })
  })
})

describe('lookInView', () => {
  const set: LookSet = { default: { adjust: { exposure: 1 } }, profiles: { night: { adjust: { exposure: -1 } } } }
  it('shows the own look, or the default as inherited', () => {
    expect(lookInView(set, null)).toEqual({ look: set.default, inherited: false })
    expect(lookInView(set, 'night')).toEqual({ look: set.profiles!.night, inherited: false })
    expect(lookInView(set, 'day')).toEqual({ look: set.default, inherited: true })
    expect(lookInView(undefined, 'day')).toEqual({ look: undefined, inherited: false })
    expect(lookInView({ profiles: { night: {} } }, 'day')).toEqual({ look: undefined, inherited: false })
  })
})

describe('withShadowEverywhere', () => {
  it('adds the shadow to the default look and to every profile look without one', () => {
    const set: LookSet = { default: { adjust: { exposure: 1 } }, profiles: { night: { adjust: { exposure: -1 } }, dusk: { shadow: { x: 1, y: 1 } } } }
    const next = withShadowEverywhere(set, { x: 6, y: 8 })
    expect(next.default).toEqual({ adjust: { exposure: 1 }, shadow: { x: 6, y: 8 } })
    expect(next.profiles?.night.shadow).toEqual({ x: 6, y: 8 })
    expect(next.profiles?.dusk.shadow).toEqual({ x: 1, y: 1 })
    expect(hasShadow(set)).toBe(true)
    expect(hasShadow(undefined)).toBe(false)
    expect(withShadowEverywhere(undefined, { x: 2, y: 3 })).toEqual({ default: { shadow: { x: 2, y: 3 } } })
  })
})

describe('editLookSet', () => {
  it('removes an emptied default look', () => {
    const set: LookSet = { default: { adjust: { exposure: 1 } } }
    expect(editLookSet(set, null, ({ adjust: _a, ...rest }) => rest)).toBeUndefined()
  })
  it('keeps a default look that only casts a shadow', () => {
    expect(editLookSet(undefined, null, (l) => ({ ...l, shadow: { x: 4, y: 6 } }))).toEqual({ default: { shadow: { x: 4, y: 6 } } })
  })
  it('keeps an emptied profile look as {}', () => {
    const set: LookSet = { default: { adjust: { exposure: 1 } }, profiles: { night: { adjust: { exposure: 2 } } } }
    const next = editLookSet(set, 'night', ({ adjust: _a, ...rest }) => rest)
    expect(next?.profiles?.night).toEqual({})
    expect(next?.default).toEqual(set.default)
  })
  it('copies the default into a profile without its own look and leaves the default alone', () => {
    const set: LookSet = { default: { adjust: { exposure: 1, contrast: 5 } } }
    const next = editLookSet(set, 'night', (l) => ({ ...l, adjust: { ...l.adjust, exposure: 2 } }))
    expect(next?.profiles?.night?.adjust).toEqual({ exposure: 2, contrast: 5 })
    expect(next?.default).toEqual({ adjust: { exposure: 1, contrast: 5 } })
  })
  it('a change returning undefined removes the profile look', () => {
    const set: LookSet = { default: { enabled: false }, profiles: { night: { adjust: { exposure: 2 } } } }
    expect(editLookSet(set, 'night', () => undefined)).toEqual({ default: { enabled: false } })
  })
})

describe('patchAdjust', () => {
  it('removes 0, undefined and empty objects', () => {
    expect(patchAdjust({ exposure: 1, contrast: 2 }, { exposure: 0 })).toEqual({ contrast: 2 })
    expect(patchAdjust({ exposure: 1, contrast: 2 }, { contrast: undefined })).toEqual({ exposure: 1 })
    expect(patchAdjust({ exposure: 1, hsl: { red: { h: 1 } } } as never, { hsl: {} } as never)).toEqual({ exposure: 1 })
    expect(patchAdjust(undefined, { exposure: 0.5 })).toEqual({ exposure: 0.5 })
  })
  it('is undefined when nothing is left', () => {
    expect(patchAdjust({ exposure: 1 }, { exposure: 0 })).toBeUndefined()
    expect(patchAdjust(undefined, {})).toBeUndefined()
  })
})

describe('newComponent', () => {
  const box = { x: 100, y: 200, w: 80, h: 40 }
  it('places each type inside the box', () => {
    const linear = newComponent('linear', 'add', box)
    expect(linear.id).toBeTruthy()
    expect(linear).toMatchObject({ type: 'linear', mode: 'add', x1: 140, y1: 200, x2: 140, y2: 220 })
    expect(newComponent('radial', 'add', box)).toMatchObject({ cx: 140, cy: 220, rx: 20, ry: 10 })
    expect(newComponent('rect', 'subtract', box)).toMatchObject({ mode: 'subtract', x: 120, y: 210, w: 40, h: 20 })
    expect(newComponent('brush', 'add', box)).toMatchObject({ type: 'brush', strokes: [] })
    expect(newComponent('color', 'add', box)).toMatchObject({ type: 'color' })
    expect(newComponent('luminance', 'add', box)).toMatchObject({ type: 'luminance', low: 0.5, high: 1 })
    expect(newComponent('all', 'intersect', box)).toMatchObject({ type: 'all', mode: 'intersect' })
  })
})

describe('newMask', () => {
  const box = { x: 0, y: 0, w: 10, h: 10 }
  it('names masks "Mask n" and skips taken names', () => {
    expect(newMask([], 'all', box).name).toBe('Mask 1')
    expect(newMask([{ name: 'Mask 2' }] as LookMask[], 'all', box).name).toBe('Mask 3')
    const m = newMask([{ name: 'Mask 1' }, { name: 'Mask 2' }] as LookMask[], 'brush', box)
    expect(m.name).toBe('Mask 3')
    expect(m.components).toHaveLength(1)
    expect(m.components[0].type).toBe('brush')
  })
})

describe('mask / component updates', () => {
  const box = { x: 0, y: 0, w: 10, h: 10 }
  const mask = newMask([], 'radial', box)
  const look: Look = { masks: [mask] }
  it('updateMask replaces, and removes a mask (dropping the list when empty)', () => {
    expect(updateMask(look, mask.id, (m) => ({ ...m, name: 'X' })).masks?.[0].name).toBe('X')
    expect(updateMask(look, mask.id, () => null).masks).toBeUndefined()
    expect(updateMask(look, 'other', () => null).masks).toHaveLength(1)
  })
  it('updateComponent replaces and removes', () => {
    const cid = mask.components[0].id
    expect(updateComponent(mask, cid, (c) => ({ ...c, invert: true })).components[0].invert).toBe(true)
    expect(updateComponent(mask, cid, () => null).components).toHaveLength(0)
  })
})

describe('moveBy', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('swaps neighbours and ignores the edges', () => {
    expect(moveBy(list, 'b', -1).map((x) => x.id)).toEqual(['b', 'a', 'c'])
    expect(moveBy(list, 'b', 1).map((x) => x.id)).toEqual(['a', 'c', 'b'])
    expect(moveBy(list, 'a', -1).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(moveBy(list, 'c', 1).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(moveBy(list, 'zz', 1).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('limits', () => {
  const mk = (n: number, comps = 1): LookMask[] =>
    Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `M${i}`, components: Array.from({ length: comps }, (_, j) => ({ id: `c${j}`, mode: 'add', type: 'all' })) }) as LookMask)
  it('canAddMask stops at MAX_MASKS', () => {
    expect(canAddMask(undefined)).toBe(true)
    expect(canAddMask({ masks: mk(MAX_MASKS - 1) })).toBe(true)
    expect(canAddMask({ masks: mk(MAX_MASKS) })).toBe(false)
  })
  it('canAddComponent stops at MAX_COMPONENTS in total', () => {
    expect(canAddComponent(undefined)).toBe(true)
    expect(canAddComponent({ masks: mk(MAX_MASKS, MAX_COMPONENTS / MAX_MASKS - 1) })).toBe(true)
    expect(canAddComponent({ masks: mk(MAX_MASKS, MAX_COMPONENTS / MAX_MASKS) })).toBe(false)
  })
})
