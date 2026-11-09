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
