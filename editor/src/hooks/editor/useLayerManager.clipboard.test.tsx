import { StrictMode, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ImageItem, Layer, MapData } from '@/types/editor'
import { makeLayer, makeMap } from '@/test/helpers'
import { useEditorClipboard } from '@/store/editorClipboard'
import { useLayerManager } from './useLayerManager'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

function setup(initialLayers: Layer[]) {
  const onCommitHistory = vi.fn()
  const hook = renderHook(
    () => {
      const [, setActiveMap] = useState<MapData | null>(makeMap({ layers: initialLayers }))
      return useLayerManager({ setActiveMap, onCommitHistory })
    },
    { wrapper }
  )
  act(() => {
    hook.result.current.setLayers(initialLayers)
    hook.result.current.setActiveLayerId(initialLayers[0]?.id ?? null)
  })
  return { ...hook, onCommitHistory }
}

const img = (id: string, x: number, name?: string): ImageItem => ({ id, graphicId: 'images/city/dam-wall.png', x, y: 64, name })
const imageLayer = (images: ImageItem[], id = 'I1') => makeLayer(id, { type: 'image', name: 'Images', images })

afterEach(() => useEditorClipboard.getState().set(null))

describe('picking several pictures', () => {
  it('Ctrl/Cmd toggles pictures into the picked set and Shift picks a range (front first)', () => {
    const { result } = setup([imageLayer([img('a', 0), img('b', 10), img('c', 20), img('d', 30)])])
    act(() => result.current.selectImage('I1', 'a', 'replace'))
    expect(result.current.pickedImageIds).toEqual(['a'])
    act(() => result.current.selectImage('I1', 'c', 'toggle'))
    expect(result.current.pickedImageIds.sort()).toEqual(['a', 'c'])
    expect(result.current.selectedImageId).toBe('c')
    act(() => result.current.selectImage('I1', 'a', 'toggle'))
    expect(result.current.pickedImageIds).toEqual(['c'])
    act(() => result.current.selectImage('I1', 'a', 'range'))
    // front first: d c b a, so from c to a is c b a
    expect(result.current.pickedImageIds.sort()).toEqual(['a', 'b', 'c'])
  })

  it('setSelectedImageId drops the rest of the picked set', () => {
    const { result } = setup([imageLayer([img('a', 0), img('b', 10)])])
    act(() => result.current.selectImage('I1', 'a', 'replace'))
    act(() => result.current.selectImage('I1', 'b', 'toggle'))
    act(() => result.current.setSelectedImageId(null))
    expect(result.current.pickedImageIds).toEqual([])
  })
})

describe('several pictures at once', () => {
  it('deleteImages removes them all in one history step', () => {
    const { result, onCommitHistory } = setup([imageLayer([img('a', 0), img('b', 10), img('c', 20)])])
    onCommitHistory.mockClear()
    act(() => result.current.deleteImages('I1', ['a', 'c']))
    expect(result.current.layers[0].images!.map(i => i.id)).toEqual(['b'])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(result.current.pickedImageIds).toEqual([])
  })

  it('duplicateImages copies them with new ids and unique names in one step, and picks the copies', () => {
    const { result, onCommitHistory } = setup([imageLayer([img('a', 0), img('b', 10, 'Wall')])])
    onCommitHistory.mockClear()
    act(() => result.current.duplicateImages('I1', ['a', 'b']))
    const images = result.current.layers[0].images!
    expect(images).toHaveLength(4)
    expect(images.slice(2).map(i => i.name).sort()).toEqual(['Wall 2', 'dam-wall 2'])
    expect(new Set(images.map(i => i.id)).size).toBe(4)
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(result.current.pickedImageIds).toHaveLength(2)
  })

  it('copy then paste puts copies in the layer, also in another image layer', () => {
    const { result } = setup([imageLayer([img('a', 100)], 'I1'), imageLayer([], 'I2')])
    act(() => result.current.copyImages('I1', ['a']))
    expect(useEditorClipboard.getState().content?.kind).toBe('images')
    act(() => result.current.pasteImages('I2', { x: 5, y: 6 }))
    const pasted = result.current.layers.find(l => l.id === 'I2')!.images!
    expect(pasted).toHaveLength(1)
    expect(pasted[0]).toMatchObject({ graphicId: 'images/city/dam-wall.png', x: 5, y: 6, name: 'dam-wall' })
    expect(pasted[0].id).not.toBe('a')
  })

  it('does not paste into a locked layer or paste other kinds of content', () => {
    const locked = makeLayer('I2', { type: 'image', name: 'Images', images: [], locked: true })
    const { result } = setup([imageLayer([img('a', 0)], 'I1'), locked])
    act(() => result.current.copyImages('I1', ['a']))
    act(() => result.current.pasteImages('I2', null))
    expect(result.current.layers.find(l => l.id === 'I2')!.images).toEqual([])
    act(() => useEditorClipboard.getState().set({ kind: 'entities', entities: [] }))
    act(() => result.current.pasteImages('I1', null))
    expect(result.current.layers.find(l => l.id === 'I1')!.images).toHaveLength(1)
  })
})

describe('several layers at once', () => {
  const layers = () => [makeLayer('A', { name: 'A' }), makeLayer('B', { name: 'B' }), makeLayer('C', { name: 'C' }), makeLayer('F', { type: 'folder', name: 'F' })]

  it('Shift+click picks every layer from the active one to the clicked one, skipping folders', () => {
    const { result } = setup(layers())
    act(() => result.current.selectLayer('C', 'range'))
    expect(result.current.selectedLayerIds.sort()).toEqual(['A', 'B', 'C'])
    expect(result.current.activeLayerId).toBe('C')
  })

  it('deleteLayers removes several in one history step and drops them from the selection', () => {
    const { result, onCommitHistory } = setup(layers())
    act(() => result.current.selectLayer('C', 'range'))
    onCommitHistory.mockClear()
    act(() => result.current.handleDeleteLayers(['A', 'C']))
    expect(result.current.layers.map(l => l.id)).toEqual(['B', 'F'])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(result.current.selectedLayerIds).toEqual(['B'])
  })

  it('duplicateLayers copies tile layers above the highest one, with new ids and unique names', () => {
    const { result } = setup(layers())
    act(() => result.current.duplicateLayers(['A', 'B', 'F']))
    expect(result.current.layers.map(l => l.name)).toEqual(['A', 'B', 'A Copy', 'B Copy', 'C', 'F'])
    expect(new Set(result.current.layers.map(l => l.id)).size).toBe(6)
  })

  it('copyLayers + pasteLayers paste above the given layer, again with free names; folders are not copyable', () => {
    const { result } = setup(layers())
    act(() => result.current.copyLayers(['B', 'F']))
    act(() => result.current.pasteLayers('C'))
    expect(result.current.layers.map(l => l.name)).toEqual(['A', 'B', 'C', 'B Copy', 'F'])
    act(() => result.current.pasteLayers('C'))
    expect(result.current.layers.map(l => l.name)).toContain('B Copy 2')
  })
})

describe('place multiple', () => {
  it('turns a picture into the placement preview with its crop, scale, flips and opacity, and drops what is unset', () => {
    const item: ImageItem = { id: 'a', graphicId: 'images/city/dam-wall.png', x: 5, y: 6, name: 'Wall', crop: { x: 1, y: 2, w: 3, h: 4 }, scale: 2, flipX: true, opacity: 0.5 }
    const { result } = setup([imageLayer([item, img('b', 0)])])
    act(() => result.current.placeMultiple('I1', 'a'))
    expect(result.current.pendingImage).toEqual({ graphicId: 'images/city/dam-wall.png', crop: { x: 1, y: 2, w: 3, h: 4 }, scale: 2, flipX: true, opacity: 0.5 })
    expect(result.current.pendingImage?.crop).not.toBe(item.crop)
    act(() => result.current.placeMultiple('I1', 'b'))
    expect(result.current.pendingImage).toEqual({ graphicId: 'images/city/dam-wall.png' })
  })

  it('does nothing for a picture that is not there', () => {
    const { result } = setup([imageLayer([img('a', 0)])])
    act(() => result.current.placeMultiple('I1', 'zzz'))
    expect(result.current.pendingImage).toBeNull()
  })
})

describe('groups of pictures', () => {
  const four = () => imageLayer([img('a', 0), img('b', 10), img('c', 20), img('d', 30)])
  const layerOf = (r: { current: ReturnType<typeof useLayerManager> }, id = 'I1') => r.current.layers.find(l => l.id === id)!
  const groupedFirstTwo = () => {
    const hook = setup([four()])
    act(() => hook.result.current.selectImage('I1', 'a', 'replace'))
    act(() => hook.result.current.selectImage('I1', 'b', 'toggle'))
    act(() => hook.result.current.groupPickedImages('I1'))
    return hook
  }

  it('groups the picked pictures in one history step, selects the group row, and needs at least two', () => {
    const { result, onCommitHistory } = setup([four()])
    act(() => result.current.selectImage('I1', 'a', 'replace'))
    onCommitHistory.mockClear()
    act(() => result.current.groupPickedImages('I1'))
    expect(layerOf(result).groups).toBeUndefined()
    expect(onCommitHistory).not.toHaveBeenCalled()
    act(() => result.current.selectImage('I1', 'b', 'toggle'))
    act(() => result.current.groupPickedImages('I1'))
    const layer = layerOf(result)
    expect(layer.groups).toHaveLength(1)
    expect(layer.images!.filter(i => i.groupId === layer.groups![0].id).map(i => i.id).sort()).toEqual(['a', 'b'])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(result.current.openImageGroupId).toBe(layer.groups![0].id)
  })

  it('a locked group is picked as a whole by a click on any member; unlocked ones are not', () => {
    const { result } = groupedFirstTwo()
    const gid = layerOf(result).groups![0].id
    act(() => result.current.setSelectedImageId(null))
    act(() => result.current.selectImage('I1', 'a', 'replace'))
    expect(result.current.pickedImageIds).toEqual(['a'])
    act(() => result.current.setImageGroupLocked('I1', gid, true))
    expect(layerOf(result).groups![0].locked).toBe(true)
    act(() => result.current.setSelectedImageId(null))
    act(() => result.current.selectImage('I1', 'a', 'replace'))
    expect([...result.current.pickedImageIds].sort()).toEqual(['a', 'b'])
    expect(result.current.selectedImageId).toBe('a')
  })

  it('selecting the group row opens it: then one member can be picked on its own, until another picture is clicked', () => {
    const { result } = groupedFirstTwo()
    const gid = layerOf(result).groups![0].id
    act(() => result.current.setImageGroupLocked('I1', gid, true))
    act(() => result.current.setSelectedImageId(null))
    act(() => result.current.selectImageGroup('I1', gid))
    expect([...result.current.pickedImageIds].sort()).toEqual(['a', 'b'])
    expect(result.current.openImageGroupId).toBe(gid)
    act(() => result.current.selectImage('I1', 'b', 'replace'))
    expect(result.current.pickedImageIds).toEqual(['b'])
    expect(result.current.openImageGroupId).toBe(gid)
    act(() => result.current.selectImage('I1', 'c', 'replace'))
    expect(result.current.openImageGroupId).toBeNull()
    act(() => result.current.selectImage('I1', 'a', 'replace'))
    expect([...result.current.pickedImageIds].sort()).toEqual(['a', 'b'])
  })

  it('Ctrl/Cmd+click on a locked group toggles all of it in or out', () => {
    const { result } = groupedFirstTwo()
    const gid = layerOf(result).groups![0].id
    act(() => result.current.setImageGroupLocked('I1', gid, true))
    act(() => result.current.setSelectedImageId(null))
    act(() => result.current.selectImage('I1', 'c', 'replace'))
    act(() => result.current.selectImage('I1', 'a', 'toggle'))
    expect([...result.current.pickedImageIds].sort()).toEqual(['a', 'b', 'c'])
    act(() => result.current.selectImage('I1', 'b', 'toggle'))
    expect(result.current.pickedImageIds).toEqual(['c'])
  })

  it('ungroup keeps the pictures and drops the group', () => {
    const { result } = groupedFirstTwo()
    const gid = layerOf(result).groups![0].id
    act(() => result.current.ungroupImageGroup('I1', gid))
    const layer = layerOf(result)
    expect(layer.groups).toBeUndefined()
    expect(layer.images).toHaveLength(4)
    expect(layer.images!.every(i => i.groupId === undefined)).toBe(true)
    expect(result.current.openImageGroupId).toBeNull()
  })

  it('renames a group, ignoring an empty name', () => {
    const { result } = groupedFirstTwo()
    const gid = layerOf(result).groups![0].id
    act(() => result.current.renameImageGroup('I1', gid, '  Dam wall '))
    expect(layerOf(result).groups![0].name).toBe('Dam wall')
    act(() => result.current.renameImageGroup('I1', gid, '   '))
    expect(layerOf(result).groups![0].name).toBe('Dam wall')
  })

  it('moveImages moves several pictures by one amount in one history step', () => {
    const { result, onCommitHistory } = groupedFirstTwo()
    onCommitHistory.mockClear()
    act(() => result.current.moveImages('I1', ['a', 'b'], 5, -3))
    const xs = Object.fromEntries(layerOf(result).images!.map(i => [i.id, [i.x, i.y]]))
    expect(xs.a).toEqual([5, 61])
    expect(xs.b).toEqual([15, 61])
    expect(xs.c).toEqual([20, 64])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
  })

  it('duplicating a whole group makes a new group of copies ("copy" name, same lock); the original is untouched', () => {
    const { result } = groupedFirstTwo()
    const gid = layerOf(result).groups![0].id
    act(() => result.current.setImageGroupLocked('I1', gid, true))
    act(() => result.current.duplicateImages('I1', ['a', 'b']))
    const layer = layerOf(result)
    expect(layer.groups).toHaveLength(2)
    expect(layer.groups![1]).toMatchObject({ name: 'Group copy', locked: true })
    expect(layer.groups![1].id).not.toBe(gid)
    expect(layer.images!.filter(i => i.groupId === gid)).toHaveLength(2)
    expect(layer.images!.filter(i => i.groupId === layer.groups![1].id)).toHaveLength(2)
  })

  it('deleting every member removes the group; deleting some keeps it', () => {
    const { result } = groupedFirstTwo()
    act(() => result.current.deleteImages('I1', ['a']))
    expect(layerOf(result).groups).toHaveLength(1)
    act(() => result.current.deleteImages('I1', ['b']))
    expect(layerOf(result).groups).toBeUndefined()
  })

  it('copy and paste into another image layer brings the group along as a new one', () => {
    const hook = setup([four(), imageLayer([], 'I2')])
    act(() => hook.result.current.selectImage('I1', 'a', 'replace'))
    act(() => hook.result.current.selectImage('I1', 'b', 'toggle'))
    act(() => hook.result.current.groupPickedImages('I1'))
    act(() => hook.result.current.copyImages('I1', ['a', 'b']))
    act(() => hook.result.current.pasteImages('I2', null))
    const target = layerOf(hook.result, 'I2')
    expect(target.groups).toHaveLength(1)
    expect(target.groups![0].name).toBe('Group copy')
    expect(target.images!.every(i => i.groupId === target.groups![0].id)).toBe(true)
  })

  it('a locked layer refuses group changes', () => {
    const locked = makeLayer('I1', { type: 'image', name: 'Images', images: [img('a', 0), img('b', 1)], locked: true })
    const { result } = setup([locked])
    act(() => result.current.selectImage('I1', 'a', 'replace'))
    act(() => result.current.selectImage('I1', 'b', 'toggle'))
    act(() => result.current.groupPickedImages('I1'))
    expect(layerOf(result).groups).toBeUndefined()
  })
})
