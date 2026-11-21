/* eslint-disable @typescript-eslint/no-explicit-any -- loose node fixtures */
import { describe, expect, it } from 'vitest'
import { builtInPrefabs, cleanPrefabsFile, placePrefab, prefabFromNode, prefabId } from '../../../shared/prefabs'
import { componentsOfEntity } from '../../../shared/sceneEntity'
import { walk, type SceneNode } from '../../../shared/sceneTree'

const ids = () => {
  let n = 0
  return () => `id${++n}`
}

describe('prefabs', () => {
  it('turns the built-in prefabs into node trees with their anchor at the origin', () => {
    const list = builtInPrefabs()
    const npc = list.find((p) => p.id === 'npc')!
    expect(npc.node).toMatchObject({ type: 'entity', x: 0, y: 0 })
    expect(componentsOfEntity(npc.node as any).Sprite).toBeDefined()
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length)
  })

  it('cleans a file read from disk: unusable and repeated entries are left out', () => {
    const node = { id: 'n', type: 'group', name: 'N', children: [] }
    const clean = cleanPrefabsFile({ prefabs: [{ id: 'a', name: 'A', node }, { id: 'a', name: 'again', node }, { id: 'b', node }, { name: 'no id', node }, { id: 'c', name: 'C' }, 7] })
    expect(clean.prefabs.map((p) => [p.id, p.name])).toEqual([
      ['a', 'A'],
      ['b', 'b'],
    ])
    expect(cleanPrefabsFile(null)).toEqual({ prefabs: [] })
  })

  it('makes ids from names, free among the taken ones', () => {
    expect(prefabId('Big Tree!', [])).toBe('big-tree')
    expect(prefabId('Big Tree', ['big-tree', 'big-tree-2'])).toBe('big-tree-3')
    expect(prefabId('???', [])).toBe('prefab')
  })

  it('saves a tree moved to the origin without its lock, open state or prefab link, and places it back anywhere with new ids', () => {
    const tree: SceneNode = {
      id: 'house', type: 'group', name: 'House', x: 100, y: 200, locked: true, collapsed: true, prefab: 'old',
      children: [{ id: 'door', type: 'picture', name: 'Door', x: 110, y: 200, children: [] }],
    } as any
    const prefab = prefabFromNode(tree, 'house', 'House')
    expect(prefab.node).toMatchObject({ x: 0, y: 0, name: 'House' })
    expect(prefab.node).not.toHaveProperty('locked')
    expect(prefab.node).not.toHaveProperty('collapsed')
    expect(prefab.node).not.toHaveProperty('prefab')
    expect((prefab.node as any).children[0]).toMatchObject({ x: 10, y: 0 })

    const placed = placePrefab(prefab, 32, 64, ids()) as any
    expect(placed).toMatchObject({ type: 'group', x: 32, y: 64, prefab: 'house', name: 'House' })
    expect(placed.children[0]).toMatchObject({ x: 42, y: 64 })
    expect(walk([placed]).map((e) => e.node.id)).toEqual(['id1', 'id2'])
  })
})
