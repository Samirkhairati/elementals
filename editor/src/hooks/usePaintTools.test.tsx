import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { DebugInfo, TileSelection } from '@/types/editor'
import { collisionTileNodes, type CollisionLayerNode, type DataLayerNode } from '../../../shared/sceneTree'
import { makeLayer, makeMap } from '@/test/helpers'
import { useSceneHarness } from '@/test/sceneHarness'
import { polygonEditStore } from '@/lib/polygonEditStore'
import { usePaintTools } from './usePaintTools'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
const sel = (x: number): TileSelection => ({ width: 1, height: 1, tiles: [{ tilesetId: 'ts', x, y: 0 }] })

interface Opts {
  layer?: Record<string, unknown>
  tool?: 'brush' | 'eraser'
  selection?: TileSelection | null
  activeLayerId?: string | null
}

function setup(opts: Opts = {}) {
  const setDebugInfo = vi.fn()
  const onCommitHistory = vi.fn()
  return {
    commitHistory: onCommitHistory,
    setDebugInfo,
    ...renderHook(
      () => {
        const scene = useSceneHarness(makeMap({ width: 4, height: 4, nodes: [makeLayer('L1', opts.layer)] }), onCommitHistory)
        const tools = usePaintTools({
          activeMap: scene.activeMap,
          activeLayerId: opts.activeLayerId === undefined ? 'L1' : opts.activeLayerId,
          tileSelection: opts.selection === undefined ? sel(1) : opts.selection,
          activeTool: opts.tool ?? 'brush',
          paintMode: 'discontinuous',
          paintStartPos: null,
          getIndex: scene.tree.getIndex,
          commit: scene.tree.commit,
          commitView: scene.tree.commitView,
          setDebugInfo: setDebugInfo as (i: DebugInfo) => void,
        })
        // The painted layer, read from the map (the tree is the one copy of it).
        const layer = scene.activeMap!.nodes[0] as DataLayerNode
        return { tools, layer, activeMap: scene.activeMap }
      },
      { wrapper }
    ),
  }
}

describe('usePaintTools (StrictMode)', () => {
  it('paints a tile and mirrors it into the active map', () => {
    const { result, setDebugInfo, commitHistory } = setup()
    act(() => result.current.tools.handlePaint(1, 2))
    expect(result.current.layer.data).toEqual({ 9: { tilesetId: 'ts', x: 1, y: 0 } })
    expect(result.current.activeMap?.nodes[0]).toBe(result.current.layer)
    // success is not reported (a stroke would re-render the editor on every cell)
    expect(setDebugInfo).not.toHaveBeenCalled()
    expect(commitHistory).not.toHaveBeenCalled() // history is committed at stroke end
  })

  it('paints every cell between the last one and this one in one change (a fast stroke leaves no gaps)', () => {
    const { result } = setup()
    act(() => result.current.tools.handlePaint(0, 0))
    act(() => result.current.tools.handlePaint(3, 0, { x: 0, y: 0 }))
    expect(Object.keys(result.current.layer.data ?? {}).map(Number).sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })

  it('painting an empty sampled area on a collision layer erases there instead of drawing a block', () => {
    const marker = { tilesetId: '__collision__', x: 0, y: 0 }
    const { result } = setup({
      layer: { type: 'collision', children: [{ id: 'tiles', type: 'collisionTiles', name: 'Tiles' }], data: { 5: marker, 6: marker, 15: marker } },
      selection: { width: 2, height: 1, tiles: [null, null] },
    })
    act(() => result.current.tools.handlePaint(1, 1))
    expect(result.current.layer.data).toEqual({ 15: marker })
  })

  it('on a collision layer new cells join the picked tiles item (a new one when none is picked); old cells keep theirs', () => {
    const marker = { tilesetId: '__collision__', x: 0, y: 0 }
    polygonEditStore.set({ selectedShapeId: null, brush: 'tiles' })
    const { result } = setup({
      layer: { type: 'collision', data: { 0: marker }, children: [{ id: 'tiles', type: 'collisionTiles', name: 'Tiles' }] },
      selection: null,
    })
    // No tileset tile is needed: a collision layer always paints the marker.
    act(() => result.current.tools.handlePaint(1, 0))
    const [made] = collisionTileNodes(result.current.layer as CollisionLayerNode).slice(1)
    expect(made.name).toBe('Tiles 2')
    expect(polygonEditStore.get().selectedShapeId).toBe(made.id)
    expect(result.current.layer.data).toEqual({ 0: marker, 1: { ...marker, group: made.id } })
    // The picked item takes the next cells too.
    act(() => result.current.tools.handlePaint(2, 0))
    expect(collisionTileNodes(result.current.layer as CollisionLayerNode)).toHaveLength(2)
    expect(result.current.layer.data![2]).toEqual({ ...marker, group: made.id })
    polygonEditStore.set({ selectedShapeId: null })
  })

  it('several paint calls in one tick compose', () => {
    const { result } = setup()
    act(() => {
      result.current.tools.handlePaint(0, 0)
      result.current.tools.handlePaint(1, 0)
      result.current.tools.handlePaint(2, 0)
    })
    expect(Object.keys(result.current.layer.data!)).toEqual(['0', '1', '2'])
  })

  it('reports problems instead of painting', () => {
    const cases: Array<[Opts, string, [number, number]]> = [
      [{ activeLayerId: null }, 'No active layer', [0, 0]],
      [{ selection: null }, 'No tile selected', [0, 0]],
      [{}, 'Out of bounds', [4, 0]],
      [{ activeLayerId: 'missing' }, 'Layer not found', [0, 0]],
      [{ layer: { locked: true } }, 'Layer locked/hidden', [0, 0]],
      [{ layer: { visible: false } }, 'Layer locked/hidden', [0, 0]],
      [{ layer: { type: 'group', children: [] } }, 'Node hold nodes, not tiles', [0, 0]],
    ]
    for (const [opts, message, [x, y]] of cases) {
      const { result, setDebugInfo } = setup(opts)
      act(() => result.current.tools.handlePaint(x, y))
      expect(setDebugInfo.mock.calls[0][0].error).toBe(message)
      expect(result.current.layer.data).toBeUndefined()
    }
  })

  it('eraser removes a tile', () => {
    const { result, setDebugInfo } = setup({ layer: { data: { 5: { tilesetId: 'ts', x: 0, y: 0 } } }, tool: 'eraser' })
    act(() => result.current.tools.handlePaint(1, 1))
    expect(result.current.layer.data).toEqual({})
    expect(setDebugInfo).not.toHaveBeenCalled()
  })

  it('eraser on an empty cell leaves the layers untouched', () => {
    const { result, setDebugInfo } = setup({ tool: 'eraser' })
    const before = result.current.activeMap?.nodes
    act(() => result.current.tools.handlePaint(1, 1))
    expect(result.current.activeMap?.nodes).toBe(before)
    expect(setDebugInfo).not.toHaveBeenCalled()
  })

  it('bucket and rectangle fills commit history exactly once each', () => {
    const { result, commitHistory } = setup()
    act(() => result.current.tools.handlePaintBucket(0, 0))
    expect(Object.keys(result.current.layer.data!)).toHaveLength(16)
    expect(commitHistory).toHaveBeenCalledTimes(1)

    act(() => result.current.tools.handleRectangleFill({ x: 3, y: 3 }, { x: 2, y: 2 }))
    // identical tile everywhere already -> nothing to do, no extra history
    expect(commitHistory).toHaveBeenCalledTimes(1)
  })

  it('rectangle fill with reversed corners', () => {
    const { result, commitHistory } = setup()
    act(() => result.current.tools.handleRectangleFill({ x: 2, y: 1 }, { x: 1, y: 0 }))
    expect(Object.keys(result.current.layer.data!).sort()).toEqual(['1', '2', '5', '6'])
    expect(commitHistory).toHaveBeenCalledTimes(1)
  })

  it('fills do nothing on a locked layer', () => {
    const { result, commitHistory } = setup({ layer: { locked: true } })
    act(() => result.current.tools.handlePaintBucket(0, 0))
    act(() => result.current.tools.handleRectangleFill({ x: 0, y: 0 }, { x: 1, y: 1 }))
    expect(commitHistory).not.toHaveBeenCalled()
  })
})
