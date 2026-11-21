/* eslint-disable @typescript-eslint/no-explicit-any -- loose node fixtures */
import { describe, expect, it } from 'vitest'
import { engineEntityOf } from '../../../shared/sceneEntity'
import { nodeAnchor, promoteNodes, rotateSubtree, translateSubtree, type SceneNode } from '../../../shared/sceneTree'

const pic = (id: string, x: number, y: number, extra: Record<string, unknown> = {}): SceneNode => ({ id, type: 'picture', name: id, x, y, children: [], ...extra }) as any

describe('one kind of Node', () => {
  it('a plain Node that gets a component node becomes an entity, keeping its anchor and rotation; the same tree otherwise', () => {
    const plain = [{ id: 'g', type: 'group', name: 'G', children: [pic('p', 0, 0)] }] as SceneNode[]
    expect(promoteNodes(plain)).toBe(plain)
    const withEvent = [{ id: 'g', type: 'group', name: 'G', x: 16, y: 32, rotation: 45, children: [{ id: 'e', type: 'event', name: 'Event', props: {} }] }] as SceneNode[]
    const [out] = promoteNodes(withEvent) as any[]
    // It gets a Transform at its anchor (what the game places it by); 16, 32 is a tile anchor.
    expect(out).toMatchObject({ id: 'g', type: 'entity', x: 16, y: 32, rotation: 45, components: { Transform: { x: 16, y: 32, depth: 20 } } })
    const offGrid = promoteNodes([{ ...withEvent[0], x: 50, y: 70 } as SceneNode]) as any[]
    expect(offGrid[0].components.Transform).toEqual({ x: 50, y: 70, depth: 20, free: true })
    expect(out.children[0].type).toBe('event')
    expect(promoteNodes(promoteNodes(withEvent))).toEqual(promoteNodes(withEvent))
  })

  it("an entity without a stored Transform (made before promotion gave it one) exports at its anchor", () => {
    const old = { id: 'e', type: 'entity', name: 'E', x: 790, y: 639, components: {}, children: [{ id: 'ev', type: 'event', name: 'Event', props: {} }] } as any
    expect(engineEntityOf(old).components.Transform).toEqual({ x: 790, y: 639, depth: 20, free: true })
    const kept = { ...old, components: { Transform: { x: 790, y: 639, depth: 3, free: true } } }
    expect(engineEntityOf(kept).components.Transform).toMatchObject({ depth: 3 })
  })

  it('every Node, entity and sprite has an anchor; a Node without a position is at the origin', () => {
    expect(nodeAnchor({ id: 'g', type: 'group', name: 'G', children: [] } as any)).toEqual({ x: 0, y: 0 })
    expect(nodeAnchor(pic('p', 3, 4))).toEqual({ x: 3, y: 4 })
    expect(nodeAnchor({ id: 't', type: 'tile', name: 'T', children: [] } as any)).toBeNull()
  })

  it('moving a node carries its sprites, Nodes and the map shapes below it; painted layers and an entity\'s own shapes stay', () => {
    const shapeIn = (body: string) => ({ id: `${body}:s`, type: 'collisionShape', name: '', closed: true, points: [{ x: 1, y: 1 }], box: { width: 32, height: 32, offsetX: 0, offsetY: 0 } })
    const tree: SceneNode = {
      id: 'g', type: 'group', name: 'G', x: 0, y: 0,
      children: [
        pic('p', 10, 10),
        { id: 't', type: 'tile', name: 'T', children: [], data: { 0: { tilesetId: 'a', x: 0, y: 0 } } },
        { id: 'c', type: 'collision', name: 'C', data: {}, children: [{ id: 'cs', type: 'collisionShape', name: '', closed: true, points: [{ x: 5, y: 5 }] }] },
        { id: 'e', type: 'entity', name: 'E', x: 20, y: 20, components: {}, children: [{ id: 'b', type: 'body', name: 'B', children: [shapeIn('b')] }] },
      ],
    } as any
    const moved = translateSubtree(tree, 5, -5) as any
    expect(moved).toMatchObject({ x: 5, y: -5 })
    expect(moved.children[0]).toMatchObject({ x: 15, y: 5 })
    expect(moved.children[1]).toBe(tree.type === 'group' && (tree as any).children[1])
    expect(moved.children[2].children[0].points).toEqual([{ x: 10, y: 0 }])
    expect(moved.children[3]).toMatchObject({ x: 25, y: 15 })
    expect(moved.children[3].children[0].children[0].points).toEqual([{ x: 1, y: 1 }]) // relative to the entity
    expect(translateSubtree(tree, 0, 0)).toBe(tree)
  })

  it('turning a node turns the anchors below it around its anchor and adds to their rotations, kept within ±180', () => {
    const tree = { id: 'g', type: 'group', name: 'G', x: 0, y: 0, rotation: 170, children: [pic('p', 32, 0, { rotation: 10 })] } as any
    const turned = rotateSubtree(tree, 90) as any
    expect(turned.rotation).toBe(-100)
    expect(turned.children[0]).toMatchObject({ x: 0, y: 32, rotation: 100 })
    const back = rotateSubtree(rotateSubtree({ ...tree, rotation: undefined }, 90), -90) as any
    expect(back).not.toHaveProperty('rotation')
    expect(back.children[0]).toMatchObject({ x: 32, y: 0, rotation: 10 })
    expect(rotateSubtree(tree, 0)).toBe(tree)
  })
})
