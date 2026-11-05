import { describe, expect, it } from 'vitest'
import type { ImageItem } from '@/types/editor'
import { pasteImageItems, pruneSelection, selectImages } from './imageSelection'
import { imagePickName } from './graphicAssets'

const rows = ['a', 'b', 'c', 'd', 'e']
const none = { ids: [], primary: null }

describe('selectImages', () => {
  it('a plain click picks only that one', () => {
    expect(selectImages({ ids: ['a', 'b'], primary: 'b' }, rows, 'd', 'replace')).toEqual({ ids: ['d'], primary: 'd' })
  })

  it('Ctrl/Cmd toggles, keeping list order, and the clicked one becomes the primary', () => {
    const one = selectImages(none, rows, 'c', 'toggle')
    const two = selectImages(one, rows, 'a', 'toggle')
    expect(two).toEqual({ ids: ['a', 'c'], primary: 'a' })
    expect(selectImages(two, rows, 'a', 'toggle')).toEqual({ ids: ['c'], primary: 'c' })
  })

  it('Shift picks the range from the last click, either direction, keeping the primary', () => {
    expect(selectImages({ ids: ['b'], primary: 'b' }, rows, 'd', 'range')).toEqual({ ids: ['b', 'c', 'd'], primary: 'b' })
    expect(selectImages({ ids: ['d'], primary: 'd' }, rows, 'b', 'range')).toEqual({ ids: ['b', 'c', 'd'], primary: 'd' })
    expect(selectImages(none, rows, 'c', 'range')).toEqual({ ids: ['c'], primary: 'c' })
  })

  it('an id that is not in the list changes nothing', () => {
    const sel = { ids: ['a'], primary: 'a' }
    expect(selectImages(sel, rows, 'zzz', 'toggle')).toBe(sel)
  })
})

describe('pruneSelection', () => {
  it('drops ids that are gone and fixes the primary', () => {
    expect(pruneSelection({ ids: ['a', 'x', 'c'], primary: 'x' }, rows)).toEqual({ ids: ['a', 'c'], primary: 'c' })
    const same = { ids: ['a'], primary: 'a' }
    expect(pruneSelection(same, rows)).toBe(same)
  })
})

describe('pasteImageItems', () => {
  const item = (id: string, x: number, y: number, name?: string): ImageItem => ({ id, graphicId: 'images/city/dam-wall.png', x, y, name, crop: { x: 0, y: 0, w: 4, h: 4 } })

  it('gives new ids, free names, and a copied crop', () => {
    const src = [item('1', 10, 20)]
    const [copy] = pasteImageItems(src, src, null)
    expect(copy.id).not.toBe('1')
    expect(copy.name).toBe('dam-wall 2')
    expect(copy.crop).toEqual({ x: 0, y: 0, w: 4, h: 4 })
    expect(copy.crop).not.toBe(src[0].crop)
  })

  it('without a cursor the copies move one tile down-right; with one, the first lands on it and the rest keep their spacing', () => {
    const src = [item('1', 100, 100), item('2', 140, 90)]
    expect(pasteImageItems(src, [], null).map(i => [i.x, i.y])).toEqual([[132, 132], [172, 122]])
    expect(pasteImageItems(src, [], { x: 0, y: 0 }).map(i => [i.x, i.y])).toEqual([[0, 0], [40, -10]])
  })

  it('names stay unique inside one paste', () => {
    const src = [item('1', 0, 0), item('2', 0, 0)]
    expect(pasteImageItems(src, [], null).map(i => i.name)).toEqual(['dam-wall', 'dam-wall 2'])
  })
})

describe('imagePickName', () => {
  it('is the picture name without folders or extension', () => {
    expect(imagePickName({ graphicId: 'images/city/dam/dam-wall.png' })).toBe('dam-wall')
    expect(imagePickName({ assetId: 'objects/chest' })).toBe('chest')
  })
})
