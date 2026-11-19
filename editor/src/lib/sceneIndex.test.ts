import { describe, expect, it } from 'vitest'
import type { SceneNode } from '../../../shared/sceneTree'
import { makeEntity, makeGroup, makeImageLayer, makeLayer, makePicture } from '@/test/helpers'
import { drawPlan, layerAbove, layerOf, lockedNode, nodeOf, pictureLocked, sceneIndex, shown, visiblePictures } from './sceneIndex'

const tree = (): SceneNode[] => [
  makeLayer('ground'),
  makeEntity('a'),
  makeEntity('b'),
  makeGroup('town', [makeLayer('roofs'), makeEntity('c', { visible: false }), makeEntity('d')], { locked: true }),
  makeGroup('hidden', [makeLayer('under'), makeEntity('e')], { visible: false }),
  makeImageLayer('trees', [makePicture('oak', { z: 2 }), makeGroup('wall', [makePicture('left'), makePicture('right', { visible: false })], { locked: true }) as never, makePicture('pine')]),
]

describe('sceneIndex', () => {
  it('is built once per tree: the same nodes array gives the same index', () => {
    const nodes = tree()
    expect(sceneIndex(nodes)).toBe(sceneIndex(nodes))
    expect(sceneIndex(tree())).not.toBe(sceneIndex(nodes))
  })

  it('lists the layers in draw order and top first, the entities and the pictures', () => {
    const idx = sceneIndex(tree())
    expect(idx.layers.map((l) => l.id)).toEqual(['ground', 'roofs', 'under', 'trees'])
    expect(idx.layersTopFirst.map((l) => l.id)).toEqual(['trees', 'under', 'roofs', 'ground'])
    expect(idx.entities.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(idx.pictures.map((p) => p.id)).toEqual(['oak', 'left', 'right', 'pine'])
  })

  it('looks nodes and layers up by id', () => {
    const idx = sceneIndex(tree())
    expect(nodeOf(idx, 'oak')?.type).toBe('picture')
    expect(nodeOf(idx, null)).toBeUndefined()
    expect(layerOf(idx, 'roofs')?.id).toBe('roofs')
    expect(layerOf(idx, 'town')).toBeUndefined()
    expect(layerAbove(idx, 'left')?.id).toBe('trees')
    expect(layerAbove(idx, 'roofs')?.id).toBe('roofs')
    expect(layerAbove(idx, 'a')).toBeUndefined()
  })

  it('counts the ancestors for shown and locked', () => {
    const idx = sceneIndex(tree())
    expect(shown(idx, 'under')).toBe(false)
    expect(shown(idx, 'roofs')).toBe(true)
    expect(shown(idx, 'gone')).toBe(false)
    expect(lockedNode(idx, 'roofs')).toBe(true)
    expect(lockedNode(idx, 'ground')).toBe(false)
  })

  it('a picture is locked by its own lock or its layer, not by a locked picture group', () => {
    const nodes = tree()
    expect(pictureLocked(sceneIndex(nodes), 'left')).toBe(false)
    const lockedLayer = nodes.map((n) => (n.id === 'trees' ? { ...n, locked: true } : n)) as SceneNode[]
    expect(pictureLocked(sceneIndex(lockedLayer), 'left')).toBe(true)
    const inLockedGroup = [makeGroup('g', [makeImageLayer('i', [makePicture('p')])], { locked: true })]
    expect(pictureLocked(sceneIndex(inLockedGroup), 'p')).toBe(true)
  })
})

describe('visiblePictures', () => {
  it('the shown pictures of a layer, z first then tree order, cached per layer node', () => {
    const layer = tree()[5]
    expect(visiblePictures(layer).map((p) => p.id)).toEqual(['left', 'pine', 'oak'])
    expect(visiblePictures(layer)).toBe(visiblePictures(layer))
    expect(visiblePictures(makeLayer('t'))).toEqual([])
  })
})

describe('drawPlan', () => {
  it('runs of shown layers and shown entities, bottom to top, leaving out what is hidden', () => {
    const plan = drawPlan(sceneIndex(tree()))
    expect(plan.segments.map((s) => (s.kind === 'layers' ? s.layers.map((l) => l.id) : s.entities.map((e) => e.id)))).toEqual([['ground'], ['a', 'b'], ['roofs'], ['d'], ['trees']])
    expect(plan.entities.map((e) => e.id)).toEqual(['a', 'b', 'd'])
    expect(new Set(plan.segments.map((s) => s.key)).size).toBe(plan.segments.length)
  })

  it('is cached per tree', () => {
    const idx = sceneIndex(tree())
    expect(drawPlan(idx)).toBe(drawPlan(idx))
  })
})
