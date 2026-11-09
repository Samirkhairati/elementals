import { describe, it, expect } from 'vitest'
import { makeLayer } from '@/test/helpers'
import {
  ENTITIES_ID,
  moveBlockInDrawOrder,
  clampEntitiesIndex,
  entitiesIndexAfterInsert,
  entitiesIndexAfterRemove,
  moveInDrawOrder,
  moveInStack,
  renderOrder,
  sortedImages,
  stackIds,
} from './layerOrder'

const ids = (layers: { id: string }[]) => layers.map((l) => l.id)

describe('renderOrder', () => {
  it('is the list read from the bottom, whatever the z values', () => {
    const layers = [makeLayer('top', { z: 1 }), makeLayer('mid', { z: 99 }), makeLayer('bottom', { z: -5 })]
    expect(ids(renderOrder(layers))).toEqual(['bottom', 'mid', 'top'])
  })

  it('does not change the array it is given', () => {
    const layers = [makeLayer('a'), makeLayer('b')]
    renderOrder(layers)
    expect(ids(layers)).toEqual(['a', 'b'])
  })
})

describe('sortedImages', () => {
  it('sorts by z and keeps array order for ties', () => {
    const items = [{ id: 'a', z: 1 }, { id: 'b' }, { id: 'c', z: 1 }, { id: 'd', z: -2 }]
    expect(sortedImages(items).map((i) => i.id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('handles a missing list', () => {
    expect(sortedImages(undefined)).toEqual([])
  })
})

describe('the stack with the Entities row', () => {
  const layers = [makeLayer('a', { z: 30 }), makeLayer('b', { z: 10 }), makeLayer('c', { z: 1 })]

  it('puts the row on top by default and clamps a bad position', () => {
    expect(stackIds(layers, undefined)).toEqual([ENTITIES_ID, 'a', 'b', 'c'])
    expect(stackIds(layers, 2)).toEqual(['a', 'b', ENTITIES_ID, 'c'])
    expect(stackIds(layers, 99)).toEqual(['a', 'b', 'c', ENTITIES_ID])
    expect(clampEntitiesIndex(-3, 3)).toBe(0)
    expect(clampEntitiesIndex(Number.NaN, 3)).toBe(0)
  })

  it('moving a layer reorders the list and leaves every z alone', () => {
    const out = moveInStack(layers, 0, 'c', 'a', 'top')
    expect(ids(out.layers)).toEqual(['c', 'a', 'b'])
    expect(out.layers.map((l) => l.z)).toEqual([1, 30, 10])
    expect(out.layers.find((l) => l.id === 'a')).toBe(layers[0]) // untouched objects
  })

  it('moving the Entities row down puts layers above it', () => {
    const out = moveInStack(layers, 0, ENTITIES_ID, 'b', 'bottom')
    expect(out.entitiesIndex).toBe(2)
    expect(ids(out.layers)).toEqual(['a', 'b', 'c'])
    expect(stackIds(out.layers, out.entitiesIndex)).toEqual(['a', 'b', ENTITIES_ID, 'c'])
  })

  it('a layer can be dragged past the Entities row', () => {
    const out = moveInStack(layers, 1, 'a', 'b', 'bottom') // stack: a, E, b, c  ->  E, b, a, c
    expect(stackIds(out.layers, out.entitiesIndex)).toEqual([ENTITIES_ID, 'b', 'a', 'c'])
  })

  it('dropping an item where it already is changes nothing', () => {
    expect(moveInStack(layers, 0, 'a', 'a', 'top').layers).toBe(layers)
    expect(moveInStack(layers, 0, 'a', ENTITIES_ID, 'bottom').layers).toBe(layers)
  })

  it('keeps the Entities row where it was relative to the layers when one is added or removed', () => {
    // row sits under the first layer (index 1)
    expect(entitiesIndexAfterInsert(1, 0, 3)).toBe(2) // new layer above it: the row moves down with the list
    expect(entitiesIndexAfterInsert(1, 2, 3)).toBe(1) // new layer below it
    expect(entitiesIndexAfterInsert(0, 0, 3)).toBe(0) // row on top: new layers appear under it
    expect(entitiesIndexAfterRemove(2, 0, 3)).toBe(1)
    expect(entitiesIndexAfterRemove(2, 2, 3)).toBe(2)
  })
})

describe('moveInDrawOrder', () => {
  const ids = (images: { id: string }[]) => images.map((i) => i.id)
  const drawn = (images: { id: string; z?: number }[]) => ids(sortedImages(images))

  it('swaps places with a neighbour that has the same z (array order breaks the tie)', () => {
    const images = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(drawn(moveInDrawOrder(images, 'a', 1))).toEqual(['b', 'a', 'c'])
    expect(drawn(moveInDrawOrder(images, 'c', -1))).toEqual(['a', 'c', 'b'])
  })

  it('trades z with a neighbour that has a different one, leaving the others alone', () => {
    const images = [{ id: 'a', z: 5 }, { id: 'b', z: 1 }, { id: 'c', z: 3 }]
    // draw order b(1) c(3) a(5): bring b forward past c
    const moved = moveInDrawOrder(images, 'b', 1)
    expect(drawn(moved)).toEqual(['c', 'b', 'a'])
    expect(moved.find((i) => i.id === 'a')!.z).toBe(5)
  })

  it('does nothing at either end or for an unknown id', () => {
    const images = [{ id: 'a' }, { id: 'b' }]
    expect(moveInDrawOrder(images, 'b', 1)).toBe(images)
    expect(moveInDrawOrder(images, 'a', -1)).toBe(images)
    expect(moveInDrawOrder(images, 'zzz', 1)).toBe(images)
  })
})

describe('moveBlockInDrawOrder', () => {
  const img = (id: string, z?: number) => ({ id, ...(z === undefined ? {} : { z }) })
  const order = (list: { id: string; z?: number }[]) => sortedImages(list).map((i) => i.id)

  it('moves a block in front of a target, keeping its own order', () => {
    const list = [img('a'), img('b'), img('c'), img('d')]
    expect(order(moveBlockInDrawOrder(list, ['a', 'b'], ['c'], 'top'))).toEqual(['c', 'a', 'b', 'd'])
    expect(order(moveBlockInDrawOrder(list, ['c', 'd'], ['a'], 'bottom'))).toEqual(['c', 'd', 'a', 'b'])
  })

  it('lands next to a whole target group: in front of its frontmost member, or behind its backmost one', () => {
    const list = [img('a'), img('g1'), img('g2'), img('b')]
    expect(order(moveBlockInDrawOrder(list, ['b'], ['g1', 'g2'], 'bottom'))).toEqual(['a', 'b', 'g1', 'g2'])
    expect(order(moveBlockInDrawOrder(list, ['a'], ['g1', 'g2'], 'top'))).toEqual(['g1', 'g2', 'a', 'b'])
  })

  it('takes the z of the target so explicit z values still give the new order', () => {
    const list = [img('a', 5), img('b', 1), img('c', 1)]
    const moved = moveBlockInDrawOrder(list, ['a'], ['b'], 'bottom')
    expect(order(moved)).toEqual(['a', 'b', 'c'])
    expect(moved.find((i) => i.id === 'a')?.z).toBe(1)
  })

  it('returns the same list when nothing moves', () => {
    const list = [img('a'), img('b')]
    expect(moveBlockInDrawOrder(list, ['x'], ['a'], 'top')).toBe(list)
    expect(moveBlockInDrawOrder(list, ['a'], ['a'], 'top')).toBe(list)
  })
})
