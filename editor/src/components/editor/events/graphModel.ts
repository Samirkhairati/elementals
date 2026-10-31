// Pure helpers behind the graph canvas: where new nodes go, deleting/duplicating a selection, the
// copy/paste clipboard and comment frames. They sit on top of the shared graph helpers
// (shared/engine/graph.ts). No React in here, and every function returns new data.

import type { EventGraph, GraphFrame, GraphNode } from '../../../../../shared/engine/types'
import { getCommandDef } from '../../../../../shared/engine/commands'
import {
  GRAPH_END,
  GRAPH_JUNCTION,
  GRAPH_START,
  addNodeFrom,
  createGraphNode,
  dissolveNode,
  extractFragment,
  getNode,
  getPortDefs,
  isStructural,
  pasteFragment,
  removeNodes,
  type GraphFragment,
} from '../../../../../shared/engine/graph'
import { newId, type IdFn } from '../../../../../shared/engine/ids'
import { isRecord } from '../../../../../shared/engine/util'

/** Horizontal / vertical distance between nodes placed automatically. */
export const NODE_STEP_X = 260
export const NODE_STEP_Y = 120
/** Approximate size of a node on the canvas, used for overlap and frame membership checks. */
export const NODE_WIDTH = 220
export const NODE_HEIGHT = 84
const GRID = 16

export const snapToGrid = (v: number): number => Math.round(v / GRID) * GRID

// ── placing nodes ────────────────────────────────────────────────────────────────────────────────

function overlaps(graph: EventGraph, x: number, y: number): boolean {
  return graph.nodes.some((n) => Math.abs(n.x - x) < NODE_WIDTH * 0.9 && Math.abs(n.y - y) < NODE_HEIGHT * 0.9)
}

/** The first free spot at or below (x, y). */
export function findFreeSpot(graph: EventGraph, x: number, y: number): { x: number; y: number } {
  let yy = y
  for (let i = 0; i < 200 && overlaps(graph, x, yy); i++) yy += NODE_STEP_Y
  return { x, y: yy }
}

/**
 * Where a node created from a port goes: one step to the right of its source, level with the port's
 * row (branches fan out downwards), moved down until it is free.
 */
export function positionForNewNode(graph: EventGraph, from?: { nodeId: string; port: string }, at?: { x: number; y: number }): { x: number; y: number } {
  if (at) return findFreeSpot(graph, snapToGrid(at.x), snapToGrid(at.y))
  const source = from ? getNode(graph, from.nodeId) : undefined
  if (source) {
    const row = Math.max(0, getPortDefs(source).findIndex((p) => p.id === from!.port))
    return findFreeSpot(graph, snapToGrid(source.x + NODE_STEP_X), snapToGrid(source.y + row * NODE_STEP_Y))
  }
  const rightmost = graph.nodes.reduce((best, n) => (n.x > best.x ? n : best), graph.nodes[0] ?? { x: -NODE_STEP_X, y: 0 })
  return findFreeSpot(graph, snapToGrid(rightmost.x + NODE_STEP_X), snapToGrid(rightmost.y))
}

export interface AddNodeOptions {
  /** Wire the new node from this port (inserting into the wire when it already leads somewhere). */
  from?: { nodeId: string; port: string }
  /** Drop position; default: next to `from`. */
  at?: { x: number; y: number }
  params?: Record<string, unknown>
}

/** Creates a node of a catalog type (or `end` / `junction`) and adds it. Unknown types leave the graph alone. */
export function addCommandNode(graph: EventGraph, type: string, options: AddNodeOptions = {}, idFn: IdFn = newId): { graph: EventGraph; id: string | null } {
  if (type === GRAPH_START || (!isStructural(type) && !getCommandDef(type))) return { graph, id: null }
  const pos = positionForNewNode(graph, options.from, options.at)
  const node = createGraphNode(type, { params: options.params, x: pos.x, y: pos.y }, idFn)
  const next = addNodeFrom(graph, node, options.from)
  return next === graph ? { graph, id: null } : { graph: next, id: node.id }
}

// ── deleting / duplicating ───────────────────────────────────────────────────────────────────────

/**
 * Deletes nodes with their wires. With `dissolve` each node with a single output is cut out of its wire
 * instead (flow that went through it now skips it). `start` is never deleted.
 */
export function deleteNodes(graph: EventGraph, ids: readonly string[], dissolve = false): EventGraph {
  if (!dissolve) return removeNodes(graph, ids)
  return ids.reduce((g, id) => dissolveNode(g, id), graph)
}

/** Copies the nodes (and the wires between them) 40px down-right; returns the ids of the copies. */
export function duplicateNodes(graph: EventGraph, ids: readonly string[], idFn: IdFn = newId): { graph: EventGraph; ids: string[] } {
  const fragment = extractFragment(graph, ids)
  if (fragment.nodes.length === 0) return { graph, ids: [] }
  const source = graph.nodes.filter((n) => fragment.nodes.some((f) => f.id === n.id))
  const left = Math.min(...source.map((n) => n.x))
  const top = Math.min(...source.map((n) => n.y))
  return pasteFragment(graph, fragment, { x: snapToGrid(left + 48), y: snapToGrid(top + 48) }, idFn)
}

// ── clipboard ────────────────────────────────────────────────────────────────────────────────────

const CLIPBOARD_FORMAT = 'elementals/graph-fragment'
let memoryClipboard: GraphFragment | null = null

export function serializeFragment(fragment: GraphFragment): string {
  return JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, nodes: fragment.nodes })
}

function isKnownNode(n: unknown): n is GraphNode {
  if (!isRecord(n) || typeof n.id !== 'string' || typeof n.type !== 'string') return false
  if (n.type === GRAPH_START) return false
  if (!isStructural(n.type) && !getCommandDef(n.type)) return false
  return isRecord(n.params) && isRecord(n.out) && typeof n.x === 'number' && typeof n.y === 'number'
}

/** Parses clipboard text; null when it is not a list of known nodes. */
export function parseFragment(text: string): GraphFragment | null {
  try {
    const data = JSON.parse(text) as { format?: unknown; nodes?: unknown }
    if (data?.format !== CLIPBOARD_FORMAT || !Array.isArray(data.nodes) || data.nodes.length === 0) return null
    return data.nodes.every(isKnownNode) ? { nodes: data.nodes } : null
  } catch {
    return null
  }
}

export function setMemoryClipboard(fragment: GraphFragment | null): void {
  memoryClipboard = fragment ? { nodes: structuredClone(fragment.nodes) } : null
}

export function getMemoryClipboard(): GraphFragment | null {
  return memoryClipboard ? { nodes: structuredClone(memoryClipboard.nodes) } : null
}

/** Writes to the system clipboard (best effort) and always to the in-memory fallback. */
export async function writeFragmentClipboard(fragment: GraphFragment): Promise<void> {
  setMemoryClipboard(fragment)
  try {
    await navigator.clipboard?.writeText(serializeFragment(fragment))
  } catch {
    /* the in-memory copy is enough */
  }
}

/** Reads from the system clipboard, falling back to the in-memory copy. */
export async function readFragmentClipboard(): Promise<GraphFragment | null> {
  try {
    const text = await navigator.clipboard?.readText()
    const parsed = text ? parseFragment(text) : null
    if (parsed) return parsed
  } catch {
    /* permission denied or unsupported */
  }
  return getMemoryClipboard()
}

// ── frames ───────────────────────────────────────────────────────────────────────────────────────

export const FRAME_COLORS = ['#64748b', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7']

/** Is the node's box inside the frame? Frame membership is geometric, never stored. */
export function nodeInFrame(node: Pick<GraphNode, 'x' | 'y'>, frame: GraphFrame): boolean {
  const cx = node.x + NODE_WIDTH / 2
  const cy = node.y + NODE_HEIGHT / 2
  return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h
}

export function nodesInFrame(graph: EventGraph, frameId: string): GraphNode[] {
  const frame = graph.frames.find((f) => f.id === frameId)
  return frame ? graph.nodes.filter((n) => n.type !== GRAPH_START && nodeInFrame(n, frame)) : []
}

/** Wraps the nodes in a new frame (with some padding). */
export function addFrameAround(graph: EventGraph, ids: readonly string[], title = 'Group', idFn: IdFn = newId): { graph: EventGraph; id: string | null } {
  const chosen = graph.nodes.filter((n) => ids.includes(n.id))
  if (chosen.length === 0) return { graph, id: null }
  const pad = 32
  const x = Math.min(...chosen.map((n) => n.x)) - pad
  const y = Math.min(...chosen.map((n) => n.y)) - pad - 24
  const frame: GraphFrame = {
    id: idFn(),
    title,
    color: FRAME_COLORS[graph.frames.length % FRAME_COLORS.length],
    x: snapToGrid(x),
    y: snapToGrid(y),
    w: snapToGrid(Math.max(...chosen.map((n) => n.x + NODE_WIDTH)) + pad - x),
    h: snapToGrid(Math.max(...chosen.map((n) => n.y + NODE_HEIGHT)) + pad - y),
  }
  return { graph: { ...graph, frames: [...graph.frames, frame] }, id: frame.id }
}

export function updateFrame(graph: EventGraph, id: string, patch: Partial<Omit<GraphFrame, 'id'>>): EventGraph {
  if (!graph.frames.some((f) => f.id === id)) return graph
  return { ...graph, frames: graph.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) }
}

export function removeFrame(graph: EventGraph, id: string): EventGraph {
  return graph.frames.some((f) => f.id === id) ? { ...graph, frames: graph.frames.filter((f) => f.id !== id) } : graph
}

/** Moves a frame and every node inside it by (dx, dy). */
export function moveFrame(graph: EventGraph, id: string, dx: number, dy: number): EventGraph {
  const frame = graph.frames.find((f) => f.id === id)
  if (!frame || (dx === 0 && dy === 0)) return graph
  const inside = new Set(nodesInFrame(graph, id).map((n) => n.id))
  return {
    frames: graph.frames.map((f) => (f.id === id ? { ...f, x: f.x + dx, y: f.y + dy } : f)),
    nodes: graph.nodes.map((n) => (inside.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
  }
}

/** Is the node one the user may delete or copy (everything but `start`)? */
export const isEditableNode = (node: Pick<GraphNode, 'type'>): boolean => node.type !== GRAPH_START

/** Types offered in the palette besides the catalog commands. */
export const STRUCTURAL_PALETTE = [
  { type: GRAPH_END, label: 'End', description: 'Stop the event here.' },
  { type: GRAPH_JUNCTION, label: 'Reroute', description: 'A point to bend a wire around, or the start of a loop.' },
] as const
