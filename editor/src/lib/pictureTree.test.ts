import { describe, expect, it } from 'vitest'
import { inFolder, pastedFolder, pictureFolderTree } from './pictureTree'

describe('pictureFolderTree', () => {
  it('builds folders from the ids, with counts that include subfolders', () => {
    const tree = pictureFolderTree(['top.png', 'images/a.png', 'images/city/b.png', 'images/city/c.png', 'props/d.png'])
    expect(tree.count).toBe(5)
    expect(tree.folders.map((f) => [f.path, f.count])).toEqual([['images', 3], ['props', 1]])
    expect(tree.folders[0].folders.map((f) => [f.path, f.name, f.count])).toEqual([['images/city', 'city', 2]])
  })

  it('inFolder takes the folder and everything below it', () => {
    expect(inFolder('images/city/b.png', 'images')).toBe(true)
    expect(inFolder('images2/b.png', 'images')).toBe(false)
    expect(inFolder('x.png', '')).toBe(true)
  })
})

describe('pastedFolder', () => {
  it('files pictures under pasted/<map name>, made safe for a folder name', () => {
    expect(pastedFolder('city')).toBe('pasted/city')
    expect(pastedFolder('Old Town (night)')).toBe('pasted/Old-Town-night')
    expect(pastedFolder('')).toBe('pasted/map')
  })
})
