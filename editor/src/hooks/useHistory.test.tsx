import { StrictMode, useState, type ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { EntityData, Layer, MapData } from '@/types/editor'
import type { HistorySnapshot } from '@/lib/history'
import { makeEntity, makeLayer, makeMap } from '@/test/helpers'
import { useEntityManager } from '@/hooks/editor/useEntityManager'
import { useLayerManager } from '@/hooks/editor/useLayerManager'
import { useHistory } from './useHistory'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

const snap = (layers: Layer[], entities: EntityData[] = []): HistorySnapshot => ({ layers, entities })

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
      result.current.commitHistory(snap([])) // ignored: no layers
    })
    expect(result.current.history).toHaveLength(3)
    expect(result.current.historyIndex).toBe(2)
  })

  it('undo / redo hand clones of the snapshot (layers AND entities) to apply', () => {
    const { result } = renderHook(() => useHistory(), { wrapper })
    const seen: HistorySnapshot[] = []
    act(() => {
      result.current.resetHistory(snap([makeLayer('L')], []))
      result.current.commitHistory(snap([makeLayer('L')], [makeEntity('e1')]))
    })
    act(() => {
      expect(result.current.handleUndo(s => seen.push(s))).toBe(true)
    })
    expect(seen[0].entities).toEqual([])
    expect(result.current.historyIndex).toBe(0)
    act(() => {
      expect(result.current.handleRedo(s => seen.push(s))).toBe(true)
    })
    expect(seen[1].entities.map(e => e.id)).toEqual(['e1'])
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

  describe('wired to the layer and entity managers', () => {
    function setup() {
      return renderHook(
        () => {
          const history = useHistory()
          const [activeMap, setActiveMap] = useState<MapData | null>(makeMap({ layers: [makeLayer('L1')], entities: [] }))
          // eslint-disable-next-line prefer-const
          let layers: ReturnType<typeof useLayerManager>
          // eslint-disable-next-line prefer-const
          let entities: ReturnType<typeof useEntityManager>
          const commit = () =>
            history.commitHistory({ layers: layers.getLayers(), entities: entities.getEntities() })
          layers = useLayerManager({ setActiveMap, onCommitHistory: commit })
          entities = useEntityManager({ activeMap, setActiveMap, onCommitHistory: commit })
          return { history, layers, entities, activeMap, setActiveMap }
        },
        { wrapper }
      )
    }

    it('undo/redo restore both layers and entities', () => {
      const { result } = setup()
      act(() => {
        result.current.layers.setLayers([makeLayer('L1')])
        result.current.history.resetHistory({ layers: [makeLayer('L1')], entities: [] })
      })

      act(() => result.current.entities.createEntity('Hero', 1, 2))
      act(() => result.current.layers.handleCreateLayer())
      expect(result.current.history.historyIndex).toBe(2)

      const apply = (s: HistorySnapshot) => {
        result.current.layers.setLayers(s.layers)
        result.current.entities.setEntities(s.entities)
      }

      act(() => {
        result.current.history.handleUndo(apply)
      })
      expect(result.current.layers.layers).toHaveLength(1)
      expect(result.current.entities.entities).toHaveLength(1)

      act(() => {
        result.current.history.handleUndo(apply)
      })
      expect(result.current.layers.layers).toHaveLength(1)
      expect(result.current.entities.entities).toHaveLength(0)

      act(() => {
        result.current.history.handleRedo(apply)
        result.current.history.handleRedo(apply)
      })
      expect(result.current.layers.layers).toHaveLength(2)
      expect(result.current.entities.entities.map(e => e.name)).toEqual(['Hero'])
    })
  })
})
