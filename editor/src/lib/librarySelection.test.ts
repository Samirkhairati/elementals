import { describe, expect, it } from 'vitest'
import { buildLibraryTree } from './libraryTree'
import { describeSelection, existingOnly, hasRow, rowRange, selectionOf, selectionSize, toggleRow, topLevelOnly, visibleRows } from './librarySelection'

const item = (key: string) => ({ key, name: key.split('/').pop() as string, folder: key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '' })
const tree = buildLibraryTree([item('a.png'), item('b.png'), item('trees/oak.png'), item('trees/pine.png'), item('trees/dead/stump.png')], ['empty'])

describe('visibleRows', () => {
  it('lists folders before items, depth first', () => {
    expect(visibleRows(tree, () => true).map((r) => r.key)).toEqual(['empty', 'trees', 'trees/dead', 'trees/dead/stump.png', 'trees/oak.png', 'trees/pine.png', 'a.png', 'b.png'])
  })
  it('hides what is inside a closed folder', () => {
    expect(visibleRows(tree, (f) => f !== 'trees').map((r) => r.key)).toEqual(['empty', 'trees', 'a.png', 'b.png'])
  })
})

describe('rowRange', () => {
  const rows = visibleRows(tree, () => true)
  it('covers both ends in either direction', () => {
    const forward = rowRange(rows, { kind: 'folder', key: 'trees' }, { kind: 'item', key: 'trees/oak.png' }).map((r) => r.key)
    const back = rowRange(rows, { kind: 'item', key: 'trees/oak.png' }, { kind: 'folder', key: 'trees' }).map((r) => r.key)
    expect(forward).toEqual(['trees', 'trees/dead', 'trees/dead/stump.png', 'trees/oak.png'])
    expect(back).toEqual(forward)
  })
  it('is just the clicked row without an anchor, and nothing for an unknown row', () => {
    expect(rowRange(rows, null, { kind: 'item', key: 'b.png' })).toEqual([{ kind: 'item', key: 'b.png' }])
    expect(rowRange(rows, null, { kind: 'item', key: 'gone.png' })).toEqual([])
  })
})

describe('toggleRow / selectionOf', () => {
  it('adds, then removes, keeping items and folders apart', () => {
    let s = selectionOf([])
    s = toggleRow(s, { kind: 'item', key: 'a.png' })
    s = toggleRow(s, { kind: 'folder', key: 'trees' })
    expect(s).toEqual({ items: ['a.png'], folders: ['trees'] })
    expect(hasRow(s, { kind: 'folder', key: 'trees' })).toBe(true)
    s = toggleRow(s, { kind: 'item', key: 'a.png' })
    expect(selectionSize(s)).toBe(1)
  })
})

describe('topLevelOnly', () => {
  const folderOf = (k: string) => (k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : '')
  it('drops what a picked folder already carries', () => {
    const s = topLevelOnly({ items: ['a.png', 'trees/oak.png', 'trees/dead/stump.png'], folders: ['trees', 'trees/dead', 'empty'] }, folderOf)
    expect(s).toEqual({ items: ['a.png'], folders: ['trees', 'empty'] })
  })
  it('does not treat a folder with a similar name as a parent', () => {
    expect(topLevelOnly({ items: [], folders: ['tree', 'trees'] }, folderOf).folders).toEqual(['tree', 'trees'])
  })
})

describe('existingOnly / describeSelection', () => {
  it('forgets what is gone', () => {
    expect(existingOnly({ items: ['a.png', 'x.png'], folders: ['trees', 'old'] }, new Set(['a.png']), new Set(['trees']))).toEqual({ items: ['a.png'], folders: ['trees'] })
  })
  it('words the count', () => {
    expect(describeSelection({ items: ['a'], folders: [] }, 'picture')).toBe('1 picture')
    expect(describeSelection({ items: ['a', 'b'], folders: ['f'] }, 'tileset')).toBe('2 tilesets and 1 folder')
  })
})
