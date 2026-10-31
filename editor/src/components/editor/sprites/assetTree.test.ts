import { describe, expect, it } from 'vitest'
import { assetIdsIn, buildAssetTree, countAssets, findFolder, isInside, joinId, leafOf, parentFolderOf } from './assetTree'
import { characterMeta, makeAsset, objectMeta } from '@/test/editorContext'

const hero = makeAsset('characters/npcs/hero', characterMeta())
const chest = makeAsset('objects/chest', objectMeta())
const flame = makeAsset('objects/flame', objectMeta({ name: 'Flame' }))
const loose = makeAsset('loose', objectMeta({ name: 'Loose' }))

describe('asset id paths', () => {
  it('splits and joins', () => {
    expect(parentFolderOf('a/b/c')).toBe('a/b')
    expect(parentFolderOf('a')).toBe('')
    expect(leafOf('a/b/c')).toBe('c')
    expect(leafOf('a')).toBe('a')
    expect(joinId('', 'x')).toBe('x')
    expect(joinId('a/b', 'x')).toBe('a/b/x')
    expect(isInside('a/b', 'a')).toBe(true)
    expect(isInside('a', 'a')).toBe(true)
    expect(isInside('ab', 'a')).toBe(false)
  })
})

describe('buildAssetTree', () => {
  it('nests assets under their folders, with listed empty folders and implicit parents', () => {
    const tree = buildAssetTree([hero, chest, flame, loose], ['empty', 'objects'])
    expect(tree.folders.map((f) => f.id)).toEqual(['characters', 'empty', 'objects'])
    expect(tree.assets.map((a) => a.id)).toEqual(['loose'])
    const npcs = findFolder(tree, 'characters/npcs')!
    expect(npcs.assets.map((a) => a.id)).toEqual(['characters/npcs/hero'])
    expect(findFolder(tree, 'characters')!.folders.map((f) => f.id)).toEqual(['characters/npcs'])
    expect(findFolder(tree, 'empty')!.assets).toEqual([])
    expect(findFolder(tree, 'nope')).toBeNull()
  })

  it('counts and lists assets below a folder', () => {
    const tree = buildAssetTree([hero, chest, flame], [])
    expect(countAssets(tree)).toBe(3)
    expect(countAssets(findFolder(tree, 'objects')!)).toBe(2)
    expect(assetIdsIn(findFolder(tree, 'characters')!)).toEqual(['characters/npcs/hero'])
  })

  it('filters by id or name and drops folders without a match (the root stays)', () => {
    const tree = buildAssetTree([hero, chest, flame], ['empty'], 'fla')
    expect(tree.folders.map((f) => f.id)).toEqual(['objects'])
    expect(tree.folders[0].assets.map((a) => a.id)).toEqual(['objects/flame'])
    const none = buildAssetTree([hero], ['x'], 'zzz')
    expect(none.folders).toEqual([])
    expect(none.id).toBe('')
  })
})
