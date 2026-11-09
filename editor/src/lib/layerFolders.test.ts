import { describe, expect, it } from 'vitest'
import type { Layer, LayerType } from '@/types/editor'
import { layersToCopy, moveInList, normalizeFolders, placeLayerCopies, setFolderFlag, setLayerFolder, visibleStack, withoutFolders } from './layerFolders'
import { ENTITIES_ID } from './layerOrder'

const L = (id: string, type: LayerType = 'tile', extra: Partial<Layer> = {}): Layer => ({ id, name: id, type, visible: true, locked: false, ...extra })
const ids = (layers: Layer[]) => layers.map((l) => l.id)

describe('layerFolders', () => {
  it('a layer dropped under a folder row joins it; above the row it stays outside', () => {
    const layers = [L('a'), L('F', 'folder'), L('b', 'tile', { folderId: 'F' }), L('c')]
    const into = moveInList(layers, 0, 'c', 'F', 'bottom')
    expect(ids(into.layers)).toEqual(['a', 'F', 'c', 'b'])
    expect(into.layers.find((l) => l.id === 'c')!.folderId).toBe('F')
    const outside = moveInList(layers, 0, 'c', 'F', 'top')
    expect(ids(outside.layers)).toEqual(['a', 'c', 'F', 'b'])
    expect(outside.layers.find((l) => l.id === 'c')!.folderId).toBeUndefined()
  })

  it('dropped onto a held layer it joins that layer\'s folder; onto a loose layer it leaves its folder', () => {
    const layers = [L('F', 'folder'), L('a', 'tile', { folderId: 'F' }), L('b', 'tile', { folderId: 'F' }), L('c')]
    expect(moveInList(layers, 0, 'c', 'a', 'top').layers.find((l) => l.id === 'c')!.folderId).toBe('F')
    const left = moveInList(layers, 0, 'a', 'c', 'bottom')
    expect(left.layers.find((l) => l.id === 'a')!.folderId).toBeUndefined()
    expect(ids(left.layers)).toEqual(['F', 'b', 'c', 'a'])
  })

  it('only tile and image layers can be held', () => {
    const layers = [L('F', 'folder'), L('col', 'collision'), L('img', 'image')]
    const no = moveInList(layers, 0, 'col', 'F', 'bottom')
    expect(no.layers.find((l) => l.id === 'col')!.folderId).toBeUndefined()
    expect(moveInList(layers, 0, 'img', 'F', 'bottom').layers.find((l) => l.id === 'img')!.folderId).toBe('F')
    expect(setLayerFolder(layers, 0, 'col', 'F').layers).toBe(layers)
    expect(normalizeFolders([L('F', 'folder'), L('o', 'objects', { folderId: 'F' })], 0).layers[1].folderId).toBeUndefined()
  })

  it('moving a folder carries the layers it holds', () => {
    const layers = [L('a'), L('F', 'folder'), L('x', 'tile', { folderId: 'F' }), L('y', 'image', { folderId: 'F' }), L('b')]
    expect(ids(moveInList(layers, 0, 'F', 'a', 'top').layers)).toEqual(['F', 'x', 'y', 'a', 'b'])
    expect(ids(moveInList(layers, 0, 'F', 'b', 'bottom').layers)).toEqual(['a', 'b', 'F', 'x', 'y'])
  })

  it('the Entities row never ends up inside a folder', () => {
    const layers = [L('F', 'folder'), L('x', 'tile', { folderId: 'F' }), L('y', 'tile', { folderId: 'F' }), L('z')]
    const r = moveInList(layers, 4, ENTITIES_ID, 'x', 'bottom')
    // 2 layers (F, x) above the row would be inside the folder: it sits below the whole folder instead
    expect(r.entitiesIndex).toBe(3)
    expect(ids(r.layers)).toEqual(['F', 'x', 'y', 'z'])
  })

  it('take out / put in from the menu, and a vanished folder frees its layers', () => {
    const layers = [L('F', 'folder'), L('x', 'tile', { folderId: 'F' }), L('y', 'tile', { folderId: 'F' })]
    const out = setLayerFolder(layers, 0, 'x', null)
    expect(ids(out.layers)).toEqual(['F', 'y', 'x'])
    expect(out.layers[2].folderId).toBeUndefined()
    const back = setLayerFolder(out.layers, 0, 'x', 'F')
    expect(back.layers.find((l) => l.id === 'x')!.folderId).toBe('F')
    expect(normalizeFolders([L('x', 'tile', { folderId: 'gone' })], 0).layers[0].folderId).toBeUndefined()
  })

  it('closed folders hide their layers from the list only', () => {
    const layers = [L('F', 'folder', { collapsed: true }), L('x', 'tile', { folderId: 'F' }), L('z')]
    expect(visibleStack(layers, 3)).toEqual(['F', 'z', ENTITIES_ID])
    expect(ids(withoutFolders(layers))).toEqual(['x', 'z'])
  })

  it('a folder\'s eye and lock are set on the layers it holds', () => {
    const layers = [L('F', 'folder'), L('x', 'tile', { folderId: 'F' }), L('z')]
    const next = setFolderFlag(layers, 'F', 'visible', false)
    expect(next.map((l) => l.visible)).toEqual([false, false, true])
  })
})

describe('copying and pasting layers', () => {
  const counter = () => {
    let n = 0
    return () => `new${++n}`
  }
  const list = () => [L('a'), L('F', 'folder'), L('b', 'tile', { folderId: 'F' }), L('c', 'image', { folderId: 'F', images: [{ id: 'p', x: 0, y: 0, z: 0 }] }), L('d'), L('col', 'collision')]

  it('copying a folder takes the layers it holds; gameplay layers are left out', () => {
    expect(ids(layersToCopy(list(), ['F', 'col']))).toEqual(['F', 'b', 'c'])
    expect(ids(layersToCopy(list(), ['d', 'b']))).toEqual(['b', 'd'])
  })

  it('a layer pasted next to a layer of a folder goes right below it, in that folder', () => {
    const layers = list()
    const r = placeLayerCopies(layers, [layers[2]], 'b', counter())
    expect(ids(r.layers)).toEqual(['a', 'F', 'b', 'new1', 'c', 'd', 'col'])
    expect(r.layers[3]).toMatchObject({ name: 'b Copy', folderId: 'F' })
    expect(r).toMatchObject({ at: 3, count: 1, lastId: 'new1' })
  })

  it('a layer pasted next to a loose layer stays loose; pasted on a folder row it goes in at the top', () => {
    const layers = list()
    const loose = placeLayerCopies(layers, [layers[2]], 'a', counter())
    expect(ids(loose.layers)).toEqual(['a', 'new1', 'F', 'b', 'c', 'd', 'col'])
    expect(loose.layers[1].folderId).toBeUndefined()
    const inside = placeLayerCopies(layers, [layers[0]], 'F', counter())
    expect(ids(inside.layers)).toEqual(['a', 'F', 'new1', 'b', 'c', 'd', 'col'])
    expect(inside.layers[2].folderId).toBe('F')
  })

  it('a folder is pasted with copies of its layers, below the whole folder it was pasted on', () => {
    const layers = list()
    const r = placeLayerCopies(layers, layersToCopy(layers, ['F']), 'b', counter())
    expect(ids(r.layers)).toEqual(['a', 'F', 'b', 'c', 'new1', 'new2', 'new3', 'd', 'col'])
    expect(r.layers[4]).toMatchObject({ type: 'folder', name: 'F Copy' })
    expect(r.layers[4].folderId).toBeUndefined()
    expect(r.layers[5].folderId).toBe('new1')
    expect(r.layers[6].folderId).toBe('new1')
    // pictures get their own ids
    expect(r.layers[6].images![0].id).not.toBe('p')
    expect(normalizeFolders(r.layers, 0).layers).toBe(r.layers)
  })

  it('names do not clash, and without a target the copies go to the bottom', () => {
    const layers = [L('a'), L('a Copy')]
    const r = placeLayerCopies(layers, [layers[0]], null, counter())
    expect(r.layers.map((l) => l.name)).toEqual(['a', 'a Copy', 'a Copy 2'])
  })
})
