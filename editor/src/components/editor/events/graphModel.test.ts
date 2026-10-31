import { beforeEach, describe, expect, it } from 'vitest'
import type { EventGraph, GraphNode } from '../../../../../shared/engine/types'
import { commandNodes, createGraph, extractFragment, findStart } from '../../../../../shared/engine/graph'
import { createSequentialIdGenerator } from '../../../../../shared/engine/ids'
import {
  NODE_STEP_X,
  NODE_STEP_Y,
  addCommandNode,
  addFrameAround,
  deleteNodes,
  duplicateNodes,
  findFreeSpot,
  getMemoryClipboard,
  isEditableNode,
  moveFrame,
  nodeInFrame,
  nodesInFrame,
  parseFragment,
  positionForNewNode,
  readFragmentClipboard,
  removeFrame,
  serializeFragment,
  setMemoryClipboard,
  snapToGrid,
  updateFrame,
  writeFragmentClipboard,
} from './graphModel'

const seq = () => createSequentialIdGenerator('g')
const node = (id: string, type: string, out: Record<string, string> = {}, x = 0, y = 0, params: Record<string, unknown> = {}): GraphNode => ({ id, type, params, out, x, y })
const graphOf = (...nodes: GraphNode[]): EventGraph => ({ nodes, frames: [] })

beforeEach(() => setMemoryClipboard(null))

describe('placing nodes', () => {
  it('snaps to the 16px grid', () => {
    expect(snapToGrid(23)).toBe(16)
    expect(snapToGrid(25)).toBe(32)
    expect(snapToGrid(-7)).toBe(-0)
  })

  it('finds the first free spot downwards', () => {
    const g = graphOf(node('a', 'wait', {}, 0, 0), node('b', 'wait', {}, 0, NODE_STEP_Y))
    expect(findFreeSpot(g, 0, 0)).toEqual({ x: 0, y: 2 * NODE_STEP_Y })
    expect(findFreeSpot(g, 600, 0)).toEqual({ x: 600, y: 0 })
  })

  it('puts a node one step right of its source, on the row of the port', () => {
    const g = graphOf(node('c', 'conditional', {}, 100, 200))
    expect(positionForNewNode(g, { nodeId: 'c', port: 'then' })).toEqual({ x: snapToGrid(100 + NODE_STEP_X), y: snapToGrid(200) })
    const down = positionForNewNode(g, { nodeId: 'c', port: 'else' })
    expect(down.y).toBeGreaterThan(200) // the else branch fans out below the then branch
  })

  it('honours a drop position, snapped and moved off other nodes', () => {
    const g = graphOf(node('a', 'wait', {}, 48, 48))
    expect(positionForNewNode(g, undefined, { x: 300, y: 300 })).toEqual({ x: 304, y: 304 })
    expect(positionForNewNode(g, undefined, { x: 48, y: 48 }).y).toBeGreaterThan(48)
  })

  it('without a source goes right of the rightmost node', () => {
    const g = graphOf(node('a', 'wait', {}, 500, 0), node('b', 'wait', {}, 0, 0))
    expect(positionForNewNode(g)).toEqual({ x: snapToGrid(500 + NODE_STEP_X), y: 0 })
  })
})

describe('addCommandNode', () => {
  it('adds a catalog node with its default params, wired from a port, and reports its id', () => {
    const g = createGraph(() => 's')
    const r = addCommandNode(g, 'setSwitch', { from: { nodeId: 's', port: 'next' } }, seq())
    expect(r.id).toBe('g-1')
    const added = r.graph.nodes.find((n) => n.id === r.id)!
    expect(added.params).toEqual({ id: '', value: true })
    expect(findStart(r.graph)!.out).toEqual({ next: 'g-1' })
    expect(added.x).toBeGreaterThan(0)
  })

  it('inserts into an existing wire', () => {
    const g = graphOf(node('s', 'start', { next: 'b' }), node('b', 'wait'))
    const r = addCommandNode(g, 'showText', { from: { nodeId: 's', port: 'next' } }, seq())
    expect(r.graph.nodes.find((n) => n.id === r.id)!.out).toEqual({ next: 'b' })
  })

  it('accepts End and Reroute, params overrides, and refuses start and unknown types', () => {
    const g = createGraph(() => 's')
    expect(addCommandNode(g, 'end', {}, seq()).id).not.toBeNull()
    expect(addCommandNode(g, 'junction', {}, seq()).id).not.toBeNull()
    expect(addCommandNode(g, 'wait', { params: { ms: 5 } }, seq()).graph.nodes[1].params).toEqual({ ms: 5 })
    const refused = addCommandNode(g, 'start', {}, seq())
    expect(refused).toEqual({ graph: g, id: null })
    expect(addCommandNode(g, 'nope', {}, seq())).toEqual({ graph: g, id: null })
  })
})

describe('deleting and duplicating', () => {
  const g = graphOf(node('s', 'start', { next: 'a' }), node('a', 'wait', { next: 'b' }), node('b', 'wait', { next: 'c' }), node('c', 'end'))

  it('deletes a selection with its wires, never start', () => {
    const r = deleteNodes(g, ['a', 'b', 's'])
    expect(r.nodes.map((n) => n.id)).toEqual(['s', 'c'])
    expect(r.nodes[0].out).toEqual({})
  })

  it('dissolves nodes so the flow skips them', () => {
    const r = deleteNodes(g, ['a', 'b'], true)
    expect(r.nodes.map((n) => n.id)).toEqual(['s', 'c'])
    expect(r.nodes[0].out).toEqual({ next: 'c' })
  })

  it('duplicates a selection 48px down-right with the wires between its nodes', () => {
    const laid = graphOf(node('s', 'start', { next: 'a' }), node('a', 'wait', { next: 'b' }, 256, 64), node('b', 'wait', {}, 512, 64))
    const r = duplicateNodes(laid, ['a', 'b'], seq())
    expect(r.ids).toHaveLength(2)
    const [a2, b2] = r.ids.map((id) => r.graph.nodes.find((n) => n.id === id)!)
    expect([a2.x, a2.y]).toEqual([304, 112])
    expect([b2.x, b2.y]).toEqual([560, 112])
    expect(a2.out).toEqual({ next: b2.id })
    expect(duplicateNodes(laid, ['s'], seq())).toEqual({ graph: laid, ids: [] })
  })
})

describe('clipboard', () => {
  const g = graphOf(node('s', 'start', { next: 'a' }), node('a', 'showText', { next: 'b' }, 10, 20, { text: 'hi' }), node('b', 'end', {}, 300, 20))

  it('round-trips a fragment through the text format', () => {
    const f = extractFragment(g, ['a', 'b'])
    expect(parseFragment(serializeFragment(f))).toEqual(f)
  })

  it('rejects anything that is not a list of known nodes', () => {
    expect(parseFragment('not json')).toBeNull()
    expect(parseFragment('{}')).toBeNull()
    expect(parseFragment(JSON.stringify({ format: 'other', nodes: [] }))).toBeNull()
    expect(parseFragment(JSON.stringify({ format: 'elementals/graph-fragment', nodes: [] }))).toBeNull()
    expect(parseFragment(JSON.stringify({ format: 'elementals/graph-fragment', nodes: [{ id: 'x', type: 'teleport', params: {}, out: {}, x: 0, y: 0 }] }))).toBeNull()
    expect(parseFragment(JSON.stringify({ format: 'elementals/graph-fragment', nodes: [{ id: 'x', type: 'start', params: {}, out: {}, x: 0, y: 0 }] }))).toBeNull()
    expect(parseFragment(JSON.stringify({ format: 'elementals/graph-fragment', nodes: [{ id: 'x', type: 'wait', params: {}, out: {}, x: 'no', y: 0 }] }))).toBeNull()
  })

  it('keeps an in-memory copy that is independent of later edits', async () => {
    const f = extractFragment(g, ['a'])
    await writeFragmentClipboard(f)
    f.nodes[0].params.text = 'changed'
    expect(getMemoryClipboard()!.nodes[0].params).toEqual({ text: 'hi' })
    const read = getMemoryClipboard()!
    read.nodes[0].params.text = 'also changed'
    expect(getMemoryClipboard()!.nodes[0].params).toEqual({ text: 'hi' })
  })

  it('reads from the memory copy when the system clipboard is unavailable, and prefers valid system text', async () => {
    expect(await readFragmentClipboard()).toBeNull()
    await writeFragmentClipboard(extractFragment(g, ['a']))
    expect((await readFragmentClipboard())!.nodes.map((n) => n.id)).toEqual(['a'])
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: () => Promise.resolve(serializeFragment(extractFragment(g, ['b']))), writeText: () => Promise.resolve() },
      })
      expect((await readFragmentClipboard())!.nodes.map((n) => n.id)).toEqual(['b'])
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => Promise.resolve('plain text'), writeText: () => Promise.reject(new Error('denied')) } })
      expect((await readFragmentClipboard())!.nodes.map((n) => n.id)).toEqual(['a']) // falls back to memory
      await expect(writeFragmentClipboard(extractFragment(g, ['b']))).resolves.toBeUndefined() // a denied write is not an error
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else delete (navigator as { clipboard?: unknown }).clipboard
    }
  })
})

describe('frames', () => {
  const base = graphOf(node('s', 'start', { next: 'a' }, 0, 0), node('a', 'wait', { next: 'b' }, 320, 64), node('b', 'wait', {}, 576, 64), node('far', 'wait', {}, 2000, 2000))

  it('wraps nodes in a padded frame with a colour and the default title', () => {
    const r = addFrameAround(base, ['a', 'b'], undefined, seq())
    const f = r.graph.frames[0]
    expect(r.id).toBe(f.id)
    expect(f.title).toBe('Group')
    expect(f.x).toBeLessThan(320)
    expect(f.y).toBeLessThan(64)
    expect(f.x + f.w).toBeGreaterThan(576 + 200)
    expect(addFrameAround(base, ['zzz'], 'x', seq())).toEqual({ graph: base, id: null })
    const second = addFrameAround(r.graph, ['far'], 'Other', seq())
    expect(second.graph.frames[1].color).not.toBe(f.color)
  })

  it('membership is geometric: nodes whose centre is inside', () => {
    const r = addFrameAround(base, ['a', 'b'], 'G', seq())
    expect(nodesInFrame(r.graph, r.id!).map((n) => n.id)).toEqual(['a', 'b'])
    expect(nodeInFrame({ x: 100000, y: 0 }, r.graph.frames[0])).toBe(false)
    expect(nodesInFrame(r.graph, 'nope')).toEqual([])
  })

  it('never counts the start node as a member', () => {
    const g = { ...base, frames: [{ id: 'f', title: '', color: '#000000', x: -100, y: -100, w: 5000, h: 5000 }] }
    expect(nodesInFrame(g, 'f').map((n) => n.id)).toEqual(['a', 'b', 'far'])
  })

  it('moving a frame moves the nodes inside it and nothing else', () => {
    const r = addFrameAround(base, ['a', 'b'], 'G', seq())
    const moved = moveFrame(r.graph, r.id!, 32, -16)
    expect(moved.frames[0]).toMatchObject({ x: r.graph.frames[0].x + 32, y: r.graph.frames[0].y - 16 })
    const at = Object.fromEntries(moved.nodes.map((n) => [n.id, [n.x, n.y]]))
    expect(at.a).toEqual([352, 48])
    expect(at.b).toEqual([608, 48])
    expect(at.far).toEqual([2000, 2000])
    expect(at.s).toEqual([0, 0])
    expect(moveFrame(r.graph, r.id!, 0, 0)).toBe(r.graph)
    expect(moveFrame(r.graph, 'nope', 5, 5)).toBe(r.graph)
  })

  it('updates and removes a frame', () => {
    const r = addFrameAround(base, ['a'], 'G', seq())
    expect(updateFrame(r.graph, r.id!, { title: 'Renamed' }).frames[0].title).toBe('Renamed')
    expect(updateFrame(r.graph, 'nope', { title: 'x' })).toBe(r.graph)
    expect(removeFrame(r.graph, r.id!).frames).toEqual([])
    expect(removeFrame(r.graph, 'nope')).toBe(r.graph)
  })
})

describe('isEditableNode', () => {
  it('everything but start can be edited', () => {
    expect(isEditableNode({ type: 'start' })).toBe(false)
    expect(isEditableNode({ type: 'wait' })).toBe(true)
    expect(isEditableNode({ type: 'end' })).toBe(true)
  })
})

it('commandNodes ignores structural nodes', () => {
  expect(commandNodes(graphOf(node('s', 'start'), node('a', 'wait'), node('j', 'junction'), node('e', 'end'))).map((n) => n.id)).toEqual(['a'])
})
