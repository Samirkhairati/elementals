import { describe, it, expect } from 'vitest'
import {
  buildCommonManifest,
  commonCallsOf,
  createGraph,
  createGraphNode,
  connect,
  findCommonCycles,
  normalizeCommonEvent,
  parseCommonManifest,
  validateCommonEvents,
  validateGraph,
  findStart,
} from '../../../shared/engine/index'
import type { CommonEvent } from '../../../shared/engine/index'

function ev(id: string, calls: string[]): CommonEvent {
  let graph = createGraph()
  let prev = findStart(graph)!.id
  calls.forEach((target, i) => {
    const node = createGraphNode('callCommonEvent', { params: { id: target }, id: `n${i}` })
    graph = { ...graph, nodes: [...graph.nodes, node] }
    graph = connect(graph, prev, 'next', node.id)
    prev = node.id
  })
  return { version: 1, id, name: id, graph }
}

describe('common events', () => {
  it('normalizes untrusted input', () => {
    expect(normalizeCommonEvent(null)).toBeNull()
    expect(normalizeCommonEvent({ name: 'x' })).toBeNull()
    const e = normalizeCommonEvent({ id: 'a', folder: ' x / y/ ', graph: 'junk' })!
    expect(e.name).toBe('a')
    expect(e.folder).toBe('x/y')
    expect(findStart(e.graph)).toBeDefined()
  })

  it('lists the calls of a graph without duplicates or empties', () => {
    expect(commonCallsOf(ev('a', ['b', 'c', 'b', '']).graph)).toEqual(['b', 'c'])
  })

  it('finds every member of a cycle, not the callers', () => {
    const events = [ev('a', ['b']), ev('b', ['a']), ev('c', ['a']), ev('d', ['d']), ev('e', [])]
    expect([...findCommonCycles(events)].sort()).toEqual(['a', 'b', 'd'])
  })

  it('reports cycles and unknown ids as errors', () => {
    const issues = validateCommonEvents([ev('a', ['b']), ev('b', ['a']), ev('c', ['zzz'])])
    expect(issues.get('a')!.some((i) => i.code === 'common-cycle')).toBe(true)
    expect(issues.get('b')!.some((i) => i.code === 'common-cycle')).toBe(true)
    expect(issues.get('c')!.some((i) => i.code === 'dangling-common' && i.severity === 'error')).toBe(true)
  })

  it('validates callCommonEvent in any graph against ctx.commonIds', () => {
    const g = ev('x', ['known']).graph
    expect(validateGraph(g, { commonIds: ['known'] })).toEqual([])
    expect(validateGraph(g, { commonIds: [] }).map((i) => i.code)).toContain('dangling-common')
    expect(validateGraph(ev('x', ['']).graph, {}).map((i) => i.code)).toContain('missing-param')
  })

  it('builds a sorted manifest and parses it back', () => {
    const m = buildCommonManifest([ev('b', []), { id: 'a' }, ev('b', ['x']), null])
    expect(m.events.map((e) => e.id)).toEqual(['a', 'b'])
    expect(parseCommonManifest(m).map((e) => e.id)).toEqual(['a', 'b'])
    expect(parseCommonManifest('junk')).toEqual([])
  })
})
