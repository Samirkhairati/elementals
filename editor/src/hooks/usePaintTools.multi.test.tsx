import { StrictMode, useState, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { DebugInfo, Layer, MapData, TileSelection } from '@/types/editor'
import { useSyncedState } from '@/hooks/useSyncedState'
import { makeLayer, makeMap } from '@/test/helpers'
import { usePaintTools } from './usePaintTools'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
const COL = { tilesetId: '__collision__', x: 0, y: 0 }
const t = (x: number) => ({ tilesetId: 'ts', x, y: 0 })

// A 2x1 stamp sampled from the ground and collision layers.
const multi: TileSelection = {
  width: 2,
  height: 1,
  tiles: [t(1), t(2)],
  layers: [
    { layerId: 'col', layerType: 'collision', name: 'col', tiles: [COL, null] },
    { layerId: 'ground', layerType: 'tile', name: 'ground', tiles: [t(1), t(2)] },
  ],
}

function setup(opts: { pinned?: boolean; tool?: 'brush' | 'eraser'; layers?: Layer[]; selection?: TileSelection | null } = {}) {
  const initial = opts.layers ?? [makeLayer('col', { type: 'collision' }), makeLayer('ground'), makeLayer('img', { type: 'image', images: [] })]
  const commitHistory = vi.fn()
  const hook = renderHook(
    () => {
      const [activeMap, setActiveMap] = useState<MapData | null>(makeMap({ width: 4, height: 4, layers: initial }))
      const [layers, setLayers, layersRef] = useSyncedState<Layer[]>(initial)
      const tools = usePaintTools({
        activeMap,
        activeLayerId: 'ground',
        tileSelection: opts.selection === undefined ? multi : opts.selection,
        pinSelection: opts.pinned ?? true,
        activeTool: opts.tool ?? 'brush',
        paintMode: 'discontinuous',
        paintStartPos: null,
        getLayers: () => layersRef.current,
        setLayers,
        commitHistory,
        setDebugInfo: vi.fn() as (i: DebugInfo) => void,
        setActiveMap,
      })
      return { tools, layers }
    },
    { wrapper }
  )
  return { ...hook, commitHistory }
}

const layer = (r: ReturnType<typeof setup>, id: string) => r.result.current.layers.find((l) => l.id === id)!

describe('usePaintTools: pinned multi-layer selection', () => {
  it('a brush stroke writes each part to the layer it came from', () => {
    const r = setup()
    act(() => r.result.current.tools.handlePaint(1, 2))
    expect(layer(r, 'col').data).toEqual({ 9: COL })
    expect(layer(r, 'ground').data).toEqual({ 9: t(1), 10: t(2) })
    expect(layer(r, 'img').data).toBeUndefined()
  })

  it('the eraser clears the cell on every layer of the selection', () => {
    const r = setup({
      tool: 'eraser',
      layers: [makeLayer('col', { type: 'collision', data: { 9: COL } }), makeLayer('ground', { data: { 9: t(1) } })],
    })
    act(() => r.result.current.tools.handlePaint(1, 2))
    expect(layer(r, 'col').data).toEqual({})
    expect(layer(r, 'ground').data).toEqual({})
  })

  it('skips locked layers but still paints the others', () => {
    const r = setup({ layers: [makeLayer('col', { type: 'collision', locked: true }), makeLayer('ground')] })
    act(() => r.result.current.tools.handlePaint(0, 0))
    expect(layer(r, 'col').data).toBeUndefined()
    expect(layer(r, 'ground').data).toEqual({ 0: t(1), 1: t(2) })
  })

  it('rectangle fill covers the same area on every layer, as one history step', () => {
    const r = setup()
    act(() => r.result.current.tools.handleRectangleFill({ x: 0, y: 0 }, { x: 1, y: 1 }))
    expect(Object.keys(layer(r, 'col').data!)).toHaveLength(2) // the collision part has a marker only in its first column
    expect(Object.keys(layer(r, 'ground').data!)).toHaveLength(4)
    expect(r.commitHistory).toHaveBeenCalledTimes(1)
  })

  it('bucket fill decides the region on the active layer and fills it on all of them', () => {
    // ground has a wall column at x=2, so the region of (0,0) is x<2 on ground; the collision layer is empty
    const wall = { 2: t(9), 6: t(9), 10: t(9), 14: t(9) }
    const r = setup({ layers: [makeLayer('col', { type: 'collision' }), makeLayer('ground', { data: wall })] })
    act(() => r.result.current.tools.handlePaintBucket(0, 0))
    expect(Object.keys(layer(r, 'col').data!).map(Number).sort((a, b) => a - b)).toEqual([0, 4, 8, 12]) // marker lands in the first column of each row
    expect(layer(r, 'ground').data![2]).toEqual(t(9)) // the wall is untouched
    expect(r.commitHistory).toHaveBeenCalledTimes(1)
  })

  it('unpinned, a multi-layer selection paints its composite on the active layer only', () => {
    const r = setup({ pinned: false })
    act(() => r.result.current.tools.handlePaint(0, 0))
    expect(layer(r, 'col').data).toBeUndefined()
    expect(layer(r, 'ground').data).toEqual({ 0: t(1), 1: t(2) })
  })
})

describe('usePaintTools: image layers and collision markers', () => {
  it('never paints tiles onto an image layer', () => {
    const r = setup({ layers: [makeLayer('ground', { type: 'image', images: [] })], pinned: false, selection: { width: 1, height: 1, tiles: [t(1)] } })
    act(() => r.result.current.tools.handlePaint(0, 0))
    expect(layer(r, 'ground').data).toBeUndefined()
  })

  it('a collision marker is not painted onto a tile layer', () => {
    const r = setup({ pinned: false, layers: [makeLayer('ground')], selection: { width: 1, height: 1, tiles: [COL] } })
    act(() => r.result.current.tools.handlePaint(0, 0))
    expect(layer(r, 'ground').data).toBeUndefined()
  })
})
