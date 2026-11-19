import { describe, it, expect } from 'vitest'
import type { EntityNode, SceneNode, TileLayerNode } from '../../../shared/sceneTree'
import {
  EMPTY_HISTORY,
  MAX_HISTORY,
  canRedo,
  canUndo,
  cloneSnapshot,
  createHistory,
  pushSnapshot,
  redoHistory,
  snapshotsEqual,
  undoHistory,
  type HistorySnapshot,
} from './history'

const layer = (id: string, data?: TileLayerNode['data']): TileLayerNode => ({ id, name: id, type: 'tile', data, children: [] })
const entity = (id: string, x = 0): EntityNode => ({ id, type: 'entity', name: id, x, y: 0, components: {}, children: [] })
const snap = (n: number, entities: EntityNode[] = []): HistorySnapshot => ({
  nodes: [layer('L', { [n]: { tilesetId: 't', x: n, y: 0 } }), ...entities],
})
const ids = (nodes: SceneNode[]) => nodes.filter((n) => n.type === 'entity').map((n) => n.id)
const firstLayer = (s: HistorySnapshot) => s.nodes[0] as TileLayerNode

describe('snapshotsEqual', () => {
  it('compares the scene tree structurally', () => {
    expect(snapshotsEqual(snap(1), snap(1))).toBe(true)
    expect(snapshotsEqual(snap(1), snap(2))).toBe(false)
    expect(snapshotsEqual(snap(1, [entity('a')]), snap(1, [entity('a')]))).toBe(true)
    expect(snapshotsEqual(snap(1, [entity('a')]), snap(1, [entity('a', 5)]))).toBe(false)
    expect(snapshotsEqual(snap(1), null)).toBe(false)
  })

  it('does not count opening or closing a group as a change', () => {
    const open: HistorySnapshot = { nodes: [{ id: 'g', type: 'group', name: 'g', children: [layer('L')] }] }
    const closed: HistorySnapshot = { nodes: [{ id: 'g', type: 'group', name: 'g', collapsed: true, children: [layer('L')] }] }
    expect(snapshotsEqual(open, closed)).toBe(true)
  })
})

describe('createHistory', () => {
  it('starts with one entry or empty', () => {
    expect(createHistory(null)).toEqual({ entries: [], index: -1 })
    const h = createHistory(snap(1))
    expect(h.index).toBe(0)
    expect(h.entries).toHaveLength(1)
  })

  it('clones the initial snapshot', () => {
    const s = snap(1)
    const h = createHistory(s)
    firstLayer(s).name = 'mutated'
    expect(firstLayer(h.entries[0]).name).toBe('L')
  })
})

describe('pushSnapshot', () => {
  it('appends and moves the index', () => {
    let h = createHistory(snap(0))
    h = pushSnapshot(h, snap(1))
    h = pushSnapshot(h, snap(2))
    expect(h.index).toBe(2)
    expect(h.entries).toHaveLength(3)
  })

  it('returns the same state for a duplicate of the current entry', () => {
    const h = createHistory(snap(0))
    expect(pushSnapshot(h, snap(0))).toBe(h)
  })

  it('treats entity-only differences as a new step', () => {
    const h = createHistory(snap(0))
    const next = pushSnapshot(h, snap(0, [entity('a')]))
    expect(next).not.toBe(h)
    expect(next.entries).toHaveLength(2)
  })

  it('ignores snapshots of an empty tree', () => {
    const h = createHistory(snap(0))
    expect(pushSnapshot(h, { nodes: [] })).toBe(h)
  })

  it('drops the redo tail when pushing from the middle', () => {
    let h = createHistory(snap(0))
    h = pushSnapshot(h, snap(1))
    h = pushSnapshot(h, snap(2))
    h = undoHistory(undoHistory(h).state).state
    expect(h.index).toBe(0)
    h = pushSnapshot(h, snap(9))
    expect(h.entries).toHaveLength(2)
    expect(firstLayer(h.entries[1]).data).toEqual({ 9: { tilesetId: 't', x: 9, y: 0 } })
    expect(canRedo(h)).toBe(false)
  })

  it('caps the stack at 50 entries, dropping the oldest', () => {
    let h = createHistory(snap(0))
    for (let i = 1; i <= 60; i++) h = pushSnapshot(h, snap(i))
    expect(h.entries).toHaveLength(MAX_HISTORY)
    expect(h.index).toBe(MAX_HISTORY - 1)
    expect(firstLayer(h.entries[0]).data).toEqual({ 11: { tilesetId: 't', x: 11, y: 0 } })
    expect(firstLayer(h.entries[MAX_HISTORY - 1]).data).toEqual({ 60: { tilesetId: 't', x: 60, y: 0 } })
  })

  it('stores a clone so later mutation of the input does not corrupt history', () => {
    const s = snap(1)
    const h = pushSnapshot(createHistory(snap(0)), s)
    firstLayer(s).visible = false
    expect(firstLayer(h.entries[1]).visible).toBeUndefined()
  })

  it('does not mutate the previous state', () => {
    const h = createHistory(snap(0))
    pushSnapshot(h, snap(1))
    expect(h.entries).toHaveLength(1)
  })
})

describe('undo / redo', () => {
  it('walks back and forth, restoring layers AND entities (they are one tree)', () => {
    let h = createHistory(snap(0, []))
    h = pushSnapshot(h, snap(1, [entity('a')]))
    h = pushSnapshot(h, snap(2, [entity('a'), entity('b')]))

    const u1 = undoHistory(h)
    expect(ids(u1.snapshot!.nodes)).toEqual(['a'])
    expect(u1.state.index).toBe(1)

    const u2 = undoHistory(u1.state)
    expect(ids(u2.snapshot!.nodes)).toEqual([])
    expect(canUndo(u2.state)).toBe(false)

    const r1 = redoHistory(u2.state)
    expect(ids(r1.snapshot!.nodes)).toEqual(['a'])
    const r2 = redoHistory(r1.state)
    expect(ids(r2.snapshot!.nodes)).toEqual(['a', 'b'])
    expect(canRedo(r2.state)).toBe(false)
  })

  it('returns a null snapshot and the same state at the ends', () => {
    const h = createHistory(snap(0))
    expect(undoHistory(h)).toEqual({ state: h, snapshot: null })
    expect(redoHistory(h)).toEqual({ state: h, snapshot: null })
    expect(undoHistory(EMPTY_HISTORY).snapshot).toBeNull()
  })

  it('returns clones that are safe to mutate', () => {
    let h = createHistory(snap(0))
    h = pushSnapshot(h, snap(1))
    const { snapshot, state } = undoHistory(h)
    firstLayer(snapshot!).name = 'changed'
    expect(firstLayer(state.entries[0]).name).toBe('L')
  })
})

describe('cloneSnapshot', () => {
  it('deep clones', () => {
    const s = snap(1, [entity('a')])
    const c = cloneSnapshot(s)
    expect(c).toEqual(s)
    expect(c.nodes).not.toBe(s.nodes)
    expect(c.nodes[1]).not.toBe(s.nodes[1])
  })
})
