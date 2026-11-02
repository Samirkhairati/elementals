import { describe, expect, it } from 'vitest'
import { buildLibraryTree, itemsIn, matchesQuery, type LibraryItem } from './libraryTree'

const item = (key: string, name = key.split('/').pop()!, folder = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : ''): LibraryItem => ({ key, name, folder })
const items = [item('b/walk.png'), item('a/x/rock.png'), item('top.png'), item('b/Idle.png')]

describe('buildLibraryTree', () => {
  it('nests folders, sorts them and their items, and keeps empty folders', () => {
    const tree = buildLibraryTree(items, ['b', 'a', 'a/x', 'empty'])
    expect(tree.folders.map((f) => f.path)).toEqual(['a', 'b', 'empty'])
    expect(tree.folders[0].folders.map((f) => f.path)).toEqual(['a/x'])
    expect(tree.folders[1].items.map((i) => i.name)).toEqual(['Idle.png', 'walk.png'])
    expect(tree.items.map((i) => i.key)).toEqual(['top.png'])
    expect(tree.folders[2].items).toEqual([])
  })
  it('creates folders implied by items even when the disk list misses them', () => {
    expect(buildLibraryTree([item('p/q/r.png')], []).folders[0].folders[0].path).toBe('p/q')
  })
  it('a search keeps matching items and the way to them, and hides empty folders', () => {
    const tree = buildLibraryTree(items, ['empty'], 'rock')
    expect(tree.folders.map((f) => f.path)).toEqual(['a'])
    expect(itemsIn(tree).map((i) => i.key)).toEqual(['a/x/rock.png'])
  })
  it('matches on the name or the key, ignoring case', () => {
    expect(matchesQuery(item('a/Rock.png'), 'ROCK')).toBe(true)
    expect(matchesQuery({ key: 'grass.png', name: 'Meadow', folder: '' }, 'grass')).toBe(true)
    expect(matchesQuery(item('a.png'), 'zzz')).toBe(false)
    expect(matchesQuery(item('a.png'), '  ')).toBe(true)
  })
})
