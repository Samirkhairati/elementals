/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  addNode,
  addNodeFrom,
  cloneGraph,
  normalizeGraph,
  extractFragment,
  pasteFragment,
  commandsToGraph,
  connect,
  createCommand,
  createGraph,
  createGraphNode,
  createSequentialIdGenerator,
  disconnect,
  dissolveNode,
  edgesOf,
  findStart,
  findYieldlessCycles,
  getBranchDefs,
  getPortDefs,
  layoutGraph,
  migrateMap,
  moveNode,
  reachableFromStart,
  removeNode,
  removeNodes,
  updateNodeParams,
  validateGraph,
} from '../../../shared/engine/index'
import type { Command, EventGraph, GraphNode } from '../../../shared/engine/index'

const seq = () => createSequentialIdGenerator('n')
const node = (id: string, type: string, out: Record<string, string> = {}, params: Record<string, unknown> = {}): GraphNode => ({
  id,
  type,
  params,
  out,
  x: 0,
  y: 0,
})
const graphOf = (...nodes: GraphNode[]): EventGraph => ({ nodes, frames: [] })
const codes = (g: unknown, ctx = {}) => validateGraph(g, ctx).map((i) => `${i.code}${i.nodeId ? `@${i.nodeId}` : ''}`)

describe('getPortDefs', () => {
  it('start and junction have next, end has none', () => {
    expect(getPortDefs({ type: 'start', params: {} }).map((p) => p.id)).toEqual(['next'])
    expect(getPortDefs({ type: 'junction', params: {} }).map((p) => p.id)).toEqual(['next'])
    expect(getPortDefs({ type: 'end', params: {} })).toEqual([])
  })

  it('plain commands have next; branching commands only their branches', () => {
    expect(getPortDefs({ type: 'showText', params: {} }).map((p) => p.id)).toEqual(['next'])
    expect(getPortDefs({ type: 'conditional', params: {} }).map((p) => p.id)).toEqual(['then', 'else'])
  })

  it('showChoices ports follow the options and the cancel setting', () => {
    const options = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
    expect(getPortDefs({ type: 'showChoices', params: { options, cancel: 'none' } }).map((p) => p.id)).toEqual(['a', 'b'])
    expect(getPortDefs({ type: 'showChoices', params: { options, cancel: 'branch' } }).map((p) => p.id)).toEqual(['a', 'b', 'cancel'])
  })

  it('branchStage has one port per chosen value plus default, and no next', () => {
    expect(getPortDefs({ type: 'branchStage', params: { id: 'cat', cases: ['accepted', 'found'] } }).map((p) => p.id)).toEqual(['accepted', 'found', 'default'])
    expect(getPortDefs({ type: 'branchStage', params: { id: 'cat', cases: [] } }).map((p) => p.id)).toEqual(['default'])
    // duplicates, non-strings and a value literally called "default" cannot create clashing ports
    expect(getPortDefs({ type: 'branchStage', params: { id: 'cat', cases: ['a', 'a', 5, 'default', ''] } }).map((p) => p.id)).toEqual(['a', 'default'])
  })

  it('setStage is a plain node with a next port', () => {
    expect(getPortDefs({ type: 'setStage', params: {} }).map((p) => p.id)).toEqual(['next'])
  })

  it('tree-only flow commands and unknown types expose nothing', () => {
    for (const type of ['loop', 'breakLoop', 'exitEvent', 'nope']) expect(getPortDefs({ type, params: {} })).toEqual([])
  })
})

describe('graph edits', () => {
  it('createGraph holds just a start node; a second start is refused', () => {
    const g = createGraph(seq())
    expect(g.nodes.map((n) => n.type)).toEqual(['start'])
    expect(addNode(g, createGraphNode('start', {}, seq()))).toBe(g)
  })

  it('addNode refuses a duplicate id', () => {
    const g = addNode(createGraph(seq()), node('a', 'showText'))
    expect(addNode(g, node('a', 'wait'))).toBe(g)
  })

  it('connect wires a port, replaces an existing wire, and refuses bad wires', () => {
    let g = graphOf(node('s', 'start'), node('a', 'showText'), node('b', 'wait'), node('c', 'conditional'))
    g = connect(g, 's', 'next', 'a')
    expect(g.nodes[0].out).toEqual({ next: 'a' })
    g = connect(g, 's', 'next', 'b')
    expect(g.nodes[0].out).toEqual({ next: 'b' })
    expect(connect(g, 's', 'next', 's')).toBe(g) // self loop
    expect(connect(g, 'a', 'next', 's')).toBe(g) // into start
    expect(connect(g, 'a', 'bogus', 'b')).toBe(g) // unknown port
    expect(connect(g, 'c', 'next', 'b')).toBe(g) // conditional has no next
    expect(connect(g, 'x', 'next', 'b')).toBe(g) // unknown source
    expect(connect(g, 's', 'next', 'x')).toBe(g) // unknown target
    expect(connect(g, 's', 'next', 'b')).toBe(g) // already wired the same
  })

  it('disconnect removes a wire and is a no-op otherwise', () => {
    const g = graphOf(node('s', 'start', { next: 'a' }), node('a', 'showText'))
    expect(disconnect(g, 's', 'next').nodes[0].out).toEqual({})
    expect(disconnect(g, 'a', 'next')).toBe(g)
  })

  it('removeNode drops the node and every wire into it; start cannot be removed', () => {
    const g = graphOf(node('s', 'start', { next: 'a' }), node('a', 'showText', { next: 'b' }), node('b', 'wait'))
    const r = removeNode(g, 'a')
    expect(r.nodes.map((n) => n.id)).toEqual(['s', 'b'])
    expect(r.nodes[0].out).toEqual({})
    expect(removeNode(g, 's')).toBe(g)
    expect(removeNodes(g, ['a', 'b']).nodes.map((n) => n.id)).toEqual(['s'])
  })

  it('dissolveNode bridges its inputs to its next target', () => {
    const g = graphOf(node('s', 'start', { next: 'a' }), node('a', 'showText', { next: 'b' }), node('b', 'wait'))
    const r = dissolveNode(g, 'a')
    expect(r.nodes.map((n) => n.id)).toEqual(['s', 'b'])
    expect(r.nodes[0].out).toEqual({ next: 'b' })
  })

  it('dissolveNode on a branching node is a plain removal', () => {
    const g = graphOf(node('s', 'start', { next: 'c' }), node('c', 'conditional', { then: 'a' }), node('a', 'wait'))
    const r = dissolveNode(g, 'c')
    expect(r.nodes.map((n) => n.id)).toEqual(['s', 'a'])
    expect(r.nodes[0].out).toEqual({})
  })

  it('moveNode only changes the position', () => {
    const g = graphOf(node('s', 'start'))
    expect(moveNode(g, 's', 5, 6).nodes[0]).toMatchObject({ x: 5, y: 6 })
    expect(moveNode(g, 's', 0, 0)).toBe(g)
  })

  it('updateNodeParams drops wires of choice options that were removed', () => {
    const options = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
    const g = graphOf(node('c', 'showChoices', { a: 'x', b: 'y' }, { options, cancel: 'none' }), node('x', 'wait'), node('y', 'wait'))
    const r = updateNodeParams(g, 'c', { options: [options[0]] })
    expect(r.nodes[0].out).toEqual({ a: 'x' })
    expect(r.nodes[0].params.options).toEqual([options[0]])
    expect(updateNodeParams(g, 'c', { cancel: 'none' })).toBe(g)
  })

  describe('addNodeFrom', () => {
    it('adds a node wired from a port', () => {
      const g = graphOf(node('s', 'start'))
      const r = addNodeFrom(g, node('a', 'showText'), { nodeId: 's', port: 'next' })
      expect(r.nodes.map((n) => n.id)).toEqual(['s', 'a'])
      expect(r.nodes[0].out).toEqual({ next: 'a' })
    })

    it('inserts into an existing wire: the new node takes over the old target', () => {
      const g = graphOf(node('s', 'start', { next: 'b' }), node('b', 'wait'))
      const r = addNodeFrom(g, node('a', 'showText'), { nodeId: 's', port: 'next' })
      expect(r.nodes.find((n) => n.id === 's')!.out).toEqual({ next: 'a' })
      expect(r.nodes.find((n) => n.id === 'a')!.out).toEqual({ next: 'b' })
    })

    it('a branching node does not take over (it has no next); the old target is dropped from the wire only', () => {
      const g = graphOf(node('s', 'start', { next: 'b' }), node('b', 'wait'))
      const r = addNodeFrom(g, node('c', 'conditional'), { nodeId: 's', port: 'next' })
      expect(r.nodes.find((n) => n.id === 'c')!.out).toEqual({})
      expect(r.nodes.find((n) => n.id === 's')!.out).toEqual({ next: 'c' })
    })

    it('without a source, with a missing source or with a port the source lacks, it only adds', () => {
      const g = graphOf(node('s', 'start'))
      expect(addNodeFrom(g, node('a', 'wait')).nodes.map((n) => n.id)).toEqual(['s', 'a'])
      expect(addNodeFrom(g, node('a', 'wait'), { nodeId: 'zz', port: 'next' }).nodes[0].out).toEqual({})
      expect(addNodeFrom(g, node('a', 'wait'), { nodeId: 's', port: 'then' }).nodes[0].out).toEqual({})
    })

    it('refuses a duplicate id', () => {
      const g = graphOf(node('s', 'start'), node('a', 'wait'))
      expect(addNodeFrom(g, node('a', 'wait'), { nodeId: 's', port: 'next' })).toBe(g)
    })
  })

  describe('fragments', () => {
    const g = graphOf(
      { ...node('s', 'start', { next: 'a' }), x: 0, y: 0 },
      { ...node('a', 'showText', { next: 'b' }, { text: 'hi' }), x: 300, y: 100 },
      { ...node('b', 'wait', { next: 'c' }), x: 560, y: 160 },
      { ...node('c', 'end'), x: 820, y: 100 },
    )

    it('extracts the selection with relative positions and only the wires inside it', () => {
      const f = extractFragment(g, ['a', 'b'])
      expect(f.nodes.map((n) => [n.id, n.x, n.y, n.out])).toEqual([
        ['a', 0, 0, { next: 'b' }],
        ['b', 260, 60, {}], // b -> c leaves the selection
      ])
    })

    it('never copies start', () => {
      expect(extractFragment(g, ['s', 'a']).nodes.map((n) => n.id)).toEqual(['a'])
      expect(extractFragment(g, []).nodes).toEqual([])
    })

    it('pastes with fresh ids, remapped wires and an offset, leaving the original alone', () => {
      const f = extractFragment(g, ['a', 'b'])
      const r = pasteFragment(g, f, { x: 10, y: 500 }, seq())
      expect(r.ids).toHaveLength(2)
      expect(r.ids.every((id) => !g.nodes.some((n) => n.id === id))).toBe(true)
      const [a2, b2] = r.ids.map((id) => r.graph.nodes.find((n) => n.id === id)!)
      expect(a2.type).toBe('showText')
      expect(a2.params).toEqual({ text: 'hi' })
      expect(a2.params).not.toBe(g.nodes[1].params)
      expect(a2.out).toEqual({ next: b2.id })
      expect([a2.x, a2.y, b2.x, b2.y]).toEqual([10, 500, 270, 560])
      expect(r.graph.nodes.slice(0, 4)).toEqual(g.nodes)
    })

    it('carries frames along, positioned relative to the selection, with fresh ids when pasted', () => {
      const framed = { ...g, frames: [{ id: 'f1', title: 'Intro', color: '#64748b', x: 280, y: 80, w: 400, h: 200 }] }
      const f = extractFragment(framed, ['a', 'b'], ['f1'])
      expect(f.frames).toEqual([{ id: 'f1', title: 'Intro', color: '#64748b', x: 0, y: 0, w: 400, h: 200 }])
      expect(f.nodes.map((n) => [n.x, n.y])).toEqual([[20, 20], [280, 80]])
      expect(extractFragment(framed, ['a']).frames).toBeUndefined()
      const r = pasteFragment(framed, f, { x: 100, y: 700 }, seq())
      expect(r.frameIds).toHaveLength(1)
      expect(r.frameIds[0]).not.toBe('f1')
      expect(r.graph.frames).toHaveLength(2)
      expect(r.graph.frames[1]).toMatchObject({ id: r.frameIds[0], title: 'Intro', x: 100, y: 700, w: 400, h: 200 })
    })

    it('a pasted fragment can be pasted again; start in a fragment is skipped', () => {
      const f = extractFragment(g, ['a'])
      const idFn = seq()
      const once = pasteFragment(g, f, { x: 0, y: 0 }, idFn)
      const twice = pasteFragment(once.graph, f, { x: 0, y: 0 }, idFn)
      expect(new Set(twice.graph.nodes.map((n) => n.id)).size).toBe(twice.graph.nodes.length)
      expect(pasteFragment(g, { nodes: [node('s', 'start')] }, { x: 0, y: 0 }, seq()).ids).toEqual([])
    })
  })

  it('never mutates its input', () => {
    const g = graphOf(node('s', 'start', { next: 'a' }), node('a', 'showText'))
    const copy = structuredClone(g)
    connect(g, 'a', 'next', 's')
    removeNode(g, 'a')
    dissolveNode(g, 'a')
    moveNode(g, 'a', 1, 1)
    updateNodeParams(g, 'a', { text: 'x' })
    expect(g).toEqual(copy)
  })
})

describe('queries', () => {
  const g = graphOf(
    node('s', 'start', { next: 'a' }),
    node('a', 'conditional', { then: 'b', else: 'c' }),
    node('b', 'wait', { next: 'd' }),
    node('c', 'wait', { next: 'd' }),
    node('d', 'end'),
    node('lost', 'wait'),
  )

  it('edgesOf lists wires with unique ids and skips dangling ones', () => {
    const edges = edgesOf(graphOf(node('s', 'start', { next: 'a' }), node('a', 'wait', { next: 'gone' })))
    expect(edges).toEqual([{ id: 's:next', from: 's', port: 'next', to: 'a' }])
    expect(new Set(edgesOf(g).map((e) => e.id)).size).toBe(edgesOf(g).length)
  })

  it('reachableFromStart follows every port', () => {
    expect([...reachableFromStart(g)].sort()).toEqual(['a', 'b', 'c', 'd', 's'])
    expect(reachableFromStart(graphOf(node('a', 'wait'))).size).toBe(0)
  })

  it('findYieldlessCycles flags loops that never wait, not loops through a waiting node', () => {
    const spin = graphOf(node('s', 'start', { next: 'j' }), node('j', 'junction', { next: 'v' }), node('v', 'setSwitch', { next: 'j' }))
    expect([...findYieldlessCycles(spin)].sort()).toEqual(['j', 'v'])
    const ok = graphOf(node('s', 'start', { next: 'j' }), node('j', 'junction', { next: 'w' }), node('w', 'wait', { next: 'j' }))
    expect(findYieldlessCycles(ok).size).toBe(0)
  })

  it('a self-loop on a non-waiting node is a yieldless cycle', () => {
    const g2 = graphOf(node('s', 'start', { next: 'j' }), node('j', 'junction', { next: 'j' }))
    expect([...findYieldlessCycles(g2)]).toEqual(['j'])
  })
})

describe('validateGraph', () => {
  it('accepts a clean graph', () => {
    const g = graphOf(node('s', 'start', { next: 'a' }), node('a', 'showText', { next: 'e' }, { speaker: '', text: 'hi' }), node('e', 'end'))
    expect(codes(g)).toEqual([])
  })

  it('reports structural problems', () => {
    expect(codes(null)).toEqual(['bad-graph'])
    expect(codes({ nodes: 5 })).toEqual(['bad-graph'])
    expect(codes(graphOf(node('a', 'wait')))).toContain('no-start')
    expect(codes(graphOf(node('s', 'start'), node('t', 'start')))).toContain('multiple-start@t')
    expect(codes(graphOf(node('s', 'start'), node('s', 'wait')))).toContain('duplicate-node-id@s')
  })

  it('reports bad wiring', () => {
    const g = graphOf(
      node('s', 'start', { next: 'a', extra: 'a' }),
      node('a', 'wait', { next: 'gone' }),
      node('b', 'wait', { next: 's' }),
    )
    const c = codes(g)
    expect(c).toContain('unknown-port@s')
    expect(c).toContain('dangling-edge@a')
    expect(c).toContain('edge-into-start@b')
  })

  it('rejects tree-only commands but lets unconnected nodes float without a problem', () => {
    const g = graphOf(node('s', 'start', { next: 'l' }), node('l', 'loop'), node('x', 'wait'))
    const c = codes(g)
    expect(c).toContain('legacy-flow-node@l')
    expect(c.some((code) => code.endsWith('@x'))).toBe(false)
    expect(validateGraph(g).find((i) => i.code === 'unreachable')).toBeUndefined()
  })

  it('rejects a loop with nothing that waits', () => {
    const g = graphOf(node('s', 'start', { next: 'j' }), node('j', 'junction', { next: 'j' }))
    expect(codes(g)).toContain('cycle-without-wait@j')
  })

  it('checks command params and references like the tree validator does', () => {
    const g = graphOf(node('s', 'start', { next: 'a' }), node('a', 'setSwitch', {}, { id: 'ghost', value: true }))
    expect(codes(g, { switchIds: ['known'] })).toContain('dangling-switch@a')
    expect(codes(graphOf(node('s', 'start', { next: 'a' }), node('a', 'nope')))).toContain('unknown-command@a')
  })

  it('validates stage references in nodes and in branchStage values', () => {
    const ctx = { stageIds: ['cat'], stageValues: { cat: ['none', 'found'] } }
    const ok = graphOf(
      node('s', 'start', { next: 'set' }),
      node('set', 'setStage', { next: 'b' }, { id: 'cat', mode: 'set', value: 'found' }),
      node('b', 'branchStage', { found: 'e', default: 'e' }, { id: 'cat', cases: ['found'] }),
      node('e', 'end'),
    )
    expect(codes(ok, ctx)).toEqual([])
    const bad = graphOf(
      node('s', 'start', { next: 'set' }),
      node('set', 'setStage', { next: 'b' }, { id: 'ghost', mode: 'set', value: 'x' }),
      node('b', 'branchStage', { gone: 'e' }, { id: 'cat', cases: ['nope'] }),
      node('e', 'end'),
    )
    const c = codes(bad, ctx)
    expect(c).toContain('dangling-stage@set')
    expect(c).toContain('dangling-stage-value@b')
    expect(c).toContain('unknown-port@b') // the wire on "gone" has no port
  })

  it('does not throw on garbage', () => {
    expect(() => validateGraph({ nodes: [1, null, { id: 5 }, { id: 'x', type: 3, params: 'p', out: 7 }] })).not.toThrow()
  })
})

describe('commandsToGraph', () => {
  const ids = () => createSequentialIdGenerator('c')
  const c = (type: string, params: Record<string, unknown> = {}, idFn = ids()) => createCommand(type, params, idFn)

  it('turns a list into a chain from start and keeps command ids', () => {
    const a = { ...c('showText'), id: 'A' }
    const b = { ...c('wait'), id: 'B' }
    const g = commandsToGraph([a, b], seq())
    expect(g.nodes.map((n) => n.id)).toEqual([findStart(g)!.id, 'A', 'B'])
    expect(findStart(g)!.out).toEqual({ next: 'A' })
    expect(g.nodes[1].out).toEqual({ next: 'B' })
    expect(g.nodes[2].out).toEqual({})
  })

  it('an empty list is just the start node', () => {
    const g = commandsToGraph([], seq())
    expect(g.nodes.map((n) => n.type)).toEqual(['start'])
    expect(g.nodes[0].out).toEqual({})
  })

  it('conditional branches rejoin at what follows; empty branches wire straight to it', () => {
    const cond: Command = { ...c('conditional'), id: 'K', branches: { then: [{ ...c('showText'), id: 'T' }], else: [] } }
    const after: Command = { ...c('wait'), id: 'W' }
    const g = commandsToGraph([cond, after], seq())
    const by = Object.fromEntries(g.nodes.map((n) => [n.id, n]))
    expect(by.K.out).toEqual({ then: 'T', else: 'W' })
    expect(by.T.out).toEqual({ next: 'W' })
  })

  it('showChoices gets one wire per option', () => {
    const options = [{ id: 'o1', label: 'Yes' }, { id: 'o2', label: 'No' }]
    const ch: Command = { ...c('showChoices', { options, cancel: 'branch' }), id: 'H', branches: { o1: [{ ...c('showText'), id: 'Y' }], o2: [], cancel: [{ ...c('showText'), id: 'X' }] } }
    const g = commandsToGraph([ch, { ...c('wait'), id: 'W' }], seq())
    const by = Object.fromEntries(g.nodes.map((n) => [n.id, n]))
    expect(by.H.out).toEqual({ o1: 'Y', o2: 'W', cancel: 'X' })
    expect(by.Y.out).toEqual({ next: 'W' })
    expect(by.X.out).toEqual({ next: 'W' })
  })

  it('loop becomes a junction head the body leads back to; breakLoop leaves the cycle', () => {
    const brk: Command = { ...c('breakLoop'), id: 'B' }
    const guard: Command = { ...c('conditional'), id: 'G', branches: { then: [brk], else: [] } }
    const loop: Command = { ...c('loop'), id: 'L', branches: { body: [{ ...c('wait'), id: 'W' }, guard] } }
    const g = commandsToGraph([loop, { ...c('showText'), id: 'AFTER' }], seq())
    const by = Object.fromEntries(g.nodes.map((n) => [n.id, n]))
    expect(by.L.type).toBe('junction')
    expect(by.L.out).toEqual({ next: 'W' })
    expect(by.W.out).toEqual({ next: 'G' })
    expect(by.G.out).toEqual({ then: 'AFTER', else: 'L' })
    expect(by.B).toBeUndefined()
    expect(validateGraph(g).filter((i) => i.severity === 'error')).toEqual([])
  })

  it('exitEvent becomes an end node; commands after it stay as unreachable nodes', () => {
    const g = commandsToGraph([{ ...c('showText'), id: 'A' }, { ...c('exitEvent'), id: 'X' }, { ...c('wait'), id: 'DEAD' }], seq())
    const by = Object.fromEntries(g.nodes.map((n) => [n.id, n]))
    expect(by.X.type).toBe('end')
    expect(by.A.out).toEqual({ next: 'X' })
    expect(by.DEAD).toBeDefined()
    expect(reachableFromStart(g).has('DEAD')).toBe(false)
  })

  it('a breakLoop outside of any loop is ignored: the flow continues past it', () => {
    const g = commandsToGraph([{ ...c('breakLoop'), id: 'B' }, { ...c('showText'), id: 'A' }], seq())
    expect(g.nodes.find((n) => n.id === 'B')).toBeUndefined()
    expect(findStart(g)!.out).toEqual({ next: 'A' })
  })

  it('keeps the content of branches the command no longer exposes, unwired', () => {
    const cond: Command = { ...c('conditional'), id: 'K', branches: { then: [], else: [], old: [{ ...c('wait'), id: 'ORPHAN' }] } }
    const g = commandsToGraph([cond], seq())
    expect(g.nodes.find((n) => n.id === 'ORPHAN')).toBeDefined()
    expect(g.nodes.find((n) => n.id === 'K')!.out).toEqual({})
  })

  it('does not mutate or share params with the tree', () => {
    const cmd = c('showText', { text: 'hi' })
    const before = structuredClone(cmd)
    const g = commandsToGraph([cmd], seq())
    expect(cmd).toEqual(before)
    expect(g.nodes[1].params).toEqual(cmd.params)
    expect(g.nodes[1].params).not.toBe(cmd.params)
  })
})

// ── the converted graph does exactly what the tree did ─────────────────────────────────────────────

/** Deterministic pseudo-random generator. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
  return h
}

function randomTree(seed: number): Command[] {
  const rand = rng(seed)
  let counter = 0
  const idFn = () => `r${seed}-${++counter}`
  const list = (depth: number, inLoop: boolean): Command[] => {
    const out: Command[] = []
    const n = Math.floor(rand() * 4)
    for (let i = 0; i < n; i++) {
      const roll = rand()
      if (roll < 0.35 || depth >= 3) out.push(createCommand(rand() < 0.5 ? 'showText' : 'setSwitch', {}, idFn))
      else if (roll < 0.55) {
        const cmd = createCommand('conditional', {}, idFn)
        cmd.branches = { then: list(depth + 1, inLoop), else: list(depth + 1, inLoop) }
        out.push(cmd)
      } else if (roll < 0.72) {
        const options = [{ id: `o${counter}a`, label: 'A' }, { id: `o${counter}b`, label: 'B' }]
        const cmd = createCommand('showChoices', { options, cancel: rand() < 0.5 ? 'branch' : 'none' }, idFn)
        cmd.branches = Object.fromEntries(getBranchDefs(cmd).map((b) => [b.id, list(depth + 1, inLoop)]))
        out.push(cmd)
      } else if (roll < 0.85) {
        const loop = createCommand('loop', {}, idFn)
        const guard = createCommand('conditional', {}, idFn)
        guard.branches = { then: [createCommand('breakLoop', {}, idFn)], else: [] }
        loop.branches = { body: [createCommand('wait', {}, idFn), ...list(depth + 1, true), guard] }
        out.push(loop)
      } else if (roll < 0.9 && inLoop) out.push(createCommand('breakLoop', {}, idFn))
      else if (roll < 0.95) out.push(createCommand('exitEvent', {}, idFn))
      else out.push(createCommand('wait', {}, idFn))
    }
    return out
  }
  return list(0, false)
}

const LIMIT = 80

/** Runs a command tree the way the legacy interpreter does and records the executed command types. */
function traceTree(commands: Command[]): string[] {
  const trace: string[] = []
  const visits = new Map<string, number>()
  const pick = (cmd: Command, ports: string[]) => {
    const v = visits.get(cmd.id) ?? 0
    visits.set(cmd.id, v + 1)
    return ports[(hash(cmd.id) + v * 7) % ports.length]
  }
  const runList = (list: readonly Command[]): 'next' | 'break' | 'exit' | 'limit' => {
    for (const cmd of list) {
      if (trace.length >= LIMIT) return 'limit'
      const f = run(cmd)
      if (f !== 'next') return f
    }
    return 'next'
  }
  const run = (cmd: Command): 'next' | 'break' | 'exit' | 'limit' => {
    switch (cmd.type) {
      case 'breakLoop':
        return 'break'
      case 'exitEvent':
        return 'exit'
      case 'loop':
        for (;;) {
          const f = runList(cmd.branches?.body ?? [])
          if (f === 'exit' || f === 'limit') return f
          if (f === 'break') return 'next'
        }
    }
    trace.push(cmd.type)
    const ports = getBranchDefs(cmd).map((b) => b.id)
    return ports.length > 0 ? runList(cmd.branches?.[pick(cmd, ports)] ?? []) : 'next'
  }
  runList(commands)
  return trace
}

/** Runs a graph and records the executed command types. */
function traceGraph(graph: EventGraph): string[] {
  const trace: string[] = []
  const visits = new Map<string, number>()
  const by = new Map(graph.nodes.map((n) => [n.id, n]))
  let cursor = findStart(graph)!.out.next as string | undefined
  while (cursor && trace.length < LIMIT) {
    const n = by.get(cursor)!
    if (n.type === 'end') break
    if (n.type === 'junction') {
      cursor = n.out.next
      continue
    }
    trace.push(n.type)
    const ports = getPortDefs(n).map((p) => p.id)
    if (ports.length === 1 && ports[0] === 'next') cursor = n.out.next
    else {
      const v = visits.get(n.id) ?? 0
      visits.set(n.id, v + 1)
      cursor = n.out[ports[(hash(n.id) + v * 7) % ports.length]]
    }
  }
  return trace
}

describe('commandsToGraph keeps behaviour', () => {
  it('runs the same commands in the same order as the tree for 300 random events', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const tree = randomTree(seed)
      const graph = commandsToGraph(tree, seq())
      expect(traceGraph(graph), `seed ${seed}`).toEqual(traceTree(tree))
      expect(validateGraph(graph).filter((i) => i.severity === 'error'), `seed ${seed}`).toEqual([])
    }
  })
})

// ── real project maps ───────────────────────────────────────────────────────────────────────────────

describe('real project maps', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'project', 'maps')

  it('every event state converts to a graph without errors', () => {
    let states = 0
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const map = migrateMap(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))).value as any
      for (const entity of map.entities ?? []) {
        for (const state of entity.components?.Event?.states ?? []) {
          states++
          const graph = state.graph
          expect(validateGraph(graph).filter((i) => i.severity === 'error'), `${file}/${entity.id}`).toEqual([])
        }
      }
    }
    expect(states).toBeGreaterThan(0)
  })
})

describe('normalizeGraph', () => {
  it('keeps a well-formed graph as it is', () => {
    const g = graphOf({ ...node('s', 'start', { next: 'a' }), x: 5, y: 6 }, node('a', 'wait', {}, { ms: 5 }))
    expect(normalizeGraph(g)).toEqual({ ...g, frames: [] })
  })

  it('adds a start node when there is none and keeps only the first of several', () => {
    const none = normalizeGraph({ nodes: [node('a', 'wait')] }, seq())
    expect(none.nodes.map((n) => n.type)).toEqual(['start', 'wait'])
    const several = normalizeGraph({ nodes: [node('s1', 'start'), node('s2', 'start'), node('a', 'wait')] })
    expect(several.nodes.map((n) => n.id)).toEqual(['s1', 'a'])
  })

  it('repairs fields and drops what cannot be a node', () => {
    const g = normalizeGraph({
      nodes: [
        { id: 'a', type: 'wait', params: 5, out: { next: 'b', bad: 7 }, x: 'no', y: NaN },
        { id: 'a', type: 'wait' }, // duplicate id
        { id: '', type: 'wait' },
        { id: 'x' },
        null,
        'junk',
      ],
    })
    expect(g.nodes.map((n) => n.id)).toEqual([expect.any(String), 'a'])
    const a = g.nodes.find((n) => n.id === 'a')!
    expect(a).toEqual({ id: 'a', type: 'wait', params: {}, out: { next: 'b' }, x: 0, y: 0 })
  })

  it('keeps dangling wires so validation can report them', () => {
    const g = normalizeGraph({ nodes: [node('s', 'start', { next: 'gone' })] })
    expect(g.nodes[0].out).toEqual({ next: 'gone' })
    expect(validateGraph(g).map((i) => i.code)).toContain('dangling-edge')
  })

  it('repairs frames', () => {
    const g = normalizeGraph({
      nodes: [],
      frames: [{ id: 'f', title: 5, color: 'red', x: 1, y: 2, w: 10, h: 'x' }, { id: 'f' }, { title: 'no id' }, 3],
    })
    expect(g.frames).toEqual([{ id: 'f', title: '', color: '#64748b', x: 1, y: 2, w: 40, h: 160 }])
  })

  it('accepts anything without throwing', () => {
    for (const bad of [null, undefined, 5, 'x', [], { nodes: 'no', frames: 4 }]) expect(normalizeGraph(bad).nodes.map((n) => n.type)).toEqual(['start'])
  })
})

describe('cloneGraph', () => {
  const g = {
    nodes: [node('s', 'start', { next: 'a' }), node('a', 'wait', { next: 'b', odd: 'outside' }, { ms: 5 }), node('b', 'end')],
    frames: [{ id: 'f', title: 'T', color: '#000000', x: 0, y: 0, w: 100, h: 100 }],
  }

  it('is a deep copy that keeps ids by default', () => {
    const c = cloneGraph(g)
    expect(c).toEqual(g)
    expect(c.nodes[1].params).not.toBe(g.nodes[1].params)
    c.nodes[1].params.ms = 9
    expect(g.nodes[1].params.ms).toBe(5)
  })

  it('with fresh ids renames nodes and frames and the wires follow; unknown targets stay as they were', () => {
    const c = cloneGraph(g, true, seq())
    expect(c.nodes.map((n) => n.id)).toEqual(['n-1', 'n-2', 'n-3'])
    expect(c.nodes[0].out).toEqual({ next: 'n-2' })
    expect(c.nodes[1].out).toEqual({ next: 'n-3', odd: 'outside' })
    expect(c.frames[0].id).toBe('n-4')
    expect(g.nodes[0].id).toBe('s')
  })
})

describe('layoutGraph', () => {
  const chain = (): EventGraph =>
    graphOf(
      node('s', 'start', { next: 'c' }),
      node('c', 'conditional', { then: 'a', else: 'b' }),
      node('a', 'wait', { next: 'z' }),
      node('b', 'wait', { next: 'b2' }),
      node('b2', 'wait', { next: 'z' }),
      node('z', 'end'),
    )

  it('puts every node strictly right of its predecessors (longest path) and never overlaps', () => {
    const g = layoutGraph(chain())
    const at = Object.fromEntries(g.nodes.map((n) => [n.id, n]))
    for (const e of edgesOf(g)) expect(at[e.to].x, `${e.from}->${e.to}`).toBeGreaterThan(at[e.from].x)
    expect(at.z.x).toBeGreaterThan(at.b2.x) // the rejoin sits after the LONGER branch
    expect(new Set(g.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(g.nodes.length)
    expect(at.s.x).toBe(0)
  })

  it('is deterministic and idempotent', () => {
    const once = layoutGraph(chain())
    expect(layoutGraph(chain())).toEqual(once)
    expect(layoutGraph(once)).toEqual(once)
  })

  it('handles cycles and unreachable nodes', () => {
    const g = layoutGraph(
      graphOf(
        node('s', 'start', { next: 'j' }),
        node('j', 'junction', { next: 'w' }),
        node('w', 'wait', { next: 'j' }),
        node('lost', 'wait', { next: 'lost2' }),
        node('lost2', 'wait'),
      ),
    )
    const at = Object.fromEntries(g.nodes.map((n) => [n.id, n]))
    expect(at.w.x).toBeGreaterThan(at.j.x)
    expect(at.lost.y).toBeGreaterThan(at.w.y) // unreachable block sits below
    expect(at.lost2.x).toBeGreaterThan(at.lost.x)
    expect(new Set(g.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(g.nodes.length)
  })

  it('does not mutate its input', () => {
    const g = chain()
    const copy = structuredClone(g)
    layoutGraph(g)
    expect(g).toEqual(copy)
  })
})
