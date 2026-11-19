import { describe, it, expect } from 'vitest'
import type { EntityNode, SceneNode } from '../../../shared/sceneTree'
import { componentsOfEntity, engineEntityOf, entityNodeFrom, entityWithComponents, shapeGeometry } from '../../../shared/sceneEntity'
import { runDrawOrder, sceneLayers } from '../../../shared/sceneLayers'

const blank = (id = 'npc'): EntityNode => ({ id, type: 'entity', name: id, x: 16, y: 32, components: {}, children: [] }) as EntityNode

describe('componentsOfEntity / entityWithComponents', () => {
  it('puts node components into children and keeps Transform and Tag on the entity', () => {
    const node = entityWithComponents(blank(), {
      Transform: { x: 16, y: 32 },
      Sprite: { assetId: 'characters/elder', visible: false },
      Collider: { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true },
      Movement: { controller: 'wander', radius: 3 },
      Event: { states: [] },
      Tag: { tags: ['npc'] },
    })
    expect(node.components).toEqual({ Transform: { x: 16, y: 32 }, Tag: { tags: ['npc'] } })
    expect(node.children!.map((c) => c.type)).toEqual(['animatedSprite', 'body', 'wander', 'event'])
    const sprite = node.children![0]
    expect(sprite.visible).toBe(false)
    expect(sprite).toMatchObject({ id: 'npc:sprite', props: { assetId: 'characters/elder' } })
    expect((node.children![1] as { children: SceneNode[] }).children[0].type).toBe('collisionShape')
  })

  it('round-trips the bag in component order', () => {
    const bag = {
      Tag: { tags: [] },
      Event: { states: [{ id: 's' }] },
      Movement: { controller: 'player', speed: 2 },
      Collider: { width: 20, height: 12, offsetX: 0, offsetY: 0, isSolid: true },
      Sprite: { assetId: 'characters/player', visible: true },
      Transform: { x: 16, y: 32 },
    }
    const out = componentsOfEntity(entityWithComponents(blank(), bag))
    expect(Object.keys(out)).toEqual(['Transform', 'Sprite', 'Collider', 'Movement', 'Event', 'Tag'])
    expect(out).toEqual(bag)
  })

  it('a non-solid collider becomes an Area; with a body the area is the Area component', () => {
    const trigger = entityWithComponents(blank(), { Collider: { width: 64, height: 32, offsetX: 0, offsetY: 0, isSolid: false } })
    expect(trigger.children!.map((c) => c.type)).toEqual(['area'])
    expect(componentsOfEntity(trigger).Collider).toEqual({ width: 64, height: 32, offsetX: 0, offsetY: 0, isSolid: false })

    const both = entityWithComponents(blank(), {
      Collider: { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true },
      Area: { width: 96, height: 96, offsetX: 0, offsetY: 32 },
    })
    expect(both.children!.map((c) => c.type)).toEqual(['body', 'area'])
    expect(componentsOfEntity(both).Area).toEqual({ width: 96, height: 96, offsetX: 0, offsetY: 32 })
  })

  it('gives back the same node when nothing changed, and keeps unchanged children', () => {
    const node = entityWithComponents(blank(), { Transform: { x: 1, y: 2 }, Sprite: { assetId: 'a' }, Event: { states: [] } })
    expect(entityWithComponents(node, componentsOfEntity(node))).toBe(node)
    const moved = entityWithComponents(node, { ...componentsOfEntity(node), Sprite: { assetId: 'b' } })
    expect(moved).not.toBe(node)
    expect(moved.children![1]).toBe(node.children![1])
    expect(moved.children![0].id).toBe(node.children![0].id)
  })

  it('removes a child when its component goes, and renames a movement node that kept its type name', () => {
    const node = entityWithComponents(blank(), { Movement: { controller: 'wander' }, Event: { states: [] } })
    const still = entityWithComponents(node, { Movement: { controller: 'none' } })
    expect(still.children!.map((c) => c.type)).toEqual(['mover'])
    expect(still.children![0].id).toBe(node.children![0].id)
    expect(still.children![0].name).not.toBe(node.children![0].name)
  })

  it('picks child ids that are free in the tree', () => {
    const node = entityNodeFrom({ id: 'npc', name: 'Npc', x: 0, y: 0 }, { Event: { states: [] } }, (id) => id === 'npc:event')
    expect(node.children![0].id).toBe('npc:event2')
  })

  it('a polygon shape gives its bounding box and points', () => {
    const geometry = shapeGeometry({ id: 's', type: 'collisionShape', name: '', points: [{ x: -16, y: -32 }, { x: 16, y: -32 }, { x: 0, y: 0 }], closed: true })
    expect(geometry).toMatchObject({ width: 32, height: 32, offsetX: 0, offsetY: 0, shape: 'polygon', closed: true })
  })

  it('engineEntityOf drops node-only fields', () => {
    const node = { ...entityWithComponents(blank(), { Transform: { x: 0, y: 0 } }), locked: true, collapsed: true }
    const entity = engineEntityOf(node)
    expect(entity).not.toHaveProperty('children')
    expect(entity).not.toHaveProperty('type')
    expect(entity).not.toHaveProperty('locked')
    expect(entity.components.Transform).toEqual({ x: 0, y: 0 })
  })
})

describe('sceneLayers', () => {
  const pic = (id: string, z?: number): SceneNode => ({ id, type: 'picture', name: id, assetId: 'a', x: 0, y: 0, children: [], ...(z !== undefined ? { z } : {}) }) as SceneNode
  const tile = (id: string): SceneNode => ({ id, type: 'tile', name: id, children: [] }) as SceneNode
  const group = (id: string, children: SceneNode[], extra: Record<string, unknown> = {}): SceneNode => ({ id, type: 'group', name: id, children, ...extra }) as SceneNode

  it('makes one run per host of neighbouring sprites, split by layers', () => {
    const tree = [tile('ground'), group('g', [pic('a'), pic('b'), tile('mid'), pic('c'), group('inner', [pic('d')]), group('high', [pic('x')], { z: 3 }), pic('e')])]
    const layers = sceneLayers(tree)
    // `inner` only organises its sprite: it stays in g's run; `high` has a z of its own, so it is a run of its own.
    expect(layers.map((l) => l.key)).toEqual(['l:ground', 's:a', 'l:mid', 's:c', 's:x', 's:e'])
    expect(layers[3].kind === 'sprites' && layers[3].sprites.map((s) => s.node.id)).toEqual(['c', 'd'])
    const first = layers[1]
    expect(first.kind === 'sprites' && first.sprites.map((s) => s.node.id)).toEqual(['a', 'b'])
    expect(first.kind === 'sprites' && first.host?.id).toBe('g')
  })

  it('skips entities and everything below them, and hidden nodes with shownOnly', () => {
    const entity = { ...blank(), children: [pic('inside')] } as SceneNode
    const tree = [entity, group('g', [pic('a'), pic('hidden', undefined)]), tile('off')]
    ;(tree[1] as { children: SceneNode[] }).children[1].visible = false
    tree[2].visible = false
    expect(sceneLayers(tree).map((l) => l.key)).toEqual(['s:a', 'l:off'])
    const shown = sceneLayers(tree, { shownOnly: true })
    expect(shown.map((l) => l.key)).toEqual(['s:a'])
    expect(shown[0].kind === 'sprites' && shown[0].sprites).toHaveLength(1)
  })

  it('a Node holding only other nodes is like a folder; a YSort around one sprite counts as a sprite', () => {
    const ysort = (id: string, child: SceneNode): SceneNode => ({ id, type: 'ySort', name: id, children: [child] }) as SceneNode
    const folder = sceneLayers([group('f', [group('one', [pic('a')]), group('two', [pic('b')])])])
    expect(folder.map((l) => l.kind === 'sprites' && l.host?.id)).toEqual(['one', 'two'])
    const wrapped = sceneLayers([group('layer', [ysort('a:ysort', pic('a')), pic('b')])])
    expect(wrapped.map((l) => l.kind === 'sprites' && l.host?.id)).toEqual(['layer'])
  })

  it('draws a run by z, tree order for ties', () => {
    const [run] = sceneLayers([group('g', [pic('a', 2), pic('b'), pic('c', 2), pic('d', -1)])])
    expect(run.kind === 'sprites' && runDrawOrder(run).map((s) => s.node.id)).toEqual(['d', 'b', 'a', 'c'])
  })
})
