import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { SceneNode } from '../../../shared/sceneTree'
import type { HistorySnapshot } from '@/lib/history'
import { makeEntity, makeImageLayer, makeLayer, makeMap, makePicture } from '@/test/helpers'
import { useSceneHarness } from '@/test/sceneHarness'
import { carryView } from '@/lib/sceneOps'
import { useHistory } from './useHistory'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

const snap = (nodes: SceneNode[]): HistorySnapshot => ({ nodes })

describe('useHistory (StrictMode)', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useHistory(), { wrapper })
    expect(result.current.history).toEqual([])
    expect(result.current.historyIndex).toBe(-1)
    expect(result.current.handleUndo(() => {})).toBe(false)
  })

  it('resetHistory seeds a single entry; null clears', () => {
    const { result } = renderHook(() => useHistory(), { wrapper })
    act(() => result.current.resetHistory(snap([makeLayer('L')])))
    expect(result.current.historyIndex).toBe(0)
    expect(result.current.history).toHaveLength(1)
    act(() => result.current.resetHistory(null))
    expect(result.current.historyIndex).toBe(-1)
    expect(result.current.history).toEqual([])
  })

  it('commits several snapshots in one tick and dedupes identical ones', () => {
    const { result } = renderHook(() => useHistory(), { wrapper })
    act(() => {
      result.current.resetHistory(snap([makeLayer('L')]))
      result.current.commitHistory(snap([makeLayer('L', { name: 'one' })]))
      result.current.commitHistory(snap([makeLayer('L', { name: 'one' })])) // duplicate
      result.current.commitHistory(snap([makeLayer('L', { name: 'two' })]))
      result.current.commitHistory(snap([])) // ignored: empty tree
    })
    expect(result.current.history).toHaveLength(3)
    expect(result.current.historyIndex).toBe(2)
  })

  it('undo / redo hand clones of the snapshot (layers AND entities) to apply', () => {
    const { result } = renderHook(() => useHistory(), { wrapper })
    const seen: HistorySnapshot[] = []
    act(() => {
      result.current.resetHistory(snap([makeLayer('L')]))
      result.current.commitHistory(snap([makeLayer('L'), makeEntity('e1')]))
    })
    act(() => {
      expect(result.current.handleUndo(s => seen.push(s))).toBe(true)
    })
    expect(seen[0].nodes.map(n => n.id)).toEqual(['L'])
    expect(result.current.historyIndex).toBe(0)
    act(() => {
      expect(result.current.handleRedo(s => seen.push(s))).toBe(true)
    })
    expect(seen[1].nodes.map(n => n.id)).toEqual(['L', 'e1'])
    expect(result.current.historyIndex).toBe(1)
    act(() => {
      expect(result.current.handleRedo(s => seen.push(s))).toBe(false)
    })
    expect(seen).toHaveLength(2)
  })

  it('pushing after an undo discards the redo branch', () => {
    const { result } = renderHook(() => useHistory(), { wrapper })
    act(() => {
      result.current.resetHistory(snap([makeLayer('L', { name: '0' })]))
      result.current.commitHistory(snap([makeLayer('L', { name: '1' })]))
    })
    act(() => {
      result.current.handleUndo(() => {})
    })
    act(() => result.current.commitHistory(snap([makeLayer('L', { name: '2' })])))
    expect(result.current.history).toHaveLength(2)
    expect(result.current.handleRedo(() => {})).toBe(false)
  })

  describe('wired to the scene tree', () => {
    function setup(nodes: SceneNode[] = [makeLayer('L1')]) {
      return renderHook(
        () => {
          const history = useHistory()
          const scene = useSceneHarness(makeMap({ nodes }), (next) => history.commitHistory({ nodes: next }))
          return { history, ...scene }
        },
        { wrapper }
      )
    }
    const apply = (result: { current: ReturnType<typeof setup>['result']['current'] }) => (s: HistorySnapshot) =>
      result.current.setActiveMap((m) => (m ? { ...m, nodes: carryView(m.nodes, s.nodes) } : m))

    it('undo/redo restore both layers and entities', () => {
      const { result } = setup()
      act(() => result.current.history.resetHistory({ nodes: result.current.activeMap!.nodes }))

      act(() => result.current.entities.createEntity('Hero', 1, 2))
      act(() => result.current.layers.handleCreateLayer())
      expect(result.current.history.historyIndex).toBe(2)
      const count = () => result.current.tree.index.layers.length
      expect(count()).toBe(2)
      expect(result.current.entities.entities).toHaveLength(1)

      act(() => {
        result.current.history.handleUndo(apply(result))
      })
      expect(count()).toBe(1)
      expect(result.current.entities.entities).toHaveLength(1)

      act(() => {
        result.current.history.handleUndo(apply(result))
      })
      expect(count()).toBe(1)
      expect(result.current.entities.entities).toHaveLength(0)

      act(() => {
        result.current.history.handleRedo(apply(result))
        result.current.history.handleRedo(apply(result))
      })
      expect(count()).toBe(2)
      expect(result.current.entities.entities.map(e => e.name)).toEqual(['Hero'])
    })

    it('scaling an image is one undo step: undo brings the old scale back, redo the new one', () => {
      const start = [makeImageLayer('I1', [makePicture('img1', { assetId: undefined, graphicId: 'a.png', x: 16, y: 32 })])]
      const { result } = setup(start)
      act(() => result.current.history.resetHistory({ nodes: start }))
      const scaleOf = () => result.current.tree.index.pictures[0].scale

      act(() => result.current.layers.updateImage('I1', 'img1', { scale: 2 }))
      act(() => result.current.layers.updateImage('I1', 'img1', { scale: 2 })) // unchanged: nothing recorded
      act(() => result.current.layers.updateImage('I1', 'img1', { scale: 4 }))
      expect(scaleOf()).toBe(4)
      expect(result.current.history.historyIndex).toBe(2)

      act(() => {
        result.current.history.handleUndo(apply(result))
      })
      expect(scaleOf()).toBe(2)
      act(() => {
        result.current.history.handleUndo(apply(result))
      })
      expect(scaleOf()).toBeUndefined()
      act(() => {
        result.current.history.handleRedo(apply(result))
        result.current.history.handleRedo(apply(result))
      })
      expect(scaleOf()).toBe(4)
    })
  })
})
