import { StrictMode, useState, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { DebugInfo, Layer, MapData, TileSelection } from '@/types/editor'
import { useSyncedState } from '@/hooks/useSyncedState'
import { makeLayer, makeMap } from '@/test/helpers'
import { usePaintTools } from './usePaintTools'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
const sel = (x: number): TileSelection => ({ width: 1, height: 1, tiles: [{ tilesetId: 'ts', x, y: 0 }] })

interface Opts {
  layer?: Partial<Layer>
  tool?: 'brush' | 'eraser'
  selection?: TileSelection | null
  activeLayerId?: string | null
}

function setup(opts: Opts = {}) {
  const commitHistory = vi.fn()
  const setDebugInfo = vi.fn()
  return {
    commitHistory,
    setDebugInfo,
    ...renderHook(
      () => {
        const [activeMap, setActiveMap] = useState<MapData | null>(
          makeMap({ width: 4, height: 4, layers: [makeLayer('L1', opts.layer)] })
        )
        const [layers, setLayers, layersRef] = useSyncedState<Layer[]>([makeLayer('L1', opts.layer)])
        const tools = usePaintTools({
          activeMap,
          activeLayerId: opts.activeLayerId === undefined ? 'L1' : opts.activeLayerId,
          tileSelection: opts.selection === undefined ? sel(1) : opts.selection,
          activeTool: opts.tool ?? 'brush',
          paintMode: 'discontinuous',
          paintStartPos: null,
          getLayers: () => layersRef.current,
          setLayers,
          commitHistory,
          setDebugInfo: setDebugInfo as (i: DebugInfo) => void,
          setActiveMap,
        })
        return { tools, layers, activeMap }
      },
      { wrapper }
    ),
  }
}

describe('usePaintTools (StrictMode)', () => {
  it('paints a tile and mirrors it into the active map', () => {
    const { result, setDebugInfo, commitHistory } = setup()
    act(() => result.current.tools.handlePaint(1, 2))
    expect(result.current.layers[0].data).toEqual({ 9: { tilesetId: 'ts', x: 1, y: 0 } })
    expect(result.current.activeMap?.layers).toBe(result.current.layers)
    expect(setDebugInfo).toHaveBeenCalledTimes(1)
    expect(setDebugInfo.mock.calls[0][0]).toMatchObject({ action: 'brush', error: 'Success', x: 1, y: 2 })
    expect(commitHistory).not.toHaveBeenCalled() // history is committed at stroke end
  })

  it('several paint calls in one tick compose', () => {
    const { result } = setup()
    act(() => {
      result.current.tools.handlePaint(0, 0)
      result.current.tools.handlePaint(1, 0)
      result.current.tools.handlePaint(2, 0)
    })
    expect(Object.keys(result.current.layers[0].data!)).toEqual(['0', '1', '2'])
  })

  it('reports problems instead of painting', () => {
    const cases: Array<[Opts, string, [number, number]]> = [
      [{ activeLayerId: null }, 'No active layer', [0, 0]],
      [{ selection: null }, 'No tile selected', [0, 0]],
      [{}, 'Out of bounds', [4, 0]],
      [{ activeLayerId: 'missing' }, 'Layer not found', [0, 0]],
      [{ layer: { locked: true } }, 'Layer locked/hidden', [0, 0]],
      [{ layer: { visible: false } }, 'Layer locked/hidden', [0, 0]],
    ]
    for (const [opts, message, [x, y]] of cases) {
      const { result, setDebugInfo } = setup(opts)
      act(() => result.current.tools.handlePaint(x, y))
      expect(setDebugInfo.mock.calls[0][0].error).toBe(message)
      expect(result.current.layers[0].data).toBeUndefined()
    }
  })

  it('eraser removes a tile', () => {
    const { result, setDebugInfo } = setup({ layer: { data: { 5: { tilesetId: 'ts', x: 0, y: 0 } } }, tool: 'eraser' })
    act(() => result.current.tools.handlePaint(1, 1))
    expect(result.current.layers[0].data).toEqual({})
    expect(result.current.activeMap?.layers[0].data).toEqual({})
    expect(setDebugInfo.mock.calls[0][0]).toMatchObject({ action: 'eraser', error: 'Success' })
  })

  it('eraser on an empty cell leaves the layers untouched', () => {
    const { result, setDebugInfo } = setup({ tool: 'eraser' })
    const before = result.current.layers
    act(() => result.current.tools.handlePaint(1, 1))
    expect(result.current.layers).toBe(before)
    expect(setDebugInfo.mock.calls[0][0]).toMatchObject({ action: 'erase', error: 'Already empty' })
  })

  it('bucket and rectangle fills commit history exactly once each', () => {
    const { result, commitHistory } = setup()
    act(() => result.current.tools.handlePaintBucket(0, 0))
    expect(Object.keys(result.current.layers[0].data!)).toHaveLength(16)
    expect(commitHistory).toHaveBeenCalledTimes(1)

    act(() => result.current.tools.handleRectangleFill({ x: 3, y: 3 }, { x: 2, y: 2 }))
    // identical tile everywhere already -> nothing to do, no extra history
    expect(commitHistory).toHaveBeenCalledTimes(1)
  })

  it('rectangle fill with reversed corners', () => {
    const { result, commitHistory } = setup()
    act(() => result.current.tools.handleRectangleFill({ x: 2, y: 1 }, { x: 1, y: 0 }))
    expect(Object.keys(result.current.layers[0].data!).sort()).toEqual(['1', '2', '5', '6'])
    expect(commitHistory).toHaveBeenCalledTimes(1)
  })

  it('fills do nothing on a locked layer', () => {
    const { result, commitHistory } = setup({ layer: { locked: true } })
    act(() => result.current.tools.handlePaintBucket(0, 0))
    act(() => result.current.tools.handleRectangleFill({ x: 0, y: 0 }, { x: 1, y: 1 }))
    expect(commitHistory).not.toHaveBeenCalled()
  })
})
